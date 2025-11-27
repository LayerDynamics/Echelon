/**
 * Startup Tracker
 *
 * Tracks startup phase durations for observability and performance monitoring.
 * Each phase represents a distinct initialization step in the application lifecycle.
 */

import type {
  StartupPhase,
  StartupPhaseEventPayload,
  StartupCompleteEventPayload,
} from './events.ts';

// Re-export StartupPhase for convenience
export type { StartupPhase } from './events.ts';

// ============================================================================
// Types
// ============================================================================

/**
 * Phase timing information
 */
export interface PhaseInfo {
  phase: StartupPhase;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  error?: Error;
}

/**
 * Startup report with all phase timings
 */
export interface StartupReport {
  totalDuration: number;
  phases: Array<{
    phase: StartupPhase;
    duration: number;
    success: boolean;
  }>;
  startTime: Date;
  endTime: Date;
  success: boolean;
  failedPhase?: StartupPhase;
}

/**
 * Event listener type for phase events
 */
export type PhaseEventListener = (payload: StartupPhaseEventPayload) => void;
export type CompleteEventListener = (payload: StartupCompleteEventPayload) => void;

// ============================================================================
// Startup Tracker
// ============================================================================

/**
 * Tracks startup phase durations and provides reporting
 *
 * @example
 * ```typescript
 * const tracker = new StartupTracker();
 *
 * tracker.startPhase('init');
 * await initializeApp();
 * tracker.endPhase('init');
 *
 * // Or use the async wrapper
 * await tracker.phase('config', async () => {
 *   await loadConfig();
 * });
 *
 * const report = tracker.getReport();
 * console.log(`Startup took ${report.totalDuration}ms`);
 * ```
 */
export class StartupTracker {
  private phases: Map<StartupPhase, PhaseInfo> = new Map();
  private phaseOrder: StartupPhase[] = [];
  private startTime: number = 0;
  private endTime: number = 0;
  private currentPhase: StartupPhase | null = null;
  private completed = false;

  // Event listeners
  private phaseStartListeners: PhaseEventListener[] = [];
  private phaseEndListeners: PhaseEventListener[] = [];
  private completeListeners: CompleteEventListener[] = [];

  /**
   * Start tracking a phase
   *
   * @param phase - The phase to start
   * @throws Error if phase already started or tracker is completed
   */
  startPhase(phase: StartupPhase): void {
    if (this.completed) {
      throw new Error('StartupTracker has already completed');
    }

    if (this.phases.has(phase)) {
      throw new Error(`Phase '${phase}' has already been started`);
    }

    if (this.currentPhase !== null) {
      throw new Error(
        `Cannot start phase '${phase}' while phase '${this.currentPhase}' is still in progress`
      );
    }

    const now = performance.now();

    // Set overall start time on first phase
    if (this.startTime === 0) {
      this.startTime = now;
    }

    const info: PhaseInfo = {
      phase,
      startTime: now,
      success: false,
    };

    this.phases.set(phase, info);
    this.phaseOrder.push(phase);
    this.currentPhase = phase;

    // Emit phase start event
    this.emitPhaseStart(phase);
  }

  /**
   * End tracking a phase
   *
   * @param phase - The phase to end
   * @param success - Whether the phase completed successfully (default: true)
   * @param error - Optional error if phase failed
   * @throws Error if phase not started or already ended
   */
  endPhase(phase: StartupPhase, success = true, error?: Error): void {
    const info = this.phases.get(phase);

    if (!info) {
      throw new Error(`Phase '${phase}' has not been started`);
    }

    if (info.endTime !== undefined) {
      throw new Error(`Phase '${phase}' has already ended`);
    }

    const now = performance.now();
    info.endTime = now;
    info.duration = now - info.startTime;
    info.success = success;
    info.error = error;

    if (this.currentPhase === phase) {
      this.currentPhase = null;
    }

    // Emit phase end event
    this.emitPhaseEnd(phase, info);
  }

