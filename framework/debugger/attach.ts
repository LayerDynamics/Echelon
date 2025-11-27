/**
 * Debugger Attachment
 *
 * Provides integration with the Application class and framework modules
 * to automatically capture debug events across the request lifecycle.
 */

import { DebugLevel, DebugModule } from './levels.ts';
import { Debugger, getDebugger } from './debugger.ts';
import { BreakpointManager, getBreakpointManager, BreakpointContext } from './breakpoint.ts';
import { ReportGenerator, getReportGenerator } from './report.ts';

// ============================================================================
// Types for Framework Integration
// ============================================================================

/**
 * Context interface compatible with framework's Context
 */
export interface DebugContext {
  request: Request;
  url: URL;
  params: Record<string, string>;
  state: Map<string, unknown>;
  method: string;
}

/**
 * EventEmitter interface compatible with framework's EventEmitter
 */
export interface DebugEventEmitter {
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
}

/**
 * Middleware function type
 */
export type DebugMiddleware = (
  ctx: DebugContext,
  next: () => Promise<Response>,
) => Promise<Response>;

// ============================================================================
// Attachment Options
// ============================================================================

export interface AttachOptions {
  enabled: boolean;
  trackRequests: boolean;
  trackMiddleware: boolean;
  trackRoutes: boolean;
  trackControllers: boolean;
  trackOrm: boolean;
  trackAuth: boolean;
  trackCache: boolean;
  trackViews: boolean;
  trackJobs: boolean;
  trackSearch: boolean;
  trackPlugins: boolean;
  trackApi: boolean;
  trackConfig: boolean;
  trackSecurity: boolean;
  autoBreakpoints: boolean;
  generateReports: boolean;
}

const DEFAULT_ATTACH_OPTIONS: AttachOptions = {
  enabled: true,
  trackRequests: true,
  trackMiddleware: true,
  trackRoutes: true,
  trackControllers: true,
  trackOrm: true,
  trackAuth: true,
  trackCache: true,
  trackViews: true,
  trackJobs: true,
  trackSearch: true,
  trackPlugins: true,
  trackApi: true,
  trackConfig: true,
  trackSecurity: true,
  autoBreakpoints: false,
  generateReports: true,
};

// ============================================================================
// Debug Attachment Class
// ============================================================================

export class DebugAttachment {
  private debugger: Debugger;
  private breakpoints: BreakpointManager;
  private reports: ReportGenerator;
  private options: AttachOptions;
  private attachedEmitters: Set<DebugEventEmitter> = new Set();
  private eventHandlers: Map<string, (...args: unknown[]) => void> = new Map();

  constructor(
    options?: Partial<AttachOptions>,
    dbg?: Debugger,
    bp?: BreakpointManager,
    rpt?: ReportGenerator,
  ) {
    this.options = { ...DEFAULT_ATTACH_OPTIONS, ...options };
    this.debugger = dbg ?? getDebugger();
    this.breakpoints = bp ?? getBreakpointManager();
    this.reports = rpt ?? getReportGenerator();
  }

  // ==========================================================================
  // Core Attachment
  // ==========================================================================

  /**
   * Attach to an EventEmitter-compatible object (like Application)
   */
  attach(emitter: DebugEventEmitter): this {
    if (this.attachedEmitters.has(emitter)) {
      return this;
    }

    this.attachedEmitters.add(emitter);
    this.registerEventHandlers(emitter);

    this.debugger.info(DebugModule.CONFIG, 'Debugger attached to application');
    return this;
  }

  /**
   * Detach from an EventEmitter
   */
  detach(emitter: DebugEventEmitter): this {
    if (!this.attachedEmitters.has(emitter)) {
      return this;
    }

    // Remove all registered handlers
    for (const [event, handler] of this.eventHandlers) {
      emitter.off(event, handler);
    }

    this.attachedEmitters.delete(emitter);
    this.debugger.info(DebugModule.CONFIG, 'Debugger detached from application');
    return this;
  }

  /**
   * Detach from all emitters
   */
  detachAll(): this {
    for (const emitter of this.attachedEmitters) {
      this.detach(emitter);
    }
    return this;
  }

  // ==========================================================================
  // Event Handler Registration
  // ==========================================================================

