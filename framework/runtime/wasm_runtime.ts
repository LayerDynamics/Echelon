/**
 * WASM Runtime Core
 *
 * Main orchestrator for the WebAssembly runtime subsystem.
 * Coordinates module loading, execution, memory management, and sandboxing.
 */

import type {
  WASMSource,
  WASMModule,
  WASMModuleInfo,
  WASMExecutionResult,
  WASMExecutionOptions,
  WASMMemoryStats,
  WASMSandbox,
  WASMSandboxConfig,
  WASMHostFunctionDescriptor,
  WASMInstantiationOptions,
} from './wasm_types.ts';
import { WASMEvents, DEFAULT_WASM_CAPABILITIES } from './wasm_types.ts';
import { WASMModuleLoader, type WASMLoaderOptions } from './wasm_module_loader.ts';
import { WASMExecutor, type ImportConfig } from './wasm_executor.ts';
import { WASMMemoryManager } from './wasm_memory.ts';
import { WASMSandboxManager } from './wasm_sandbox.ts';
import { NativeWASMRegistry, type NativeWASMModule } from './wasm_native_loader.ts';
import { EventEmitter } from '../plugin/events.ts';
import { Lifecycle } from './lifecycle.ts';
import { getLogger } from '../telemetry/logger.ts';
import { getMetrics } from '../telemetry/metrics.ts';

const logger = getLogger();
const metrics = getMetrics();

/**
 * WASM Runtime configuration
 */
export interface WASMRuntimeConfig {
  // Memory configuration
  globalMemoryLimit?: number;      // Global memory limit in bytes (default: 256MB)
  defaultModuleMemoryLimit?: number; // Default per-module limit (default: 16MB)

  // Execution configuration
  defaultTimeout?: number;         // Default execution timeout in ms (default: 5000)
  maxConcurrentExecutions?: number; // Max concurrent WASM executions (default: 100)

  // Loader configuration
  loaderOptions?: WASMLoaderOptions;

  // Default sandbox configuration
  defaultSandboxConfig?: Partial<WASMSandboxConfig>;

  // Feature flags
  enableSandboxing?: boolean;      // Enable sandboxing by default (default: true)
  enableMetrics?: boolean;         // Enable metrics collection (default: true)

  // Deno 2.1+ Features (per WASM best practices documentation)
  /**
   * Use streaming compilation for URL sources by default.
   * More memory-efficient and faster per Deno docs.
   * @see https://docs.deno.com/runtime/reference/wasm/
   * @default true
   */
  preferStreamingCompilation?: boolean;

  /**
   * Enable native WASM import support via NativeWASMRegistry.
   * Allows using Deno 2.1+ `import { fn } from "./module.wasm"` syntax.
   * @see https://docs.deno.com/runtime/reference/wasm/
   * @default false
   */
  enableNativeImports?: boolean;
}

/**
 * Runtime state
 */
type RuntimeState = 'uninitialized' | 'initializing' | 'ready' | 'shutting_down' | 'shutdown';

/**
 * WASM Runtime Core
 *
 * Main entry point for WASM execution and management.
 */
export class WASMRuntimeCore {
  // Sub-components
  private loader: WASMModuleLoader;
  private executor: WASMExecutor;
  private memoryManager: WASMMemoryManager;
  private sandboxManager: WASMSandboxManager;
  private events: EventEmitter;
  private lifecycle: Lifecycle;

  // Module management
  private loadedModules: Map<string, WASMModule> = new Map();

  // Configuration
  private config: Required<WASMRuntimeConfig>;

  // State
  private state: RuntimeState = 'uninitialized';
  private activeExecutions = 0;

  // Metrics
  private metricsEnabled: boolean;
  private executionCounter = metrics.counter({
    name: 'wasm_executions_total',
    help: 'Total WASM function executions',
    labels: ['module', 'function', 'status'],
  });
  private executionDuration = metrics.histogram({
    name: 'wasm_execution_duration_seconds',
    help: 'WASM execution duration in seconds',
    labels: ['module', 'function'],
  });
  private moduleGauge = metrics.gauge({
    name: 'wasm_modules_loaded',
    help: 'Number of loaded WASM modules',
  });

