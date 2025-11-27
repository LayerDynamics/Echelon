/**
 * Conditional Breakpoints
 *
 * Provides conditional breakpoints that pause execution and allow
 * inspection when certain conditions are met during debugging.
 */

import { DebugModule, DebugLevel } from './levels.ts';
import { DebugOutput, getDebugOutput } from './output.ts';
import { DebugEvent } from './debugger.ts';

// ============================================================================
// Breakpoint Condition Types
// ============================================================================

export type BreakpointConditionFn = (context: BreakpointContext) => boolean;

export interface BreakpointContext {
  module: DebugModule;
  level: DebugLevel;
  message: string;
  data?: unknown;
  requestId?: string;
  event?: DebugEvent;
  timestamp: number;
}

// ============================================================================
// Breakpoint Configuration
// ============================================================================

export interface BreakpointConfig {
  id: string;
  name: string;
  enabled: boolean;
  condition: BreakpointConditionFn;
  hitCount: number;
  maxHits?: number;
  modules?: DebugModule[];
  levels?: DebugLevel[];
  action: BreakpointAction;
}

export type BreakpointAction =
  | 'log'        // Just log when hit
  | 'pause'      // Pause execution (async/await based)
  | 'inspect'    // Log detailed inspection
  | 'callback';  // Call a custom callback

export interface BreakpointCallbackContext extends BreakpointContext {
  breakpoint: BreakpointConfig;
  resume: () => void;
}

export type BreakpointCallback = (ctx: BreakpointCallbackContext) => void | Promise<void>;

// ============================================================================
// Breakpoint Manager
// ============================================================================

export class BreakpointManager {
  private breakpoints: Map<string, BreakpointConfig> = new Map();
  private callbacks: Map<string, BreakpointCallback> = new Map();
  private output: DebugOutput;
  private paused: boolean = false;
  private pauseResolver: (() => void) | null = null;

  constructor(output?: DebugOutput) {
    this.output = output ?? getDebugOutput();
  }

  // ==========================================================================
  // Breakpoint Management
  // ==========================================================================

  /**
   * Add a new breakpoint
   */
  add(config: Omit<BreakpointConfig, 'hitCount'>): string {
    const id = config.id ?? crypto.randomUUID();
    const breakpoint: BreakpointConfig = {
      ...config,
      id,
      hitCount: 0,
    };
    this.breakpoints.set(id, breakpoint);
    return id;
  }

  /**
   * Remove a breakpoint
   */
  remove(id: string): boolean {
    this.callbacks.delete(id);
    return this.breakpoints.delete(id);
  }

  /**
   * Enable a breakpoint
   */
  enable(id: string): boolean {
    const bp = this.breakpoints.get(id);
    if (bp) {
      bp.enabled = true;
      return true;
    }
    return false;
  }

  /**
   * Disable a breakpoint
   */
  disable(id: string): boolean {
    const bp = this.breakpoints.get(id);
    if (bp) {
      bp.enabled = false;
      return true;
    }
    return false;
  }

  /**
   * Toggle a breakpoint
   */
  toggle(id: string): boolean {
    const bp = this.breakpoints.get(id);
    if (bp) {
      bp.enabled = !bp.enabled;
      return bp.enabled;
    }
    return false;
  }

  /**
   * Clear all breakpoints
   */
  clear(): void {
    this.breakpoints.clear();
    this.callbacks.clear();
  }

  /**
   * Get all breakpoints
   */
  getAll(): BreakpointConfig[] {
    return Array.from(this.breakpoints.values());
  }

  /**
   * Get a specific breakpoint
   */
  get(id: string): BreakpointConfig | undefined {
    return this.breakpoints.get(id);
  }

  /**
   * Set callback for a breakpoint
   */
  setCallback(id: string, callback: BreakpointCallback): void {
    this.callbacks.set(id, callback);
  }

  // ==========================================================================
  // Breakpoint Checking
  // ==========================================================================

  /**
   * Check if any breakpoints should trigger for given context
   */
  async check(context: BreakpointContext): Promise<boolean> {
    let triggered = false;

    for (const bp of this.breakpoints.values()) {
      if (!bp.enabled) continue;

      // Check module filter
      if (bp.modules && bp.modules.length > 0) {
        if (!bp.modules.includes(context.module)) continue;
      }

      // Check level filter
      if (bp.levels && bp.levels.length > 0) {
        if (!bp.levels.includes(context.level)) continue;
      }

      // Check max hits
      if (bp.maxHits !== undefined && bp.hitCount >= bp.maxHits) continue;

      // Check condition
      try {
        if (!bp.condition(context)) continue;
      } catch (err) {
        console.error(`Breakpoint condition error (${bp.id}):`, err);
        continue;
      }

      // Breakpoint triggered!
      bp.hitCount++;
      triggered = true;

      await this.handleBreakpoint(bp, context);
    }

    return triggered;
  }

  /**
   * Handle a triggered breakpoint
   */
  private async handleBreakpoint(
    bp: BreakpointConfig,
    context: BreakpointContext,
  ): Promise<void> {
    switch (bp.action) {
      case 'log':
        this.logBreakpoint(bp, context);
        break;

      case 'pause':
        this.logBreakpoint(bp, context);
        await this.pause();
        break;

      case 'inspect':
        this.inspectBreakpoint(bp, context);
        break;

      case 'callback': {
        const callback = this.callbacks.get(bp.id);
        if (callback) {
          const resume = () => this.resume();
          await callback({ ...context, breakpoint: bp, resume });
        }
        break;
      }
    }
  }

