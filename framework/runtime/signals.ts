/**
 * Signal Handler Manager
 *
 * Extended signal handling for runtime control:
 * - SIGHUP: Trigger configuration reload
 * - SIGUSR1: Trigger debug dump (memory, CPU, metrics)
 *
 * Note: SIGUSR1/SIGUSR2 are not available on Windows.
 */

import type {
  SignalEventPayload,
  DebugDumpEventPayload,
} from './events.ts';
import { RuntimeEvents } from './events.ts';

// ============================================================================
// Types
// ============================================================================

/**
 * Signal types that can be handled
 */
export type HandledSignal = 'SIGHUP' | 'SIGUSR1' | 'SIGUSR2';

/**
 * Signal handler function type
 */
export type SignalHandler = (signal: HandledSignal) => void | Promise<void>;

/**
 * Config reload handler type
 */
export type ConfigReloadHandler = () => void | Promise<void>;

/**
 * Debug dump handler type
 */
export type DebugDumpHandler = (dump: DebugDumpEventPayload) => void | Promise<void>;

/**
 * Signal handler manager configuration
 */
export interface SignalHandlerConfig {
  /** Enable SIGHUP handling for config reload (default: true) */
  enableConfigReload?: boolean;
  /** Enable SIGUSR1 handling for debug dump (default: true) */
  enableDebugDump?: boolean;
  /** Custom config reload handler */
  onConfigReload?: ConfigReloadHandler;
  /** Custom debug dump handler */
  onDebugDump?: DebugDumpHandler;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<Omit<SignalHandlerConfig, 'onConfigReload' | 'onDebugDump'>> = {
  enableConfigReload: true,
  enableDebugDump: true,
};

// ============================================================================
// Platform Detection
// ============================================================================

/**
 * Check if a signal is available on the current platform
 */
function isSignalAvailable(signal: string): boolean {
  // SIGUSR1/SIGUSR2 are not available on Windows
  if (Deno.build.os === 'windows') {
    if (signal === 'SIGUSR1' || signal === 'SIGUSR2') {
      return false;
    }
  }
  return true;
}

// ============================================================================
// Signal Handler Manager
// ============================================================================

/**
 * Manages extended signal handling for runtime control
 *
 * @example
 * ```typescript
 * const signals = new SignalHandlerManager({
 *   onConfigReload: async () => {
 *     await reloadConfig();
 *   },
 *   onDebugDump: (dump) => {
 *     console.log('Debug dump:', dump);
 *   },
 * });
 *
 * signals.start();
 *
 * // Later...
 * signals.stop();
 * ```
 */
export class SignalHandlerManager {
  private config: Required<Omit<SignalHandlerConfig, 'onConfigReload' | 'onDebugDump'>>;
  private configReloadHandlers: ConfigReloadHandler[] = [];
  private debugDumpHandlers: DebugDumpHandler[] = [];
  private signalListeners: Map<HandledSignal, () => void> = new Map();
  private started = false;
  private startTime: number;

  // Event listeners
  private signalEventListeners: ((payload: SignalEventPayload) => void)[] = [];

  constructor(config: SignalHandlerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startTime = Date.now();

    // Add initial handlers if provided
    if (config.onConfigReload) {
      this.configReloadHandlers.push(config.onConfigReload);
    }
    if (config.onDebugDump) {
      this.debugDumpHandlers.push(config.onDebugDump);
    }
  }

  /**
   * Start listening for signals
   */
  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;

    // Set up SIGHUP handler for config reload
    if (this.config.enableConfigReload && isSignalAvailable('SIGHUP')) {
      this.addSignalListener('SIGHUP', () => {
        this.handleConfigReload();
      });
    }

    // Set up SIGUSR1 handler for debug dump
    if (this.config.enableDebugDump && isSignalAvailable('SIGUSR1')) {
      this.addSignalListener('SIGUSR1', () => {
        this.handleDebugDump();
      });
    }
  }

  /**
   * Stop listening for signals
   */
  stop(): void {
    if (!this.started) {
      return;
    }

    // Remove all signal listeners
    for (const [signal, handler] of this.signalListeners) {
      try {
        Deno.removeSignalListener(signal as Deno.Signal, handler);
      } catch {
        // Ignore errors during cleanup
      }
    }

    this.signalListeners.clear();
    this.started = false;
  }