  /**
   * Register all event handlers on an emitter
   */
  private registerEventHandlers(emitter: DebugEventEmitter): void {
    // Application lifecycle
    this.registerHandler(emitter, 'app:init', this.handleAppInit.bind(this));
    this.registerHandler(emitter, 'app:start', this.handleAppStart.bind(this));
    this.registerHandler(emitter, 'app:stop', this.handleAppStop.bind(this));
    this.registerHandler(emitter, 'app:error', this.handleAppError.bind(this));

    // Request lifecycle
    if (this.options.trackRequests) {
      this.registerHandler(emitter, 'request:start', this.handleRequestStart.bind(this));
      this.registerHandler(emitter, 'request:end', this.handleRequestEnd.bind(this));
      this.registerHandler(emitter, 'request:error', this.handleRequestError.bind(this));
    }

    // Middleware
    if (this.options.trackMiddleware) {
      this.registerHandler(emitter, 'middleware:enter', this.handleMiddlewareEnter.bind(this));
      this.registerHandler(emitter, 'middleware:exit', this.handleMiddlewareExit.bind(this));
      this.registerHandler(emitter, 'middleware:error', this.handleMiddlewareError.bind(this));
    }

    // Router
    if (this.options.trackRoutes) {
      this.registerHandler(emitter, 'route:match', this.handleRouteMatch.bind(this));
      this.registerHandler(emitter, 'route:miss', this.handleRouteMiss.bind(this));
    }

    // Controller
    if (this.options.trackControllers) {
      this.registerHandler(emitter, 'controller:enter', this.handleControllerEnter.bind(this));
      this.registerHandler(emitter, 'controller:exit', this.handleControllerExit.bind(this));
    }

    // ORM
    if (this.options.trackOrm) {
      this.registerHandler(emitter, 'orm:query', this.handleOrmQuery.bind(this));
      this.registerHandler(emitter, 'orm:result', this.handleOrmResult.bind(this));
      this.registerHandler(emitter, 'orm:error', this.handleOrmError.bind(this));
    }

    // Auth
    if (this.options.trackAuth) {
      this.registerHandler(emitter, 'auth:check', this.handleAuthCheck.bind(this));
      this.registerHandler(emitter, 'auth:success', this.handleAuthSuccess.bind(this));
      this.registerHandler(emitter, 'auth:failure', this.handleAuthFailure.bind(this));
    }

    // Cache
    if (this.options.trackCache) {
      this.registerHandler(emitter, 'cache:get', this.handleCacheGet.bind(this));
      this.registerHandler(emitter, 'cache:set', this.handleCacheSet.bind(this));
      this.registerHandler(emitter, 'cache:hit', this.handleCacheHit.bind(this));
      this.registerHandler(emitter, 'cache:miss', this.handleCacheMiss.bind(this));
    }

    // View
    if (this.options.trackViews) {
      this.registerHandler(emitter, 'view:render', this.handleViewRender.bind(this));
    }

    // Jobs
    if (this.options.trackJobs) {
      this.registerHandler(emitter, 'job:start', this.handleJobStart.bind(this));
      this.registerHandler(emitter, 'job:end', this.handleJobEnd.bind(this));
      this.registerHandler(emitter, 'job:error', this.handleJobError.bind(this));
    }

    // Search
    if (this.options.trackSearch) {
      this.registerHandler(emitter, 'search:query', this.handleSearchQuery.bind(this));
    }

    // Plugin
    if (this.options.trackPlugins) {
      this.registerHandler(emitter, 'plugin:load', this.handlePluginLoad.bind(this));
      this.registerHandler(emitter, 'plugin:event', this.handlePluginEvent.bind(this));
    }

    // API
    if (this.options.trackApi) {
      this.registerHandler(emitter, 'api:request', this.handleApiRequest.bind(this));
      this.registerHandler(emitter, 'api:response', this.handleApiResponse.bind(this));
    }

    // Security
    if (this.options.trackSecurity) {
      this.registerHandler(emitter, 'security:check', this.handleSecurityCheck.bind(this));
    }
  }

  /**
   * Register a single event handler
   */
  private registerHandler(
    emitter: DebugEventEmitter,
    event: string,
    handler: (...args: unknown[]) => void,
  ): void {
    this.eventHandlers.set(event, handler);
    emitter.on(event, handler);
  }

  // ==========================================================================
  // Application Event Handlers
  // ==========================================================================

  private handleAppInit(...args: unknown[]): void {
    this.debugger.info(DebugModule.CONFIG, 'Application initialized', args[0]);
  }

  private handleAppStart(...args: unknown[]): void {
    this.debugger.info(DebugModule.HTTP, 'Application started', args[0]);
  }

  private handleAppStop(): void {
    this.debugger.info(DebugModule.HTTP, 'Application stopped');
  }

  private handleAppError(...args: unknown[]): void {
    this.debugger.error(DebugModule.HTTP, 'Application error', args[0] as Error);
  }

