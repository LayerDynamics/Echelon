/**
 * Core Debugger
 *
 * Main debugger class that coordinates debug levels, output formatting,
 * breakpoints, and request lifecycle tracking.
 */

import { DebugLevel, DebugModule, DebugLevels, DebugConfig } from './levels.ts';
import {
  DebugOutput,
  OutputOptions,
  TimingEntry,
} from './output.ts';

// ============================================================================
// Debug Event Types
// ============================================================================

export type DebugEventType =
  | 'request:start'
  | 'request:end'
  | 'middleware:enter'
  | 'middleware:exit'
  | 'route:match'
  | 'route:miss'
  | 'controller:enter'
  | 'controller:exit'
  | 'orm:query'
  | 'orm:result'
  | 'auth:check'
  | 'auth:success'
  | 'auth:failure'
  | 'cache:get'
  | 'cache:set'
  | 'cache:hit'
  | 'cache:miss'
  | 'view:render'
  | 'job:start'
  | 'job:end'
  | 'search:query'
  | 'plugin:load'
  | 'plugin:event'
  | 'api:request'
  | 'api:response'
  | 'config:load'
  | 'security:check'
  | 'error';

export interface DebugEvent {
  type: DebugEventType;
  module: DebugModule;
  level: DebugLevel;
  message: string;
  data?: unknown;
  timestamp: number;
  requestId?: string;
  duration?: number;
  stack?: string;
}

// ============================================================================
// Debug Listener
// ============================================================================

export type DebugListener = (event: DebugEvent) => void;

// ============================================================================
// Request Context for Tracking
// ============================================================================

export interface DebugRequestContext {
  id: string;
  method: string;
  url: string;
  startTime: number;
  events: DebugEvent[];
  timings: TimingEntry[];
  metadata: Map<string, unknown>;
}

// ============================================================================
// Debugger Options
// ============================================================================

export interface DebuggerOptions {
  enabled: boolean;
  levels: Partial<DebugConfig>;
  output: Partial<OutputOptions>;
  captureStackTraces: boolean;
  maxEventsPerRequest: number;
  autoFlush: boolean;
  console: boolean;
}

const DEFAULT_OPTIONS: DebuggerOptions = {
  enabled: true,
  levels: {},
  output: {},
  captureStackTraces: false,
  maxEventsPerRequest: 1000,
  autoFlush: true,
  console: true,
};

// ============================================================================
// Core Debugger Class
// ============================================================================

export class Debugger {
  private enabled: boolean;
  private levels: DebugLevels;
  private output: DebugOutput;
  private options: DebuggerOptions;
  private listeners: Set<DebugListener> = new Set();
  private requests: Map<string, DebugRequestContext> = new Map();
  private currentTimingStack: TimingEntry[] = [];
  private globalEvents: DebugEvent[] = [];