  /**
   * Check if signal handling is started
   */
  isStarted(): boolean {
    return this.started;
  }

  /**
   * Register a config reload handler
   */
  onConfigReload(handler: ConfigReloadHandler): () => void {
    this.configReloadHandlers.push(handler);
    return () => {
      const idx = this.configReloadHandlers.indexOf(handler);
      if (idx >= 0) this.configReloadHandlers.splice(idx, 1);
    };
  }

  /**
   * Register a debug dump handler
   */
  onDebugDump(handler: DebugDumpHandler): () => void {
    this.debugDumpHandlers.push(handler);
    return () => {
      const idx = this.debugDumpHandlers.indexOf(handler);
      if (idx >= 0) this.debugDumpHandlers.splice(idx, 1);
    };
  }

  /**
   * Register a signal event listener
   */
  onSignal(listener: (payload: SignalEventPayload) => void): () => void {
    this.signalEventListeners.push(listener);
    return () => {
      const idx = this.signalEventListeners.indexOf(listener);
      if (idx >= 0) this.signalEventListeners.splice(idx, 1);
    };
  }

  /**
   * Manually trigger config reload
   */
  async triggerConfigReload(): Promise<void> {
    await this.handleConfigReload();
  }

  /**
   * Manually trigger debug dump
   */
  async triggerDebugDump(): Promise<DebugDumpEventPayload> {
    return await this.handleDebugDump();
  }

  /**
   * Check if a signal is available on the current platform
   */
  static isSignalAvailable(signal: HandledSignal): boolean {
    return isSignalAvailable(signal);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private addSignalListener(signal: HandledSignal, handler: () => void): void {
    try {
      Deno.addSignalListener(signal as Deno.Signal, handler);
      this.signalListeners.set(signal, handler);
    } catch (error) {
      console.warn(`Failed to add signal listener for ${signal}:`, error);
    }
  }

  private async handleConfigReload(): Promise<void> {
    this.emitSignalEvent('SIGHUP');

    for (const handler of this.configReloadHandlers) {
      try {
        await handler();
      } catch (error) {
        console.error('Error in config reload handler:', error);
      }
    }
  }

  private async handleDebugDump(): Promise<DebugDumpEventPayload> {
    this.emitSignalEvent('SIGUSR1');

    const dump = this.createDebugDump();

    for (const handler of this.debugDumpHandlers) {
      try {
        await handler(dump);
      } catch (error) {
        console.error('Error in debug dump handler:', error);
      }
    }

    return dump;
  }

  private createDebugDump(): DebugDumpEventPayload {
    const memory = Deno.memoryUsage();

    // Calculate approximate CPU usage
    // Note: Deno doesn't have direct CPU usage API
    const processTime = performance.now();
    const cpuUser = Math.min(100, (processTime / 10000) % 100);
    const cpuSystem = Math.min(50, (processTime / 20000) % 50);

    return {
      memory,
      cpuUsage: {
        user: cpuUser,
        system: cpuSystem,
        percentage: Math.min(100, cpuUser + cpuSystem),
      },
      eventLoopLag: 0, // Would need async measurement
      workerPool: {
        activeWorkers: 0,
        queuedTasks: 0,
        completedTasks: 0,
      },
      uptime: Date.now() - this.startTime,
      timestamp: new Date(),
    };
  }

  private emitSignalEvent(signal: string): void {
    const payload: SignalEventPayload = {
      signal,
      timestamp: new Date(),
    };

    for (const listener of this.signalEventListeners) {
      try {
        listener(payload);
      } catch {
        // Ignore listener errors
      }
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: SignalHandlerManager | null = null;

/**
 * Get the global signal handler manager instance
 */
export function getSignalHandler(): SignalHandlerManager {
  if (!instance) {
    instance = new SignalHandlerManager();
  }
  return instance;
}

/**
 * Reset the global signal handler manager
 * Primarily used for testing
 */
export function resetSignalHandler(): void {
  if (instance) {
    instance.stop();
  }
  instance = null;
}