  /**
   * Log a breakpoint hit
   */
  private logBreakpoint(bp: BreakpointConfig, context: BreakpointContext): void {
    const header = this.output.formatHeader(`BREAKPOINT: ${bp.name}`, '[BP]');
    console.log('\n' + header);
    console.log(`  ID: ${bp.id}`);
    console.log(`  Hit count: ${bp.hitCount}`);
    console.log(`  Module: ${context.module}`);
    console.log(`  Level: ${context.level}`);
    console.log(`  Message: ${context.message}`);
    if (context.data !== undefined) {
      console.log(`  Data: ${this.output.formatValue(context.data)}`);
    }
    if (context.requestId) {
      console.log(`  Request ID: ${context.requestId}`);
    }
    console.log(this.output.formatFooter());
  }

  /**
   * Detailed inspection at breakpoint
   */
  private inspectBreakpoint(bp: BreakpointConfig, context: BreakpointContext): void {
    this.logBreakpoint(bp, context);

    // Additional inspection info
    console.log('\n--- Inspection Details ---');
    console.log(`Timestamp: ${new Date(context.timestamp).toISOString()}`);

    if (context.data !== undefined) {
      console.log('\nData Inspection:');
      console.log(this.output.formatBox(
        this.output.formatValue(context.data),
        'Context Data',
      ));
    }

    if (context.event) {
      console.log('\nEvent Details:');
      console.log(this.output.formatBox(
        this.output.formatValue(context.event),
        'Debug Event',
      ));
    }

    // Stack trace
    const stack = new Error().stack;
    if (stack) {
      console.log('\nCall Stack:');
      const lines = stack.split('\n').slice(2, 8);
      console.log(lines.map(l => `  ${l.trim()}`).join('\n'));
    }

    console.log('\n--- End Inspection ---\n');
  }

  // ==========================================================================
  // Pause/Resume
  // ==========================================================================

  /**
   * Pause execution (for 'pause' action breakpoints)
   */
  pause(): Promise<void> {
    if (this.paused) return Promise.resolve();

    this.paused = true;
    console.log('\n[PAUSED] Execution paused at breakpoint.');
    console.log('[PAUSED] Call debugger.resume() or breakpointManager.resume() to continue.\n');

    return new Promise<void>((resolve) => {
      this.pauseResolver = resolve;
    });
  }

  /**
   * Resume execution after pause
   */
  resume(): void {
    if (!this.paused) return;

    this.paused = false;
    console.log('\n[RESUMED] Execution resumed.\n');

    if (this.pauseResolver) {
      this.pauseResolver();
      this.pauseResolver = null;
    }
  }

  /**
   * Check if currently paused
   */
  isPaused(): boolean {
    return this.paused;
  }

  // ==========================================================================
  // Preset Breakpoints
  // ==========================================================================

  /**
   * Break on any error
   */
  breakOnError(): string {
    return this.add({
      id: 'break-on-error',
      name: 'Break on Error',
      enabled: true,
      condition: (ctx) => ctx.level === DebugLevel.ERROR,
      action: 'inspect',
    });
  }

  /**
   * Break on specific module
   */
  breakOnModule(module: DebugModule): string {
    return this.add({
      id: `break-on-${module}`,
      name: `Break on ${module}`,
      enabled: true,
      modules: [module],
      condition: () => true,
      action: 'log',
    });
  }

  /**
   * Break on message pattern
   */
  breakOnPattern(pattern: RegExp, name?: string): string {
    return this.add({
      id: `break-on-pattern-${pattern.source}`,
      name: name ?? `Break on /${pattern.source}/`,
      enabled: true,
      condition: (ctx) => pattern.test(ctx.message),
      action: 'log',
    });
  }

  /**
   * Break on slow operations (> threshold ms)
   */
  breakOnSlow(thresholdMs: number): string {
    return this.add({
      id: 'break-on-slow',
      name: `Break on Slow (>${thresholdMs}ms)`,
      enabled: true,
      condition: (ctx) => {
        if (ctx.event?.duration !== undefined) {
          return ctx.event.duration > thresholdMs;
        }
        return false;
      },
      action: 'inspect',
    });
  }

  /**
   * Break on specific request ID
   */
  breakOnRequest(requestId: string): string {
    return this.add({
      id: `break-on-request-${requestId}`,
      name: `Break on Request ${requestId.slice(0, 8)}...`,
      enabled: true,
      condition: (ctx) => ctx.requestId === requestId,
      action: 'log',
    });
  }

  /**
   * Break on auth failures
   */
  breakOnAuthFailure(): string {
    return this.add({
      id: 'break-on-auth-failure',
      name: 'Break on Auth Failure',
      enabled: true,
      modules: [DebugModule.AUTH],
      condition: (ctx) => {
        return ctx.message.toLowerCase().includes('fail') ||
               ctx.message.toLowerCase().includes('denied') ||
               ctx.message.toLowerCase().includes('unauthorized');
      },
      action: 'inspect',
    });
  }

  /**
   * Break on cache misses
   */
  breakOnCacheMiss(): string {
    return this.add({
      id: 'break-on-cache-miss',
      name: 'Break on Cache Miss',
      enabled: true,
      modules: [DebugModule.CACHE],
      condition: (ctx) => {
        return ctx.message.toLowerCase().includes('miss') ||
               ctx.event?.type === 'cache:miss';
      },
      action: 'log',
    });
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultBreakpointManager: BreakpointManager | null = null;

/**
 * Get the default breakpoint manager
 */
export function getBreakpointManager(): BreakpointManager {
  if (!defaultBreakpointManager) {
    defaultBreakpointManager = new BreakpointManager();
  }
  return defaultBreakpointManager;
}

/**
 * Create a new breakpoint manager
 */
export function createBreakpointManager(output?: DebugOutput): BreakpointManager {
  return new BreakpointManager(output);
}