  constructor(events: EventEmitter, lifecycle: Lifecycle, config: WASMRuntimeConfig = {}) {
    this.events = events;
    this.lifecycle = lifecycle;

    // Set default configuration
    this.config = {
      globalMemoryLimit: config.globalMemoryLimit ?? 256 * 1024 * 1024,
      defaultModuleMemoryLimit: config.defaultModuleMemoryLimit ?? 16 * 1024 * 1024,
      defaultTimeout: config.defaultTimeout ?? 5000,
      maxConcurrentExecutions: config.maxConcurrentExecutions ?? 100,
      loaderOptions: config.loaderOptions ?? {},
      defaultSandboxConfig: config.defaultSandboxConfig ?? {},
      enableSandboxing: config.enableSandboxing ?? true,
      enableMetrics: config.enableMetrics ?? true,
    };

    this.metricsEnabled = this.config.enableMetrics;

    // Initialize sub-components
    this.memoryManager = new WASMMemoryManager(events, this.config.globalMemoryLimit);
    this.loader = new WASMModuleLoader(events, this.config.loaderOptions);
    this.executor = new WASMExecutor(events, this.memoryManager);
    this.sandboxManager = new WASMSandboxManager(events, this.memoryManager);

    // Register lifecycle hooks
    this.registerLifecycleHooks();
  }

