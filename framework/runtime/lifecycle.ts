/**
 * Process Lifecycle Management
 *
 * Handles application startup, shutdown, and signal handling.
 * Provides hooks for graceful shutdown of resources.
 */

import { SignalHandlerManager } from './signals.ts';

export type LifecycleHook = () => Promise<void> | void;
export type ConfigReloadHook = () => Promise<void> | void;

export interface LifecycleEvents {
  onStart: LifecycleHook[];
  onReady: LifecycleHook[];
  onShutdown: LifecycleHook[];
  onError: ((error: Error) => void)[];
  onConfigReload: ConfigReloadHook[];
}

export interface LifecycleOptions {
  shutdownTimeout?: number;
  enableConfigReload?: boolean;
  enableDebugDump?: boolean;
}

/**
 * Lifecycle manager for Echelon applications
 */
export class Lifecycle {
  private events: LifecycleEvents = {
    onStart: [],
    onReady: [],
    onShutdown: [],
    onError: [],
    onConfigReload: [],
  };

  private abortController: AbortController;
  private isShuttingDown = false;
  private shutdownTimeout: number;
  private signalManager?: SignalHandlerManager;
  private options: LifecycleOptions;

  constructor(options: LifecycleOptions = {}) {
    this.options = options;
    this.abortController = new AbortController();
    this.shutdownTimeout = options.shutdownTimeout ?? 30000; // 30 seconds default
    this.setupSignalHandlers();
    this.setupExtendedSignalHandlers();
  }

  /**
   * Get the abort signal for graceful shutdown
   */
  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  /**
   * Register a hook to run on application start
   */
  onStart(hook: LifecycleHook): void {
    this.events.onStart.push(hook);
  }

  /**
   * Register a hook to run when application is ready
   */
  onReady(hook: LifecycleHook): void {
    this.events.onReady.push(hook);
  }

  /**
   * Register a hook to run on graceful shutdown
   */
  onShutdown(hook: LifecycleHook): void {
    this.events.onShutdown.push(hook);
  }

  /**
   * Register an error handler
   */
  onError(handler: (error: Error) => void): void {
    this.events.onError.push(handler);
  }

  /**
   * Register a hook to run on config reload (SIGHUP)
   */
  onConfigReload(hook: ConfigReloadHook): void {
    this.events.onConfigReload.push(hook);
  }

  /**
   * Emit the start event
   */
  async emitStart(): Promise<void> {
    for (const hook of this.events.onStart) {
      await hook();
    }
  }

  /**
   * Emit the ready event
   */
  async emitReady(): Promise<void> {
    for (const hook of this.events.onReady) {
      await hook();
    }
  }

  /**
   * Trigger graceful shutdown
   */
  async shutdown(reason?: string): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log(`Shutting down${reason ? `: ${reason}` : ''}...`);

    // Signal abort to all listeners
    this.abortController.abort();

    // Set up force shutdown timeout
    const forceShutdown = setTimeout(() => {
      console.error('Shutdown timeout exceeded, forcing exit');
      Deno.exit(1);
    }, this.shutdownTimeout);

    try {
      // Run shutdown hooks in reverse order (LIFO)
      for (const hook of [...this.events.onShutdown].reverse()) {
        await hook();
      }
      console.log('Shutdown complete');
    } catch (error) {
      console.error('Error during shutdown:', error);
    } finally {
      clearTimeout(forceShutdown);
    }
  }

  /**
   * Handle an error
   */
  handleError(error: Error): void {
    for (const handler of this.events.onError) {
      handler(error);
    }
  }

  /**
   * Emit the config reload event
   */
  async emitConfigReload(): Promise<void> {
    console.log('Reloading configuration...');
    for (const hook of this.events.onConfigReload) {
      try {
        await hook();
      } catch (error) {
        console.error('Error in config reload hook:', error);
        this.handleError(error instanceof Error ? error : new Error(String(error)));
      }
    }
    console.log('Configuration reloaded');
  }

  /**
   * Set up signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    // Handle SIGINT (Ctrl+C)
    Deno.addSignalListener('SIGINT', () => {
      this.shutdown('Received SIGINT');
    });

    // Handle SIGTERM (kill)
    Deno.addSignalListener('SIGTERM', () => {
      this.shutdown('Received SIGTERM');
    });
  }

  /**
   * Set up extended signal handlers using SignalHandlerManager
   */
  private setupExtendedSignalHandlers(): void {
    // Only set up if extended signal handling is enabled
    if (this.options.enableConfigReload === false && this.options.enableDebugDump === false) {
      return;
    }

    this.signalManager = new SignalHandlerManager({
      enableConfigReload: this.options.enableConfigReload ?? true,
      enableDebugDump: this.options.enableDebugDump ?? true,
      onConfigReload: async () => {
        await this.emitConfigReload();
      },
    });

    // Start the signal manager
    this.signalManager.start();
  }

  /**
   * Stop extended signal handlers
   */
  stopSignalHandlers(): void {
    if (this.signalManager) {
      this.signalManager.stop();
    }
  }

  /**
   * Get the signal manager (if extended signals are enabled)
   */
  getSignalManager(): SignalHandlerManager | undefined {
    return this.signalManager;
  }
}
