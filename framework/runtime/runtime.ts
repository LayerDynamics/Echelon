/**
 * Echelon Runtime Interface
 *
 * The main runtime interface that combines all Layer 0 components.
 * Provides a unified API for accessing runtime capabilities.
 */

import { Lifecycle } from './lifecycle.ts';
import { Environment, type EnvironmentInfo, type RuntimeInfo, type FeatureFlags } from './environment.ts';
import { checkPermissions, queryPermission, type PermissionDescriptor } from './permissions.ts';
import { StartupTracker, getStartupTracker, type StartupReport, type StartupPhase } from './startup_tracker.ts';
import { RuntimeMetricsCollector, getRuntimeMetrics, type RuntimeMetricsSnapshot, type CpuUsageInfo } from './runtime_metrics.ts';
import { SignalHandlerManager, getSignalHandler } from './signals.ts';
import { WorkerPool, getWorkerPool, type PoolStats } from './worker_pool.ts';
import { RuntimeEvents } from './events.ts';

/**
 * CPU usage information
 */
export interface CpuUsage {
  user: number;
  system: number;
  percentage: number;
}

/**
 * Worker creation options
 *
 * Note: Deno only supports module workers (type: 'module').
 * The type option has been removed as 'module' is always used.
 */
export interface CreateWorkerOptions {
  /**
   * Worker script URL or module specifier.
   *
   * IMPORTANT: Must be an absolute URL or use import.meta.resolve().
   * Relative paths are not supported in Deno without --location flag.
   *
   * @example
   * ```typescript
   * // Using import.meta.resolve for relative paths
   * script: import.meta.resolve("./my-worker.ts")
   *
   * // Using absolute URL
   * script: "https://example.com/worker.ts"
   * ```
   */
  script?: string;
  /**
   * Deno-specific permission options for worker sandboxing.
   * If not specified, workers inherit all permissions from parent.
   *
   * @example
   * ```typescript
   * permissions: {
   *   net: false,
   *   read: ["./data/"],
   *   write: false,
   * }
   * ```
   */
  permissions?: Deno.PermissionOptions;
}

export interface EchelonRuntime {
  readonly version: {
    deno: string;
    v8: string;
    typescript: string;
    echelon: string;
  };
  readonly environment: EnvironmentInfo;
  readonly runtime: RuntimeInfo;
  readonly features: FeatureFlags;
  readonly lifecycle: Lifecycle;
  readonly permissions: {
    check(permissions: PermissionDescriptor[]): Promise<void>;
    query(permission: PermissionDescriptor): Promise<Deno.PermissionState>;
  };
  readonly resources: {
    memoryUsage(): Deno.MemoryUsage;
  };
  readonly startup: StartupTracker;
  readonly metrics: RuntimeMetricsCollector;
  readonly signals: SignalHandlerManager;
  readonly workerPool: WorkerPool;
}

/**
 * Runtime singleton for Echelon applications
 */
export class Runtime implements EchelonRuntime {
  private static _instance: Runtime;
  private _lifecycle: Lifecycle;
  private _startup: StartupTracker;
  private _metrics: RuntimeMetricsCollector;
  private _signals: SignalHandlerManager;
  private _workerPool: WorkerPool;
  private _startTime: number;
  private _restartCallbacks: (() => Promise<void> | void)[] = [];

  private constructor() {
    this._lifecycle = new Lifecycle();
    this._startup = getStartupTracker();
    this._metrics = getRuntimeMetrics();
    this._signals = getSignalHandler();
    this._workerPool = getWorkerPool();
    this._startTime = Date.now();
  }

  /**
   * Get the singleton runtime instance
   */
  static get instance(): Runtime {
    if (!Runtime._instance) {
      Runtime._instance = new Runtime();
    }
    return Runtime._instance;
  }

  /**
   * Version information
   */
  get version() {
    return {
      deno: Deno.version.deno,
      v8: Deno.version.v8,
      typescript: Deno.version.typescript,
      echelon: '0.1.0',
    };
  }

  /**
   * Environment information
   */
  get environment(): EnvironmentInfo {
    return Environment.instance.info;
  }

  /**
   * Runtime information
   */
  get runtime(): RuntimeInfo {
    return Environment.instance.runtime;
  }

  /**
   * Feature flags
   */
  get features(): FeatureFlags {
    return Environment.instance.features;
  }

  /**
   * Lifecycle manager
   */
  get lifecycle(): Lifecycle {
    return this._lifecycle;
  }

  /**
   * Permission utilities
   */
  get permissions() {
    return {
      check: checkPermissions,
      query: queryPermission,
    };
  }

  /**
   * Resource utilities
   */
  get resources() {
    return {
      memoryUsage: () => Deno.memoryUsage(),
    };
  }

  /**
   * Startup tracker
   */
  get startup(): StartupTracker {
    return this._startup;
  }

  /**
   * Runtime metrics collector
   */
  get metrics(): RuntimeMetricsCollector {
    return this._metrics;
  }

  /**
   * Signal handler manager
   */
  get signals(): SignalHandlerManager {
    return this._signals;
  }

  /**
   * Worker pool for CPU-bound tasks
   */
  get workerPool(): WorkerPool {
    return this._workerPool;
  }

  /**
   * Initialize the runtime
   */
  async initialize(): Promise<void> {
    // Start tracking initialization
    this._startup.startPhase('init');

    await this._lifecycle.emitStart();

    // Start metrics collection
    this._metrics.start();

    // Start signal handling
    this._signals.start();

    this._startup.endPhase('init');
  }