  constructor(options?: Partial<DebuggerOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.enabled = this.options.enabled;
    this.levels = new DebugLevels(this.options.levels);
    this.output = new DebugOutput(this.options.output);
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Enable the debugger
   */
  enable(): this {
    this.enabled = true;
    return this;
  }

  /**
   * Disable the debugger
   */
  disable(): this {
    this.enabled = false;
    return this;
  }

  /**
   * Check if debugger is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Configure debug levels
   */
  configureLevels(config: Partial<DebugConfig>): this {
    if (config.globalLevel !== undefined) {
      this.levels.setLevel(config.globalLevel);
    }
    this.levels.configure(config);
    return this;
  }

  /**
   * Configure output formatting
   */
  configureOutput(options: Partial<OutputOptions>): this {
    this.output.configure(options);
    return this;
  }

  /**
   * Get the debug levels manager
   */
  getLevels(): DebugLevels {
    return this.levels;
  }

  /**
   * Get the output formatter
   */
  getOutput(): DebugOutput {
    return this.output;
  }

  /**
   * Set global debug level
   */
  setLevel(level: DebugLevel): this {
    this.levels.setLevel(level);
    return this;
  }

  /**
   * Set module-specific debug level
   */
  setModuleLevel(module: DebugModule, level: DebugLevel): this {
    this.levels.setModuleLevel(module, level);
    return this;
  }

  // ==========================================================================
  // Event Listeners
  // ==========================================================================

  /**
   * Add a debug event listener
   */
  addListener(listener: DebugListener): this {
    this.listeners.add(listener);
    return this;
  }

  /**
   * Remove a debug event listener
   */
  removeListener(listener: DebugListener): this {
    this.listeners.delete(listener);
    return this;
  }

  /**
   * Clear all listeners
   */
  clearListeners(): this {
    this.listeners.clear();
    return this;
  }

  // ==========================================================================
  // Core Logging Methods
  // ==========================================================================

  /**
   * Log a debug message
   */
  log(
    module: DebugModule,
    level: DebugLevel,
    message: string,
    data?: unknown,
    requestId?: string,
  ): void {
    if (!this.enabled) return;
    if (!this.levels.shouldLog(module, level)) return;

    const event: DebugEvent = {
      type: this.getEventTypeForLevel(level),
      module,
      level,
      message,
      data,
      timestamp: Date.now(),
      requestId,
    };

    if (this.options.captureStackTraces && level <= DebugLevel.ERROR) {
      event.stack = new Error().stack;
    }

    this.processEvent(event);
  }

  /**
   * Log an error
   */
  error(module: DebugModule, message: string, error?: Error, requestId?: string): void {
    this.log(module, DebugLevel.ERROR, message, error, requestId);
  }

  /**
   * Log a warning
   */
  warn(module: DebugModule, message: string, data?: unknown, requestId?: string): void {
    this.log(module, DebugLevel.WARN, message, data, requestId);
  }

  /**
   * Log an info message
   */
  info(module: DebugModule, message: string, data?: unknown, requestId?: string): void {
    this.log(module, DebugLevel.INFO, message, data, requestId);
  }

  /**
   * Log a debug message
   */
  debug(module: DebugModule, message: string, data?: unknown, requestId?: string): void {
    this.log(module, DebugLevel.DEBUG, message, data, requestId);
  }

  /**
   * Log a trace message
   */
  trace(module: DebugModule, message: string, data?: unknown, requestId?: string): void {
    this.log(module, DebugLevel.TRACE, message, data, requestId);
  }

  // ==========================================================================
  // Typed Event Logging
  // ==========================================================================

  /**
   * Emit a typed debug event
   */
  emit(
    type: DebugEventType,
    module: DebugModule,
    level: DebugLevel,
    message: string,
    options?: {
      data?: unknown;
      requestId?: string;
      duration?: number;
    },
  ): void {
    if (!this.enabled) return;
    if (!this.levels.shouldLog(module, level)) return;

    const event: DebugEvent = {
      type,
      module,
      level,
      message,
      data: options?.data,
      timestamp: Date.now(),
      requestId: options?.requestId,
      duration: options?.duration,
    };

    if (this.options.captureStackTraces && level <= DebugLevel.ERROR) {
      event.stack = new Error().stack;
    }

    this.processEvent(event);
  }

  // ==========================================================================
  // Request Lifecycle Tracking
  // ==========================================================================

  /**
   * Start tracking a request
   */
  startRequest(requestId: string, method: string, url: string): DebugRequestContext {
    const ctx: DebugRequestContext = {
      id: requestId,
      method,
      url,
      startTime: Date.now(),
      events: [],
      timings: [],
      metadata: new Map(),
    };

    this.requests.set(requestId, ctx);

    this.emit('request:start', DebugModule.HTTP, DebugLevel.INFO, `${method} ${url}`, {
      requestId,
      data: { method, url },
    });

    return ctx;
  }

  /**
   * End tracking a request
   */
  endRequest(requestId: string, status: number, size?: number): DebugRequestContext | undefined {
    const ctx = this.requests.get(requestId);
    if (!ctx) return undefined;

    const duration = Date.now() - ctx.startTime;

    this.emit('request:end', DebugModule.HTTP, DebugLevel.INFO, `${status} ${ctx.method} ${ctx.url}`, {
      requestId,
      duration,
      data: { status, size, duration },
    });

    // Print summary if auto-flush is enabled
    if (this.options.autoFlush && this.options.console) {
      this.printRequestSummary(ctx, status, duration, size);
    }

    this.requests.delete(requestId);
    return ctx;
  }

  /**
   * Get request context
   */
  getRequestContext(requestId: string): DebugRequestContext | undefined {
    return this.requests.get(requestId);
  }

  /**
   * Add metadata to request context
   */
  setRequestMetadata(requestId: string, key: string, value: unknown): void {
    const ctx = this.requests.get(requestId);
    if (ctx) {
      ctx.metadata.set(key, value);
    }
  }

  // ==========================================================================
  // Timing Tracking
  // ==========================================================================

  /**
   * Start timing an operation
   */
  startTiming(
    name: string,
    module: DebugModule,
    requestId?: string,
    metadata?: Record<string, unknown>,
  ): TimingEntry {
    const entry: TimingEntry = {
      name,
      module,
      startTime: performance.now(),
      children: [],
      metadata,
    };

    // Add to request context if tracking a request
    if (requestId) {
      const ctx = this.requests.get(requestId);
      if (ctx) {
        ctx.timings.push(entry);
      }
    }

    // Push to current timing stack
    this.currentTimingStack.push(entry);

    return entry;
  }

  /**
   * End timing an operation
   */
  endTiming(entry: TimingEntry): number {
    entry.endTime = performance.now();
    entry.duration = entry.endTime - entry.startTime;

    // Pop from stack
    const idx = this.currentTimingStack.indexOf(entry);
    if (idx >= 0) {
      this.currentTimingStack.splice(idx, 1);
    }

    return entry.duration;
  }

  /**
   * Time an async operation
   */
  async time<T>(
    name: string,
    module: DebugModule,
    fn: () => Promise<T>,
    requestId?: string,
  ): Promise<T> {
    const entry = this.startTiming(name, module, requestId);
    try {
      return await fn();
    } finally {
      const duration = this.endTiming(entry);
      this.trace(module, `${name} completed`, { duration: `${duration.toFixed(2)}ms` }, requestId);
    }
  }

  /**
   * Time a sync operation
   */
  timeSync<T>(
    name: string,
    module: DebugModule,
    fn: () => T,
    requestId?: string,
  ): T {
    const entry = this.startTiming(name, module, requestId);
    try {
      return fn();
    } finally {
      const duration = this.endTiming(entry);
      this.trace(module, `${name} completed`, { duration: `${duration.toFixed(2)}ms` }, requestId);
    }
  }

  // ==========================================================================
  // Module-Specific Helpers
  // ==========================================================================

  /**
   * Log HTTP event
   */
  http(level: DebugLevel, message: string, data?: unknown, requestId?: string): void {
    this.log(DebugModule.HTTP, level, message, data, requestId);
  }

  /**
   * Log Router event
   */
  router(level: DebugLevel, message: string, data?: unknown, requestId?: string): void {
    this.log(DebugModule.ROUTER, level, message, data, requestId);
  }

  /**
   * Log Middleware event
   */
  middleware(level: DebugLevel, message: string, data?: unknown, requestId?: string): void {
    this.log(DebugModule.MIDDLEWARE, level, message, data, requestId);
  }

  /**
   * Log Controller event
   */
  controller(level: DebugLevel, message: string, data?: unknown, requestId?: string): void {
    this.log(DebugModule.CONTROLLER, level, message, data, requestId);
  }

  /**
   * Log ORM event
   */
  orm(level: DebugLevel, message: string, data?: unknown, requestId?: string): void {
    this.log(DebugModule.ORM, level, message, data, requestId);
  }

  /**
   * Log Auth event
   */
  auth(level: DebugLevel, message: string, data?: unknown, requestId?: string): void {
    this.log(DebugModule.AUTH, level, message, data, requestId);
  }

  /**
   * Log Cache event
   */
  cache(level: DebugLevel, message: string, data?: unknown, requestId?: string): void {
    this.log(DebugModule.CACHE, level, message, data, requestId);
  }

  /**
   * Log View event
   */
  view(level: DebugLevel, message: string, data?: unknown, requestId?: string): void {
    this.log(DebugModule.VIEW, level, message, data, requestId);
  }

  /**
   * Log Jobs event
   */
  jobs(level: DebugLevel, message: string, data?: unknown, requestId?: string): void {
    this.log(DebugModule.JOBS, level, message, data, requestId);
  }

  /**
   * Log Search event
   */
  search(level: DebugLevel, message: string, data?: unknown, requestId?: string): void {
    this.log(DebugModule.SEARCH, level, message, data, requestId);
  }

  /**
   * Log Plugin event
   */
  plugin(level: DebugLevel, message: string, data?: unknown, requestId?: string): void {
    this.log(DebugModule.PLUGIN, level, message, data, requestId);
  }

  /**
   * Log API event
   */
  api(level: DebugLevel, message: string, data?: unknown, requestId?: string): void {
    this.log(DebugModule.API, level, message, data, requestId);
  }

  /**
   * Log Config event
   */
  config(level: DebugLevel, message: string, data?: unknown, requestId?: string): void {
    this.log(DebugModule.CONFIG, level, message, data, requestId);
  }

  /**
   * Log Security event
   */
  security(level: DebugLevel, message: string, data?: unknown, requestId?: string): void {
    this.log(DebugModule.SECURITY, level, message, data, requestId);
  }

  // ==========================================================================
  // Output Methods
  // ==========================================================================

  /**
   * Print a debug message to console
   */
  print(module: DebugModule, level: DebugLevel, message: string, data?: unknown): void {
    if (!this.options.console) return;
    console.log(this.output.formatLogLine(level, module, message, data));
  }

  /**
   * Print a request summary
   */
  printRequestSummary(
    ctx: DebugRequestContext,
    status: number,
    duration: number,
    size?: number,
  ): void {
    if (!this.options.console) return;

    console.log('\n' + this.output.formatSeparator());
    console.log(this.output.formatRequest(ctx.method, ctx.url));
    console.log(this.output.formatResponse(status, duration, size));

    if (ctx.timings.length > 0) {
      console.log(this.output.formatWaterfall(ctx.timings, 'Request Timeline'));
    }

    console.log(this.output.formatSeparator() + '\n');
  }

  /**
   * Print a timing waterfall
   */
  printWaterfall(entries: TimingEntry[], title?: string): void {
    if (!this.options.console) return;
    console.log(this.output.formatWaterfall(entries, title));
  }

  /**
   * Print formatted value
   */
  printValue(value: unknown): void {
    if (!this.options.console) return;
    console.log(this.output.formatValue(value));
  }

  /**
   * Print a table
   */
  printTable(headers: string[], rows: (string | number | boolean)[][]): void {
    if (!this.options.console) return;
    console.log(this.output.formatTable(headers, rows));
  }

  /**
   * Print a boxed message
   */
  printBox(content: string, title?: string): void {
    if (!this.options.console) return;
    console.log(this.output.formatBox(content, title));
  }

  // ==========================================================================
  // History & Inspection
  // ==========================================================================

  /**
   * Get recent global events
   */
  getGlobalEvents(limit?: number): DebugEvent[] {
    const events = [...this.globalEvents];
    if (limit) {
      return events.slice(-limit);
    }
    return events;
  }

  /**
   * Get events for a specific request
   */
  getRequestEvents(requestId: string): DebugEvent[] {
    const ctx = this.requests.get(requestId);
    return ctx?.events ?? [];
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.globalEvents = [];
    for (const ctx of this.requests.values()) {
      ctx.events = [];
    }
  }

  /**
   * Get all active requests
   */
  getActiveRequests(): DebugRequestContext[] {
    return Array.from(this.requests.values());
  }

  // ==========================================================================
  // Presets
  // ==========================================================================

  /**
   * Apply HTTP-only preset
   */
  httpOnly(): this {
    const preset = DebugLevels.httpOnly();
    this.levels = preset;
    return this;
  }

  /**
   * Apply ORM-only preset
   */
  ormOnly(): this {
    const preset = DebugLevels.ormOnly();
    this.levels = preset;
    return this;
  }

  /**
   * Apply Auth-only preset
   */
  authOnly(): this {
    const preset = DebugLevels.authOnly();
    this.levels = preset;
    return this;
  }

  /**
   * Apply performance preset
   */
  performance(): this {
    const preset = DebugLevels.performance();
    this.levels = preset;
    return this;
  }

  /**
   * Apply errors-only preset
   */
  errorsOnly(): this {
    const preset = DebugLevels.errors();
    this.levels = preset;
    return this;
  }

  /**
   * Apply all-debug preset
   */
  all(): this {
    const preset = DebugLevels.all();
    this.levels = preset;
    return this;
  }

  // ==========================================================================
  // Internal Methods
  // ==========================================================================

  /**
   * Process a debug event
   */
  private processEvent(event: DebugEvent): void {
    // Store in global history
    this.globalEvents.push(event);
    if (this.globalEvents.length > 10000) {
      this.globalEvents.shift();
    }

    // Store in request context if applicable
    if (event.requestId) {
      const ctx = this.requests.get(event.requestId);
      if (ctx) {
        ctx.events.push(event);
        if (ctx.events.length > this.options.maxEventsPerRequest) {
          ctx.events.shift();
        }
      }
    }

    // Output to console
    if (this.options.console) {
      this.print(event.module, event.level, event.message, event.data);
    }

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Debug listener error:', err);
      }
    }
  }

  /**
   * Get event type for a level
   */
  private getEventTypeForLevel(level: DebugLevel): DebugEventType {
    return level === DebugLevel.ERROR ? 'error' : 'request:start';
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultDebugger: Debugger | null = null;

/**
 * Get the default debugger instance
 */
export function getDebugger(): Debugger {
  if (!defaultDebugger) {
    defaultDebugger = new Debugger();
  }
  return defaultDebugger;
}

/**
 * Create a new debugger instance
 */
export function createDebugger(options?: Partial<DebuggerOptions>): Debugger {
  return new Debugger(options);
}

/**
 * Quick debug log (uses default debugger)
 */
export function debugLog(module: DebugModule, message: string, data?: unknown): void {
  getDebugger().debug(module, message, data);
}

/**
 * Quick error log (uses default debugger)
 */
export function debugError(module: DebugModule, message: string, error?: Error): void {
  getDebugger().error(module, message, error);
}
