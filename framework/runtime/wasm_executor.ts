/**
 * WASM Executor
 *
 * Handles WebAssembly module instantiation and function execution.
 * Provides host function registration and import object building.
 */

import type {
  WASMModule,
  WASMExecutionResult,
  WASMExecutionOptions,
  WASMHostFunction,
  WASMHostFunctionDescriptor,
  WASMFunctionSignature,
  WASMInstantiationOptions,
} from './wasm_types.ts';
import { WASMEvents } from './wasm_types.ts';
import { EventEmitter } from '../plugin/events.ts';
import { WASMMemoryManager } from './wasm_memory.ts';
import { getLogger } from '../telemetry/logger.ts';

const logger = getLogger();

/**
 * Import configuration for building import objects
 */
export interface ImportConfig {
  env?: Record<string, unknown>;
  memory?: WebAssembly.Memory;
  table?: WebAssembly.Table;
  customImports?: Record<string, Record<string, unknown>>;
  includeHostFunctions?: boolean;
  allowedHostFunctions?: string[];
}

/**
 * WASM Executor
 *
 * Handles instantiation and execution of WASM modules.
 */
export class WASMExecutor {
  private hostFunctions: Map<string, WASMHostFunctionDescriptor> = new Map();
  private events: EventEmitter;
  private memoryManager: WASMMemoryManager;
  private instances: Map<string, WebAssembly.Instance> = new Map();

  constructor(events: EventEmitter, memoryManager: WASMMemoryManager) {
    this.events = events;
    this.memoryManager = memoryManager;
    this.registerDefaultHostFunctions();
  }

  /**
   * Instantiate a WASM module
   */
  async instantiate(
    module: WASMModule,
    options: WASMInstantiationOptions = {}
  ): Promise<WebAssembly.Instance> {
    const imports = options.imports ?? this.buildImports({
      memory: options.memory,
      table: options.table,
      includeHostFunctions: true,
    });

    try {
      const instance = await WebAssembly.instantiate(module.compiledModule, imports);

      // Store instance reference
      this.instances.set(module.id, instance);
      module.instance = instance;

      // Get memory from instance if not provided
      if (!module.memory && instance.exports.memory) {
        module.memory = instance.exports.memory as WebAssembly.Memory;
      }

      this.events.emit(WASMEvents.MODULE_INSTANTIATED, {
        moduleId: module.id,
        exports: Object.keys(instance.exports),
      });

      logger.debug(`Instantiated WASM module: ${module.id}`);

      return instance;
    } catch (error) {
      this.events.emit(WASMEvents.MODULE_ERROR, {
        moduleId: module.id,
        error: error instanceof Error ? error.message : String(error),
        phase: 'instantiation',
      });
      throw new Error(`Failed to instantiate module ${module.id}: ${error}`);
    }
  }