  // ==========================================================================
  // Request Event Handlers
  // ==========================================================================

  private handleRequestStart(...args: unknown[]): void {
    const [ctx, requestId] = args as [DebugContext, string];
    this.debugger.startRequest(requestId, ctx.method, ctx.url.pathname);
  }

  private handleRequestEnd(...args: unknown[]): void {
    const [requestId, status, size] = args as [string, number, number | undefined];
    const ctx = this.debugger.endRequest(requestId, status, size);

    if (ctx && this.options.generateReports) {
      this.reports.generateRequestReport(ctx, status);
    }
  }

  private handleRequestError(...args: unknown[]): void {
    const [requestId, error] = args as [string, Error];
    this.debugger.error(DebugModule.HTTP, 'Request error', error, requestId);
  }

  // ==========================================================================
  // Middleware Event Handlers
  // ==========================================================================

  private handleMiddlewareEnter(...args: unknown[]): void {
    const [name, requestId] = args as [string, string];
    this.debugger.emit('middleware:enter', DebugModule.MIDDLEWARE, DebugLevel.DEBUG, `Entering ${name}`, {
      requestId,
      data: { name },
    });
    this.debugger.startTiming(`middleware:${name}`, DebugModule.MIDDLEWARE, requestId);
  }

  private handleMiddlewareExit(...args: unknown[]): void {
    const [name, requestId, duration] = args as [string, string, number];
    this.debugger.emit('middleware:exit', DebugModule.MIDDLEWARE, DebugLevel.DEBUG, `Exiting ${name}`, {
      requestId,
      duration,
      data: { name, duration },
    });
  }

  private handleMiddlewareError(...args: unknown[]): void {
    const [name, error, requestId] = args as [string, Error, string];
    this.debugger.error(DebugModule.MIDDLEWARE, `Error in ${name}`, error, requestId);
  }

  // ==========================================================================
  // Router Event Handlers
  // ==========================================================================

  private handleRouteMatch(...args: unknown[]): void {
    const [pattern, handler, requestId] = args as [string, string, string];
    this.debugger.emit('route:match', DebugModule.ROUTER, DebugLevel.DEBUG, `Matched: ${pattern}`, {
      requestId,
      data: { pattern, handler },
    });
  }

  private handleRouteMiss(...args: unknown[]): void {
    const [path, requestId] = args as [string, string];
    this.debugger.emit('route:miss', DebugModule.ROUTER, DebugLevel.WARN, `No route for: ${path}`, {
      requestId,
      data: { path },
    });
  }

  // ==========================================================================
  // Controller Event Handlers
  // ==========================================================================

  private handleControllerEnter(...args: unknown[]): void {
    const [controller, action, requestId] = args as [string, string, string];
    this.debugger.emit('controller:enter', DebugModule.CONTROLLER, DebugLevel.DEBUG, `${controller}#${action}`, {
      requestId,
      data: { controller, action },
    });
    this.debugger.startTiming(`controller:${controller}#${action}`, DebugModule.CONTROLLER, requestId);
  }

  private handleControllerExit(...args: unknown[]): void {
    const [controller, action, requestId, duration] = args as [string, string, string, number];
    this.debugger.emit('controller:exit', DebugModule.CONTROLLER, DebugLevel.DEBUG, `${controller}#${action} completed`, {
      requestId,
      duration,
      data: { controller, action, duration },
    });
  }

  // ==========================================================================
  // ORM Event Handlers
  // ==========================================================================

  private handleOrmQuery(...args: unknown[]): void {
    const [operation, model, requestId] = args as [string, string, string | undefined];
    this.debugger.emit('orm:query', DebugModule.ORM, DebugLevel.DEBUG, `${operation} on ${model}`, {
      requestId,
      data: { operation, model },
    });
    if (requestId) {
      this.debugger.startTiming(`orm:${operation}:${model}`, DebugModule.ORM, requestId);
    }
  }

  private handleOrmResult(...args: unknown[]): void {
    const [operation, model, count, requestId, duration] = args as [string, string, number, string | undefined, number];
    this.debugger.emit('orm:result', DebugModule.ORM, DebugLevel.DEBUG, `${operation} on ${model}: ${count} rows`, {
      requestId,
      duration,
      data: { operation, model, count, duration },
    });
  }

  private handleOrmError(...args: unknown[]): void {
    const [operation, model, error, requestId] = args as [string, string, Error, string | undefined];
    this.debugger.error(DebugModule.ORM, `${operation} on ${model} failed`, error, requestId);
  }