  /**
   * Track a phase with an async function
   *
   * Automatically starts the phase, executes the function, and ends the phase.
   * If the function throws, the phase is marked as failed.
   *
   * @param phase - The phase to track
   * @param fn - The async function to execute
   * @returns The result of the function
   */
  async phase<T>(phase: StartupPhase, fn: () => Promise<T>): Promise<T> {
    this.startPhase(phase);

    try {
      const result = await fn();
      this.endPhase(phase, true);
      return result;
    } catch (error) {
      this.endPhase(phase, false, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Track a phase with a synchronous function
   *
   * @param phase - The phase to track
   * @param fn - The function to execute
   * @returns The result of the function
   */
  phaseSync<T>(phase: StartupPhase, fn: () => T): T {
    this.startPhase(phase);

    try {
      const result = fn();
      this.endPhase(phase, true);
      return result;
    } catch (error) {
      this.endPhase(phase, false, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Mark startup as complete
   *
   * Call this after all phases have been tracked to finalize timing.
   */
  complete(): void {
    if (this.completed) {
      return;
    }

    if (this.currentPhase !== null) {
      throw new Error(
        `Cannot complete startup while phase '${this.currentPhase}' is still in progress`
      );
    }

    this.endTime = performance.now();
    this.completed = true;

    // Emit complete event
    this.emitComplete();
  }

  /**
   * Get the startup report
   *
   * @returns StartupReport with all phase timings
   */
  getReport(): StartupReport {
    const phases = this.phaseOrder.map((phase) => {
      const info = this.phases.get(phase)!;
      return {
        phase,
        duration: info.duration ?? 0,
        success: info.success,
      };
    });

    const totalDuration = this.completed
      ? this.endTime - this.startTime
      : performance.now() - this.startTime;

    const failedPhase = phases.find((p) => !p.success)?.phase;
    const success = !failedPhase;

    return {
      totalDuration,
      phases,
      startTime: new Date(Date.now() - totalDuration),
      endTime: new Date(),
      success,
      failedPhase,
    };
  }

  /**
   * Get timing for a specific phase
   *
   * @param phase - The phase to get timing for
   * @returns PhaseInfo or undefined if phase not tracked
   */
  getPhase(phase: StartupPhase): PhaseInfo | undefined {
    return this.phases.get(phase);
  }

  /**
   * Check if a phase has been completed
   *
   * @param phase - The phase to check
   * @returns true if phase has started and ended
   */
  isPhaseComplete(phase: StartupPhase): boolean {
    const info = this.phases.get(phase);
    return info !== undefined && info.endTime !== undefined;
  }

  /**
   * Check if startup tracking is complete
   */
  isComplete(): boolean {
    return this.completed;
  }

  /**
   * Get the current in-progress phase
   */
  getCurrentPhase(): StartupPhase | null {
    return this.currentPhase;
  }

  /**
   * Get total elapsed time since first phase started
   */
  getElapsedTime(): number {
    if (this.startTime === 0) {
      return 0;
    }
    return (this.completed ? this.endTime : performance.now()) - this.startTime;
  }

  /**
   * Reset the tracker for reuse
   */
  reset(): void {
    this.phases.clear();
    this.phaseOrder = [];
    this.startTime = 0;
    this.endTime = 0;
    this.currentPhase = null;
    this.completed = false;
  }

  // ============================================================================
  // Event Listeners
  // ============================================================================

  /**
   * Add listener for phase start events
   */
  onPhaseStart(listener: PhaseEventListener): () => void {
    this.phaseStartListeners.push(listener);
    return () => {
      const idx = this.phaseStartListeners.indexOf(listener);
      if (idx >= 0) this.phaseStartListeners.splice(idx, 1);
    };
  }

  /**
   * Add listener for phase end events
   */
  onPhaseEnd(listener: PhaseEventListener): () => void {
    this.phaseEndListeners.push(listener);
    return () => {
      const idx = this.phaseEndListeners.indexOf(listener);
      if (idx >= 0) this.phaseEndListeners.splice(idx, 1);
    };
  }

  /**
   * Add listener for startup complete event
   */
  onComplete(listener: CompleteEventListener): () => void {
    this.completeListeners.push(listener);
    return () => {
      const idx = this.completeListeners.indexOf(listener);
      if (idx >= 0) this.completeListeners.splice(idx, 1);
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private emitPhaseStart(phase: StartupPhase): void {
    const payload: StartupPhaseEventPayload = {
      phase,
      success: false, // Not yet complete
      timestamp: new Date(),
    };

    for (const listener of this.phaseStartListeners) {
      try {
        listener(payload);
      } catch {
        // Ignore listener errors
      }
    }
  }

  private emitPhaseEnd(phase: StartupPhase, info: PhaseInfo): void {
    const payload: StartupPhaseEventPayload = {
      phase,
      duration: info.duration,
      success: info.success,
      error: info.error,
      timestamp: new Date(),
    };

    for (const listener of this.phaseEndListeners) {
      try {
        listener(payload);
      } catch {
        // Ignore listener errors
      }
    }
  }

  private emitComplete(): void {
    const report = this.getReport();
    const payload: StartupCompleteEventPayload = {
      totalDuration: report.totalDuration,
      phases: report.phases,
      timestamp: new Date(),
    };

    for (const listener of this.completeListeners) {
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

let instance: StartupTracker | null = null;

/**
 * Get the global startup tracker instance
 *
 * @returns The global StartupTracker instance
 */
export function getStartupTracker(): StartupTracker {
  if (!instance) {
    instance = new StartupTracker();
  }
  return instance;
}

/**
 * Reset the global startup tracker instance
 * Primarily used for testing
 */
export function resetStartupTracker(): void {
  if (instance) {
    instance.reset();
  }
  instance = null;
}