  /**
   * Mark the runtime as ready
   */
  async ready(): Promise<void> {
    this._startup.startPhase('ready');
    await this._lifecycle.emitReady();
    this._startup.endPhase('ready');
    this._startup.complete();
  }

  /**
   * Shutdown the runtime
   */
  async shutdown(reason?: string): Promise<void> {
    // Stop metrics collection
    this._metrics.stop();

    // Stop signal handling
    this._signals.stop();

    // Shutdown worker pool
    await this._workerPool.shutdown();

    await this._lifecycle.shutdown(reason);
  }

  /**
   * Request a graceful restart
   *
   * Triggers all registered restart callbacks before shutting down.
   * The actual restart must be handled by the process manager.
   */
  async restart(): Promise<void> {
    console.log('Restart requested...');

    // Run restart callbacks
    for (const callback of this._restartCallbacks) {
      try {
        await callback();
      } catch (error) {
        console.error('Error in restart callback:', error);
      }
    }

    // Shutdown with restart reason
    await this.shutdown('restart requested');

    // Exit with code 0 for graceful restart
    // Process managers like systemd can be configured to restart on exit
    Deno.exit(0);
  }

  /**
   * Register a callback to run before restart
   */
  onRestart(callback: () => Promise<void> | void): () => void {
    this._restartCallbacks.push(callback);
    return () => {
      const idx = this._restartCallbacks.indexOf(callback);
      if (idx >= 0) this._restartCallbacks.splice(idx, 1);
    };
  }

  /**
   * Create a new Web Worker
   *
   * Deno only supports module workers (type: 'module').
   *
   * IMPORTANT: The script path must be an absolute URL or use import.meta.resolve().
   * Relative paths are not supported without the --location flag.
   *
   * @param options Worker creation options
   * @returns A new Worker instance
   *
   * @example
   * ```typescript
   * // Using import.meta.resolve for relative paths
   * const worker = runtime.createWorker({
   *   script: import.meta.resolve("./my-worker.ts")
   * });
   *
   * // With permission sandboxing
   * const sandboxedWorker = runtime.createWorker({
   *   script: import.meta.resolve("./worker.ts"),
   *   permissions: { net: false, write: false }
   * });
   * ```
   */
  createWorker(options: CreateWorkerOptions = {}): Worker {
    const script = options.script ?? '';

    // Build worker options with Deno-specific permissions if configured
    const workerOptions: WorkerOptions & { deno?: { permissions?: Deno.PermissionOptions } } = {
      type: 'module', // Deno only supports module workers
    };

    if (options.permissions) {
      workerOptions.deno = { permissions: options.permissions };
    }

    if (script) {
      return new Worker(script, workerOptions);
    }

    // Create a default no-op worker using data URL
    // Note: Data URL workers cannot use relative imports
    const moduleScript = 'self.onmessage = (e) => self.postMessage(e.data);';
    const dataUrl = `data:application/javascript;base64,${btoa(moduleScript)}`;
    return new Worker(dataUrl, workerOptions);
  }

  /**
   * Check if a runtime feature is available
   *
   * @param feature The feature name to check
   * @returns true if the feature is available
   */
  hasFeature(feature: string): boolean {
    const features = this.features;

    switch (feature) {
      case 'kv':
        return features.kv;
      case 'cron':
        return features.cron;
      case 'websocket':
        return features.websocket;
      case 'ffi':
        return features.ffi;
      case 'wasm':
        return true; // WASM is always available in Deno
      case 'workers':
        return features.workers;
      case 'signals':
        return features.signals;
      case 'signals-extended':
      case 'SIGUSR1':
      case 'SIGUSR2':
        return features.signalsExtended;
      default:
        return false;
    }
  }

  /**
   * Get current CPU usage
   *
   * Note: This is an approximation as Deno doesn't have direct CPU usage API
   *
   * @returns CPU usage information
   */
  cpuUsage(): CpuUsage {
    const snapshot = this._metrics.getSnapshot();
    return {
      user: snapshot.cpu.user,
      system: snapshot.cpu.system,
      percentage: snapshot.cpu.percentage,
    };
  }

  /**
   * Get uptime in milliseconds
   */
  uptime(): number {
    return Date.now() - this._startTime;
  }

  /**
   * Get startup report
   */
  getStartupReport(): StartupReport {
    return this._startup.getReport();
  }

  /**
   * Get runtime metrics snapshot
   */
  async getMetricsSnapshot(): Promise<RuntimeMetricsSnapshot> {
    return await this._metrics.collectNow();
  }

  /**
   * Get worker pool statistics
   */
  getWorkerPoolStats(): PoolStats {
    return this._workerPool.getStats();
  }

  /**
   * Submit a task to the worker pool
   *
   * @param type Task type
   * @param data Task data
   * @param options Task options
   * @returns Task result
   */
  async submitTask<T = unknown, R = unknown>(
    type: string,
    data: T,
    options?: { timeout?: number; priority?: number }
  ): Promise<R> {
    if (!this._workerPool.isStarted()) {
      await this._workerPool.start();
    }
    return await this._workerPool.submit<T, R>(type, data, options);
  }
}

// Re-export types
export type { StartupReport, StartupPhase, RuntimeMetricsSnapshot, CpuUsageInfo, PoolStats };
export { RuntimeEvents };

// Export singleton getter
export function getRuntime(): Runtime {
  return Runtime.instance;
}