  // ==========================================================================
  // Auth Event Handlers
  // ==========================================================================

  private handleAuthCheck(...args: unknown[]): void {
    const [type, requestId] = args as [string, string];
    this.debugger.emit('auth:check', DebugModule.AUTH, DebugLevel.DEBUG, `Auth check: ${type}`, {
      requestId,
      data: { type },
    });
  }

  private handleAuthSuccess(...args: unknown[]): void {
    const [userId, requestId] = args as [string, string];
    this.debugger.emit('auth:success', DebugModule.AUTH, DebugLevel.INFO, `Auth success: ${userId}`, {
      requestId,
      data: { userId },
    });
  }

  private handleAuthFailure(...args: unknown[]): void {
    const [reason, requestId] = args as [string, string];
    this.debugger.emit('auth:failure', DebugModule.AUTH, DebugLevel.WARN, `Auth failed: ${reason}`, {
      requestId,
      data: { reason },
    });

    // Check breakpoints
    if (this.options.autoBreakpoints) {
      this.checkBreakpoint(DebugModule.AUTH, DebugLevel.WARN, `Auth failed: ${reason}`, requestId);
    }
  }

  // ==========================================================================
  // Cache Event Handlers
  // ==========================================================================

  private handleCacheGet(...args: unknown[]): void {
    const [key, requestId] = args as [string, string | undefined];
    this.debugger.emit('cache:get', DebugModule.CACHE, DebugLevel.TRACE, `Cache get: ${key}`, {
      requestId,
      data: { key },
    });
  }

  private handleCacheSet(...args: unknown[]): void {
    const [key, ttl, requestId] = args as [string, number | undefined, string | undefined];
    this.debugger.emit('cache:set', DebugModule.CACHE, DebugLevel.DEBUG, `Cache set: ${key}`, {
      requestId,
      data: { key, ttl },
    });
  }

  private handleCacheHit(...args: unknown[]): void {
    const [key, requestId] = args as [string, string | undefined];
    this.debugger.emit('cache:hit', DebugModule.CACHE, DebugLevel.DEBUG, `Cache hit: ${key}`, {
      requestId,
      data: { key, hit: true },
    });
  }

  private handleCacheMiss(...args: unknown[]): void {
    const [key, requestId] = args as [string, string | undefined];
    this.debugger.emit('cache:miss', DebugModule.CACHE, DebugLevel.DEBUG, `Cache miss: ${key}`, {
      requestId,
      data: { key, hit: false },
    });
  }

  // ==========================================================================
  // View Event Handlers
  // ==========================================================================

  private handleViewRender(...args: unknown[]): void {
    const [template, duration, requestId] = args as [string, number, string | undefined];
    this.debugger.emit('view:render', DebugModule.VIEW, DebugLevel.DEBUG, `Rendered: ${template}`, {
      requestId,
      duration,
      data: { template, duration },
    });
  }

  // ==========================================================================
  // Job Event Handlers
  // ==========================================================================

  private handleJobStart(...args: unknown[]): void {
    const [jobName, jobId] = args as [string, string];
    this.debugger.emit('job:start', DebugModule.JOBS, DebugLevel.INFO, `Job started: ${jobName}`, {
      data: { jobName, jobId },
    });
    this.debugger.startTiming(`job:${jobName}`, DebugModule.JOBS);
  }

  private handleJobEnd(...args: unknown[]): void {
    const [jobName, jobId, duration] = args as [string, string, number];
    this.debugger.emit('job:end', DebugModule.JOBS, DebugLevel.INFO, `Job completed: ${jobName}`, {
      duration,
      data: { jobName, jobId, duration },
    });
  }

  private handleJobError(...args: unknown[]): void {
    const [jobName, error] = args as [string, Error];
    this.debugger.error(DebugModule.JOBS, `Job failed: ${jobName}`, error);
  }

  // ==========================================================================
  // Search Event Handlers
  // ==========================================================================

  private handleSearchQuery(...args: unknown[]): void {
    const [query, index, results, duration] = args as [string, string, number, number];
    this.debugger.emit('search:query', DebugModule.SEARCH, DebugLevel.DEBUG, `Search: "${query}" in ${index}`, {
      duration,
      data: { query, index, results, duration },
    });
  }

  // ==========================================================================
  // Plugin Event Handlers
  // ==========================================================================

  private handlePluginLoad(...args: unknown[]): void {
    const [pluginName] = args as [string];
    this.debugger.emit('plugin:load', DebugModule.PLUGIN, DebugLevel.INFO, `Plugin loaded: ${pluginName}`, {
      data: { pluginName },
    });
  }