  /**
   * Load and instantiate WASM from URL using streaming APIs.
   *
   * Per Deno 2.1+ best practices: WebAssembly.instantiateStreaming is the most
   * efficient way to fetch, compile, and instantiate a WASM module in one operation.
   *
   * @see https://docs.deno.com/runtime/reference/wasm/
   */
  async instantiateFromURLStreaming(
    url: string,
    moduleId: string,
    options: WASMInstantiationOptions = {}
  ): Promise<{ module: WebAssembly.Module; instance: WebAssembly.Instance }> {
    const imports = options.imports ?? this.buildImports({
      memory: options.memory,
      table: options.table,
      includeHostFunctions: true,
    });

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Combined streaming fetch + compile + instantiate
      const result = await WebAssembly.instantiateStreaming(response, imports);

      // Store instance reference
      this.instances.set(moduleId, result.instance);

      // Get memory from instance if available
      const memory = result.instance.exports.memory as WebAssembly.Memory | undefined;

      this.events.emit(WASMEvents.MODULE_INSTANTIATED, {
        moduleId,
        exports: Object.keys(result.instance.exports),
        streaming: true,
      });

      logger.debug(`Instantiated WASM module via streaming: ${moduleId}`);

      return { module: result.module, instance: result.instance };
    } catch (error) {
      this.events.emit(WASMEvents.MODULE_ERROR, {
        moduleId,
        error: error instanceof Error ? error.message : String(error),
        phase: 'streaming-instantiation',
      });
      throw new Error(`Failed to stream-instantiate from URL '${url}': ${error}`);
    }
  }

  /**
   * Execute a function from a WASM module
   */
  async execute<T = unknown>(
    module: WASMModule,
    funcName: string,
    args: unknown[] = [],
    options: WASMExecutionOptions = {}
  ): Promise<WASMExecutionResult<T>> {
    const startTime = performance.now();
    const startMemory = this.memoryManager.getStats(module.id).used;

    this.events.emit(WASMEvents.EXEC_START, {
      moduleId: module.id,
      function: funcName,
      args,
    });

    try {
      // Ensure module is instantiated
      let instance = module.instance;
      if (!instance) {
        instance = await this.instantiate(module);
      }

      // Get the function
      const func = instance.exports[funcName];
      if (typeof func !== 'function') {
        throw new Error(`Export '${funcName}' is not a function`);
      }

      // Execute with optional timeout
      let result: T;
      if (options.timeout) {
        result = await this.executeWithTimeout(func, args, options.timeout);
      } else {
        result = func(...args) as T;
      }

      const duration = performance.now() - startTime;
      const endMemory = this.memoryManager.getStats(module.id).used;

      // Update module stats
      module.info.lastExecuted = new Date();
      module.info.executionCount++;

      this.events.emit(WASMEvents.EXEC_COMPLETE, {
        moduleId: module.id,
        function: funcName,
        duration,
        memoryUsed: endMemory - startMemory,
      });

      return {
        success: true,
        value: result,
        duration,
        memoryUsed: endMemory - startMemory,
      };
    } catch (error) {
      const duration = performance.now() - startTime;

      if (error instanceof TimeoutError) {
        this.events.emit(WASMEvents.EXEC_TIMEOUT, {
          moduleId: module.id,
          function: funcName,
          timeout: options.timeout,
        });
      } else {
        this.events.emit(WASMEvents.EXEC_ERROR, {
          moduleId: module.id,
          function: funcName,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        duration,
        memoryUsed: 0,
      };
    }
  }

  /**
   * Execute with timeout
   */
  private executeWithTimeout<T>(
    func: Function,
    args: unknown[],
    timeout: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new TimeoutError(`Execution timed out after ${timeout}ms`));
      }, timeout);

      try {
        const result = func(...args);

        // Handle async functions
        if (result instanceof Promise) {
          result
            .then((value) => {
              clearTimeout(timeoutId);
              resolve(value as T);
            })
            .catch((error) => {
              clearTimeout(timeoutId);
              reject(error);
            });
        } else {
          clearTimeout(timeoutId);
          resolve(result as T);
        }
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Call a function directly on an instance
   */
  call<T = unknown>(
    instance: WebAssembly.Instance,
    funcName: string,
    args: unknown[] = []
  ): T {
    const func = instance.exports[funcName];
    if (typeof func !== 'function') {
      throw new Error(`Export '${funcName}' is not a function`);
    }
    return func(...args) as T;
  }

  /**
   * Register a host function
   */
  registerHostFunction(descriptor: WASMHostFunctionDescriptor): void {
    const key = `${descriptor.module}.${descriptor.name}`;
    this.hostFunctions.set(key, descriptor);
    logger.debug(`Registered host function: ${key}`);
  }

  /**
   * Unregister a host function
   */
  unregisterHostFunction(module: string, name: string): void {
    const key = `${module}.${name}`;
    this.hostFunctions.delete(key);
  }

  /**
   * Get all registered host functions
   */
  getHostFunctions(): Map<string, WASMHostFunctionDescriptor> {
    return new Map(this.hostFunctions);
  }

  /**
   * Build import object for WASM instantiation
   */
  buildImports(config: ImportConfig = {}): WebAssembly.Imports {
    const imports: WebAssembly.Imports = {};

    // Add env namespace
    imports.env = {
      ...this.buildEnvImports(),
      ...(config.env || {}),
    } as WebAssembly.ModuleImports;

    // Add memory if provided
    if (config.memory) {
      imports.env.memory = config.memory;
    }

    // Add table if provided
    if (config.table) {
      imports.env.table = config.table;
    }

    // Add host functions
    if (config.includeHostFunctions !== false) {
      for (const [key, descriptor] of this.hostFunctions) {
        // Check if function is allowed
        if (config.allowedHostFunctions &&
            !config.allowedHostFunctions.includes(key)) {
          continue;
        }

        // Create module namespace if needed
        if (!imports[descriptor.module]) {
          imports[descriptor.module] = {};
        }

        // Wrap async functions if needed
        const func = descriptor.async
          ? this.wrapAsyncHostFunction(descriptor.func)
          : descriptor.func;

        (imports[descriptor.module] as Record<string, unknown>)[descriptor.name] = func;
      }
    }

    // Add custom imports
    if (config.customImports) {
      for (const [module, funcs] of Object.entries(config.customImports)) {
        if (!imports[module]) {
          imports[module] = {};
        }
        Object.assign(imports[module] as object, funcs);
      }
    }

    return imports;
  }

  /**
   * Build default env imports
   */
  private buildEnvImports(): Record<string, unknown> {
    return {
      // Abort handler
      abort: (msg: number, file: number, line: number, col: number) => {
        logger.error('WASM abort called', new Error('WASM abort'), {
          msg, file, line, col,
        });
        throw new Error(`WASM abort at ${file}:${line}:${col}`);
      },

      // Memory operations (for AssemblyScript compatibility)
      'memory.size': () => {
        // Returns memory size in pages
        return 0;
      },

      'memory.grow': (pages: number) => {
        // Grow memory
        return -1; // Fail by default, modules should use their own memory
      },
    };
  }

  /**
   * Wrap an async host function for WASM compatibility
   */
  private wrapAsyncHostFunction(func: WASMHostFunction): WASMHostFunction {
    return (...args: unknown[]) => {
      const result = func(...args);
      if (result instanceof Promise) {
        // Note: WASM cannot directly await promises
        // This returns a promise that the host must handle
        logger.warn('Async host function called from WASM - result is a Promise');
      }
      return result;
    };
  }

  /**
   * Register default host functions
   */
  private registerDefaultHostFunctions(): void {
    // Console functions
    this.registerHostFunction({
      name: 'log',
      module: 'console',
      func: (ptr: number, len: number) => {
        // Note: Actual implementation needs memory access
        console.log('[WASM]', ptr, len);
      },
      signature: { params: ['i32', 'i32'], results: [] },
    });

    this.registerHostFunction({
      name: 'error',
      module: 'console',
      func: (ptr: number, len: number) => {
        console.error('[WASM Error]', ptr, len);
      },
      signature: { params: ['i32', 'i32'], results: [] },
    });

    // Time functions
    this.registerHostFunction({
      name: 'now',
      module: 'time',
      func: () => Date.now(),
      signature: { params: [], results: ['f64'] },
    });

    this.registerHostFunction({
      name: 'performance_now',
      module: 'time',
      func: () => performance.now(),
      signature: { params: [], results: ['f64'] },
    });

    // Math functions (beyond WASM builtins)
    this.registerHostFunction({
      name: 'random',
      module: 'math',
      func: () => Math.random(),
      signature: { params: [], results: ['f64'] },
    });

    // Crypto functions
    this.registerHostFunction({
      name: 'getRandomValues',
      module: 'crypto',
      func: (ptr: number, len: number) => {
        // Note: Actual implementation needs memory access
        return 0;
      },
      signature: { params: ['i32', 'i32'], results: ['i32'] },
    });
  }

  /**
   * Create a function wrapper with type checking
   */
  createTypedFunction<TArgs extends unknown[], TResult>(
    instance: WebAssembly.Instance,
    funcName: string,
    _signature: WASMFunctionSignature
  ): (...args: TArgs) => TResult {
    const func = instance.exports[funcName];
    if (typeof func !== 'function') {
      throw new Error(`Export '${funcName}' is not a function`);
    }

    return (...args: TArgs): TResult => {
      // Type validation could be added here
      return func(...args) as TResult;
    };
  }

  /**
   * Get an instance by module ID
   */
  getInstance(moduleId: string): WebAssembly.Instance | undefined {
    return this.instances.get(moduleId);
  }

  /**
   * Remove instance reference
   */
  removeInstance(moduleId: string): void {
    this.instances.delete(moduleId);
  }

  /**
   * Check if a function exists in a module
   */
  hasFunction(module: WASMModule, funcName: string): boolean {
    if (!module.instance) return false;
    return typeof module.instance.exports[funcName] === 'function';
  }

  /**
   * Get all exported functions from a module
   */
  getExportedFunctions(module: WASMModule): string[] {
    if (!module.instance) return [];
    return Object.entries(module.instance.exports)
      .filter(([_, value]) => typeof value === 'function')
      .map(([name]) => name);
  }

  /**
   * Get all exported globals from a module
   */
  getExportedGlobals(module: WASMModule): Array<{ name: string; value: unknown }> {
    if (!module.instance) return [];
    return Object.entries(module.instance.exports)
      .filter(([_, value]) => value instanceof WebAssembly.Global)
      .map(([name, global]) => ({
        name,
        value: (global as WebAssembly.Global).value,
      }));
  }

  /**
   * Reset executor state
   */
  reset(): void {
    this.instances.clear();
    this.hostFunctions.clear();
    this.registerDefaultHostFunctions();
  }
}

/**
 * Custom timeout error
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}