  /**
   * Initialize the WASM runtime
   */
  async initialize(): Promise<void> {
    if (this.state !== 'uninitialized') {
      throw new Error(`Cannot initialize runtime in state: ${this.state}`);
    }

    this.state = 'initializing';
    logger.info('Initializing WASM runtime');

    try {
      // Emit initialization event
      await this.events.emit(WASMEvents.RUNTIME_INIT, {
        config: this.config,
      });

      this.state = 'ready';

      await this.events.emit(WASMEvents.RUNTIME_READY, {
        timestamp: new Date(),
      });

      logger.info('WASM runtime initialized and ready');
    } catch (error) {
      this.state = 'uninitialized';
      await this.events.emit(WASMEvents.RUNTIME_ERROR, {
        phase: 'initialization',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Shutdown the WASM runtime
   */
  async shutdown(): Promise<void> {
    if (this.state === 'shutdown' || this.state === 'shutting_down') {
      return;
    }

    this.state = 'shutting_down';
    logger.info('Shutting down WASM runtime');

    try {
      // Wait for active executions to complete (with timeout)
      await this.waitForExecutions(5000);

      // Unload all modules
      for (const moduleId of this.loadedModules.keys()) {
        await this.unloadModule(moduleId);
      }

      // Destroy all sandboxes
      this.sandboxManager.destroyAllSandboxes();

      // Reset memory
      this.memoryManager.reset();

      // Reset executor
      this.executor.reset();

      // Clear loader cache
      this.loader.invalidateCache();

      await this.events.emit(WASMEvents.RUNTIME_SHUTDOWN, {
        timestamp: new Date(),
      });

      this.state = 'shutdown';
      logger.info('WASM runtime shutdown complete');
    } catch (error) {
      logger.error('Error during WASM runtime shutdown', error as Error);
      this.state = 'shutdown';
      throw error;
    }
  }

  /**
   * Load a WASM module
   */
  async loadModule(source: WASMSource): Promise<WASMModule> {
    this.ensureReady();

    const module = await this.loader.load(source);
    this.loadedModules.set(module.id, module);

    // Set default memory limit for module
    this.memoryManager.setModuleLimit(module.id, this.config.defaultModuleMemoryLimit);

    // Update metrics
    if (this.metricsEnabled) {
      this.moduleGauge.set(this.loadedModules.size);
    }

    return module;
  }

  /**
   * Load and instantiate a WASM module
   */
  async loadAndInstantiate(
    source: WASMSource,
    options: WASMInstantiationOptions = {}
  ): Promise<WASMModule> {
    const module = await this.loadModule(source);
    await this.instantiateModule(module.id, options);
    return module;
  }

  /**
   * Instantiate a loaded module
   */
  async instantiateModule(
    moduleId: string,
    options: WASMInstantiationOptions = {}
  ): Promise<WebAssembly.Instance> {
    this.ensureReady();

    const module = this.loadedModules.get(moduleId);
    if (!module) {
      throw new Error(`Module not found: ${moduleId}`);
    }

    // Apply sandbox configuration if enabled
    if (this.config.enableSandboxing && options.sandboxId) {
      const sandbox = this.sandboxManager.getSandbox(options.sandboxId);
      if (sandbox) {
        this.sandboxManager.assignModule(moduleId, options.sandboxId);
        options.memory = sandbox.memory;
      }
    }

    return await this.executor.instantiate(module, options);
  }

  /**
   * Unload a WASM module
   */
  async unloadModule(moduleId: string): Promise<void> {
    const module = this.loadedModules.get(moduleId);
    if (!module) return;

    // Remove from sandbox
    this.sandboxManager.unassignModule(moduleId);

    // Remove instance from executor
    this.executor.removeInstance(moduleId);

    // Free memory
    this.memoryManager.freeMemory(moduleId);

    // Remove from loaded modules
    this.loadedModules.delete(moduleId);

    // Invalidate cache
    this.loader.invalidateCache(moduleId);

    await this.events.emit(WASMEvents.MODULE_UNLOADED, { moduleId });

    // Update metrics
    if (this.metricsEnabled) {
      this.moduleGauge.set(this.loadedModules.size);
    }

    logger.debug(`Unloaded WASM module: ${moduleId}`);
  }

  /**
   * Get a loaded module
   */
  getModule(moduleId: string): WASMModule | undefined {
    return this.loadedModules.get(moduleId);
  }

  /**
   * List all loaded modules
   */
  listModules(): WASMModuleInfo[] {
    return Array.from(this.loadedModules.values()).map(m => m.info);
  }

  /**
   * Execute a function from a WASM module
   */
  async execute<T = unknown>(
    moduleId: string,
    funcName: string,
    args: unknown[] = [],
    options: WASMExecutionOptions = {}
  ): Promise<WASMExecutionResult<T>> {
    this.ensureReady();

    const module = this.loadedModules.get(moduleId);
    if (!module) {
      return {
        success: false,
        error: new Error(`Module not found: ${moduleId}`),
        duration: 0,
        memoryUsed: 0,
      };
    }

    // Check concurrent execution limit
    if (this.activeExecutions >= this.config.maxConcurrentExecutions) {
      return {
        success: false,
        error: new Error('Max concurrent WASM executions reached'),
        duration: 0,
        memoryUsed: 0,
      };
    }

    // Check sandbox capabilities
    if (this.config.enableSandboxing) {
      const sandbox = this.sandboxManager.getSandboxForModule(moduleId);
      if (sandbox && !this.sandboxManager.hasCapability(moduleId, 'host-functions')) {
        // Check if function requires host functions
        const imports = module.info.imports;
        if (imports.length > 0) {
          return {
            success: false,
            error: new Error('Module requires host functions but capability not granted'),
            duration: 0,
            memoryUsed: 0,
          };
        }
      }
    }

    // Set default timeout
    const timeout = options.timeout ?? this.config.defaultTimeout;

    // Track execution
    this.activeExecutions++;
    const timer = this.metricsEnabled
      ? this.executionDuration.startTimer({ module: moduleId, function: funcName })
      : null;

    try {
      const result = await this.executor.execute<T>(module, funcName, args, {
        ...options,
        timeout,
      });

      // Record sandbox execution
      if (this.config.enableSandboxing) {
        this.sandboxManager.recordExecution(moduleId, result.duration);
      }

      // Update metrics
      if (this.metricsEnabled) {
        this.executionCounter.inc({
          module: moduleId,
          function: funcName,
          status: result.success ? 'success' : 'error',
        });
      }

      return result;
    } finally {
      this.activeExecutions--;
      if (timer) timer();
    }
  }

  /**
   * Execute with timeout
   */
  executeWithTimeout<T = unknown>(
    moduleId: string,
    funcName: string,
    args: unknown[],
    timeout: number
  ): Promise<WASMExecutionResult<T>> {
    return this.execute<T>(moduleId, funcName, args, { timeout });
  }

  /**
   * Create a sandbox
   */
  createSandbox(config?: Partial<WASMSandboxConfig>): WASMSandbox {
    const fullConfig: WASMSandboxConfig = {
      memoryLimit: config?.memoryLimit ?? this.config.defaultModuleMemoryLimit,
      capabilities: config?.capabilities ?? [...DEFAULT_WASM_CAPABILITIES],
      ...this.config.defaultSandboxConfig,
      ...config,
    };

    return this.sandboxManager.createSandbox(fullConfig);
  }

  /**
   * Get a sandbox
   */
  getSandbox(sandboxId: string): WASMSandbox | undefined {
    return this.sandboxManager.getSandbox(sandboxId);
  }

  /**
   * Destroy a sandbox
   */
  destroySandbox(sandboxId: string): void {
    this.sandboxManager.destroySandbox(sandboxId);
  }

  /**
   * Assign module to sandbox
   */
  assignModuleToSandbox(moduleId: string, sandboxId: string): void {
    this.sandboxManager.assignModule(moduleId, sandboxId);
  }

  /**
   * Register a host function
   */
  registerHostFunction(descriptor: WASMHostFunctionDescriptor): void {
    this.executor.registerHostFunction(descriptor);
  }

  /**
   * Get memory statistics
   */
  getMemoryUsage(moduleId?: string): WASMMemoryStats {
    return this.memoryManager.getStats(moduleId);
  }

  /**
   * Set memory limit for a module
   */
  setMemoryLimit(moduleId: string, limit: number): void {
    this.memoryManager.setModuleLimit(moduleId, limit);
  }

  /**
   * Get runtime state
   */
  getState(): RuntimeState {
    return this.state;
  }

  /**
   * Check if runtime is ready
   */
  isReady(): boolean {
    return this.state === 'ready';
  }

  /**
   * Get runtime statistics
   */
  getStats(): {
    state: RuntimeState;
    loadedModules: number;
    activeExecutions: number;
    totalMemory: number;
    sandboxes: number;
    cacheSize: number;
  } {
    return {
      state: this.state,
      loadedModules: this.loadedModules.size,
      activeExecutions: this.activeExecutions,
      totalMemory: this.memoryManager.getStats().allocated,
      sandboxes: this.sandboxManager.getSandboxIds().length,
      cacheSize: this.loader.getCacheStats().size,
    };
  }

  /**
   * Build import object for module instantiation
   */
  buildImports(config: ImportConfig): WebAssembly.Imports {
    return this.executor.buildImports(config);
  }

  /**
   * Check if a module has a specific function
   */
  hasFunction(moduleId: string, funcName: string): boolean {
    const module = this.loadedModules.get(moduleId);
    if (!module) return false;
    return this.executor.hasFunction(module, funcName);
  }

  /**
   * Get exported functions from a module
   */
  getExportedFunctions(moduleId: string): string[] {
    const module = this.loadedModules.get(moduleId);
    if (!module) return [];
    return this.executor.getExportedFunctions(module);
  }

  /**
   * Preload modules from configuration
   */
  async preloadModules(sources: WASMSource[]): Promise<void> {
    logger.info(`Preloading ${sources.length} WASM modules`);
    const results = await this.loader.preloadModules(sources);
    for (const [id, module] of results) {
      this.loadedModules.set(id, module);
    }
    if (this.metricsEnabled) {
      this.moduleGauge.set(this.loadedModules.size);
    }
  }

  /**
   * Get the memory manager
   */
  getMemoryManager(): WASMMemoryManager {
    return this.memoryManager;
  }

  /**
   * Get the sandbox manager
   */
  getSandboxManager(): WASMSandboxManager {
    return this.sandboxManager;
  }

  /**
   * Get the module loader
   */
  getLoader(): WASMModuleLoader {
    return this.loader;
  }

  /**
   * Get the executor
   */
  getExecutor(): WASMExecutor {
    return this.executor;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Ensure runtime is in ready state
   */
  private ensureReady(): void {
    if (this.state !== 'ready') {
      throw new Error(`WASM runtime is not ready (state: ${this.state})`);
    }
  }

  /**
   * Wait for active executions to complete
   */
  private async waitForExecutions(timeout: number): Promise<void> {
    const start = Date.now();
    while (this.activeExecutions > 0) {
      if (Date.now() - start > timeout) {
        logger.warn(`Timeout waiting for ${this.activeExecutions} executions to complete`);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Register lifecycle hooks
   */
  private registerLifecycleHooks(): void {
    // Initialize on app start
    this.lifecycle.onStart(async () => {
      if (this.state === 'uninitialized') {
        await this.initialize();
      }
    });

    // Shutdown on app shutdown
    this.lifecycle.onShutdown(async () => {
      await this.shutdown();
    });
  }
}

/**
 * Create a new WASM runtime instance
 */
export function createWASMRuntime(
  events: EventEmitter,
  lifecycle: Lifecycle,
  config?: WASMRuntimeConfig
): WASMRuntimeCore {
  return new WASMRuntimeCore(events, lifecycle, config);
}