  private handlePluginEvent(...args: unknown[]): void {
    const [pluginName, event, data] = args as [string, string, unknown];
    this.debugger.emit('plugin:event', DebugModule.PLUGIN, DebugLevel.DEBUG, `${pluginName}: ${event}`, {
      data: { pluginName, event, payload: data },
    });
  }

  // ==========================================================================
  // API Event Handlers
  // ==========================================================================

  private handleApiRequest(...args: unknown[]): void {
    const [method, endpoint, requestId] = args as [string, string, string];
    this.debugger.emit('api:request', DebugModule.API, DebugLevel.DEBUG, `API ${method} ${endpoint}`, {
      requestId,
      data: { method, endpoint },
    });
  }

  private handleApiResponse(...args: unknown[]): void {
    const [status, endpoint, requestId, duration] = args as [number, string, string, number];
    this.debugger.emit('api:response', DebugModule.API, DebugLevel.DEBUG, `API response ${status}`, {
      requestId,
      duration,
      data: { status, endpoint, duration },
    });
  }

  // ==========================================================================
  // Security Event Handlers
  // ==========================================================================

  private handleSecurityCheck(...args: unknown[]): void {
    const [type, passed, requestId] = args as [string, boolean, string];
    const level = passed ? DebugLevel.DEBUG : DebugLevel.WARN;
    this.debugger.emit('security:check', DebugModule.SECURITY, level, `Security ${type}: ${passed ? 'passed' : 'failed'}`, {
      requestId,
      data: { type, passed },
    });
  }

  // ==========================================================================
  // Breakpoint Integration
  // ==========================================================================

  /**
   * Check breakpoints for current context
   */
  private async checkBreakpoint(
    module: DebugModule,
    level: DebugLevel,
    message: string,
    requestId?: string,
    data?: unknown,
  ): Promise<void> {
    const context: BreakpointContext = {
      module,
      level,
      message,
      data,
      requestId,
      timestamp: Date.now(),
    };

    await this.breakpoints.check(context);
  }

  // ==========================================================================
  // Middleware Generator
  // ==========================================================================

  /**
   * Create a debug middleware that can be added to the middleware pipeline
   */
  createMiddleware(): DebugMiddleware {
    return async (ctx: DebugContext, next: () => Promise<Response>): Promise<Response> => {
      const requestId = crypto.randomUUID();
      const startTime = performance.now();

      // Start request tracking
      this.debugger.startRequest(requestId, ctx.method, ctx.url.pathname);

      // Store request ID in context state
      ctx.state.set('debugRequestId', requestId);

      try {
        const response = await next();
        const _duration = performance.now() - startTime;

        // End request tracking
        const debugCtx = this.debugger.endRequest(requestId, response.status);

        if (debugCtx && this.options.generateReports) {
          this.reports.generateRequestReport(debugCtx, response.status);
        }

        return response;
      } catch (error) {
        const _duration = performance.now() - startTime;

        this.debugger.error(DebugModule.HTTP, 'Request failed', error as Error, requestId);
        this.debugger.endRequest(requestId, 500);

        throw error;
      }
    };
  }

  // ==========================================================================
  // Accessors
  // ==========================================================================

  /**
   * Get the debugger instance
   */
  getDebugger(): Debugger {
    return this.debugger;
  }

  /**
   * Get the breakpoint manager
   */
  getBreakpoints(): BreakpointManager {
    return this.breakpoints;
  }

  /**
   * Get the report generator
   */
  getReports(): ReportGenerator {
    return this.reports;
  }

  /**
   * Get options
   */
  getOptions(): AttachOptions {
    return { ...this.options };
  }

  /**
   * Update options
   */
  configure(options: Partial<AttachOptions>): this {
    Object.assign(this.options, options);
    return this;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultAttachment: DebugAttachment | null = null;

/**
 * Get the default debug attachment
 */
export function getDebugAttachment(): DebugAttachment {
  if (!defaultAttachment) {
    defaultAttachment = new DebugAttachment();
  }
  return defaultAttachment;
}

/**
 * Create a new debug attachment
 */
export function createDebugAttachment(
  options?: Partial<AttachOptions>,
  dbg?: Debugger,
  bp?: BreakpointManager,
  rpt?: ReportGenerator,
): DebugAttachment {
  return new DebugAttachment(options, dbg, bp, rpt);
}

/**
 * Quick attach to an application
 */
export function attachDebugger(emitter: DebugEventEmitter): DebugAttachment {
  return getDebugAttachment().attach(emitter);
}
