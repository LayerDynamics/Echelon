/**
 * Application Class
 *
 * The main entry point for building Echelon applications.
 * Orchestrates all framework layers into a cohesive application.
 */

import { Server, type ServerOptions } from './http/server.ts';
import { Router } from './router/router.ts';
import { MiddlewarePipeline } from './middleware/pipeline.ts';
import { Config, loadConfig, type ConfigOptions } from './config/config.ts';
import { EventEmitter } from './plugin/events.ts';
import { PluginManager } from './plugin/plugin.ts';
import { getLogger, Logger } from './telemetry/logger.ts';
import { getMetrics, MetricsRegistry } from './telemetry/metrics.ts';
import { getTracer, Tracer } from './telemetry/tracing.ts';
import { Lifecycle } from './runtime/lifecycle.ts';
import { WASMRuntimeCore, type WASMRuntimeConfig } from './runtime/wasm_runtime.ts';
import { WASMGeneratorCore } from './plugin/wasm_generator.ts';
import { Debugger, getDebugger, DebugLevel, DebugModule } from './debugger/mod.ts';
import type { Context, Middleware, Next, RouteHandler, Handler } from './http/types.ts';
import { EchelonRequest } from './http/request.ts';
import { EchelonResponse } from './http/response.ts';
import type {
  WASMSource,
  WASMModule,
  WASMExecutionResult,
  WASMGeneratorSource,
  WASMSandbox,
  WASMSandboxConfig,
} from './runtime/wasm_types.ts';

export interface ApplicationOptions {
  config?: ConfigOptions;
  configPath?: string;
  wasmConfig?: WASMRuntimeConfig;
  enableWasm?: boolean;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/**
 * Main Application class
 */
export class Application {
  private server: Server | null = null;
  private router: Router;
  private middleware: MiddlewarePipeline;
  private config: Config;
  private events: EventEmitter;
  private plugins: PluginManager;
  private logger: Logger;
  private metrics: MetricsRegistry;
  private tracer: Tracer;
  private lifecycle: Lifecycle;
  private initialized = false;

  // WASM Integration
  private wasmRuntime: WASMRuntimeCore | null = null;
  private wasmGenerator: WASMGeneratorCore | null = null;
  private wasmEnabled: boolean;

  // Debugger
  private debugger: Debugger;

  constructor(options: ApplicationOptions = {}) {
    this.config = new Config(options.config);
    this.router = new Router();
    this.middleware = new MiddlewarePipeline();
    this.events = new EventEmitter();
    this.logger = getLogger();
    this.metrics = getMetrics();
    this.tracer = getTracer();
    this.lifecycle = new Lifecycle();

    // Initialize plugin manager with context
    this.plugins = new PluginManager({
      router: this.router,
      middleware: this.middleware,
      config: this.config,
      on: (event, handler) => this.events.on(event, handler),
      emit: (event, ...args) => this.events.emitSync(event, args[0]),
      log: (message, context) => this.logger.info(message, context as Record<string, unknown>),
    });

    // WASM configuration
    this.wasmEnabled = options.enableWasm ?? true;
    if (this.wasmEnabled) {
      this.wasmRuntime = new WASMRuntimeCore(this.events, this.lifecycle, options.wasmConfig);
      this.wasmGenerator = new WASMGeneratorCore(this.events);
    }

    // Debugger initialization
    this.debugger = getDebugger();

    // Setup default metrics
    this.setupMetrics();
  }

  /**
   * Initialize the application
   */
  async init(configPath?: string): Promise<this> {
    if (this.initialized) return this;

    this.debugger.info(DebugModule.CONFIG, 'Application initializing');

    // Load configuration
    if (configPath) {
      this.config = await loadConfig(configPath);
      this.debugger.debug(DebugModule.CONFIG, 'Configuration loaded', { path: configPath });
    }

    // Initialize WASM runtime
    if (this.wasmEnabled && this.wasmRuntime) {
      await this.wasmRuntime.initialize();
      this.logger.info('WASM runtime initialized');
      this.debugger.info(DebugModule.PLUGIN, 'WASM runtime initialized');
    }

    // Install all registered plugins
    await this.plugins.installAll();
    this.debugger.debug(DebugModule.PLUGIN, 'Plugins installed');

    // Emit init event
    await this.events.emit('app:init', { app: this });

    this.initialized = true;
    this.logger.info('Application initialized');
    this.debugger.info(DebugModule.CONFIG, 'Application initialized');

    return this;
  }

  /**
   * Add global middleware
   */
  use(middleware: Middleware): this {
    this.middleware.use(middleware);
    return this;
  }

  /**
   * Wrap a RouteHandler (context-based) into a Handler (req/res-based)
   */
  private wrapHandler(handler: RouteHandler): Handler {
    return async (req: EchelonRequest, res: EchelonResponse): Promise<Response | void> => {
      const url = new URL(req.url);
      const ctx: Context = {
        request: req.raw,
        url,
        params: req.params,
        query: url.searchParams,
        state: req.state,
        header: (name: string) => req.header(name),
        method: req.method,
      };
      return handler(ctx);
    };
  }

  /**
   * Register a GET route
   */
  get(path: string, handler: RouteHandler): this {
    this.router.get(path, this.wrapHandler(handler));
    return this;
  }

  /**
   * Register a POST route
   */
  post(path: string, handler: RouteHandler): this {
    this.router.post(path, this.wrapHandler(handler));
    return this;
  }

  /**
   * Register a PUT route
   */
  put(path: string, handler: RouteHandler): this {
    this.router.put(path, this.wrapHandler(handler));
    return this;
  }

  /**
   * Register a PATCH route
   */
  patch(path: string, handler: RouteHandler): this {
    this.router.patch(path, this.wrapHandler(handler));
    return this;
  }

  /**
   * Register a DELETE route
   */
  delete(path: string, handler: RouteHandler): this {
    this.router.delete(path, this.wrapHandler(handler));
    return this;
  }

  /**
   * Register routes from a router
   */
  routes(router: Router): this {
    // Merge routes from the provided router
    const routes = router.getRoutes();
    for (const route of routes) {
      this.router.add(route.method as HttpMethod, route.pattern, route.handler);
    }
    return this;
  }

  /**
   * Register an event listener
   */
  on(event: string, handler: (...args: unknown[]) => void | Promise<void>): this {
    this.events.on(event, handler);
    return this;
  }

  /**
   * Emit an event
   */
  async emit(event: string, data?: unknown): Promise<void> {
    await this.events.emit(event, data);
  }

  /**
   * Get configuration
   */
  getConfig(): Config {
    return this.config;
  }

  /**
   * Get logger
   */
  getLogger(): Logger {
    return this.logger;
  }

  /**
   * Get metrics registry
   */
  getMetrics(): MetricsRegistry {
    return this.metrics;
  }

  /**
   * Get tracer
   */
  getTracer(): Tracer {
    return this.tracer;
  }

  /**
   * Get event emitter
   */
  getEvents(): EventEmitter {
    return this.events;
  }

  /**
   * Get plugin manager
   */
  getPlugins(): PluginManager {
    return this.plugins;
  }

  /**
   * Get lifecycle manager
   */
  getLifecycle(): Lifecycle {
    return this.lifecycle;
  }

  /**
   * Get debugger
   */
  getDebugger(): Debugger {
    return this.debugger;
  }

  // ============================================================================
  // WASM Integration Methods
  // ============================================================================

  /**
   * Get WASM runtime
   */
  getWASMRuntime(): WASMRuntimeCore | null {
    return this.wasmRuntime;
  }

  /**
   * Get WASM generator
   */
  getWASMGenerator(): WASMGeneratorCore | null {
    return this.wasmGenerator;
  }

  /**
   * Check if WASM is enabled
   */
  isWASMEnabled(): boolean {
    return this.wasmEnabled && this.wasmRuntime !== null;
  }

  /**
   * Load a WASM module
   */
  async loadWASMModule(source: WASMSource): Promise<WASMModule> {
    if (!this.wasmRuntime) {
      throw new Error('WASM runtime is not enabled');
    }
    return await this.wasmRuntime.loadModule(source);
  }

  /**
   * Execute a WASM function
   */
  async executeWASM<T = unknown>(
    moduleId: string,
    funcName: string,
    args: unknown[] = []
  ): Promise<WASMExecutionResult<T>> {
    if (!this.wasmRuntime) {
      throw new Error('WASM runtime is not enabled');
    }
    return await this.wasmRuntime.execute<T>(moduleId, funcName, args);
  }

  /**
   * Generate WASM from source
   */
  async generateWASM(source: WASMGeneratorSource): Promise<Uint8Array> {
    if (!this.wasmGenerator) {
      throw new Error('WASM generator is not enabled');
    }
    const result = await this.wasmGenerator.generate(source);
    if (!result.success || !result.wasm) {
      throw new Error(`WASM generation failed: ${result.errors.map(e => e.message).join(', ')}`);
    }
    return result.wasm;
  }

  /**
   * Create a WASM sandbox
   */
  createWASMSandbox(config?: Partial<WASMSandboxConfig>): WASMSandbox {
    if (!this.wasmRuntime) {
      throw new Error('WASM runtime is not enabled');
    }
    return this.wasmRuntime.createSandbox(config);
  }

  /**
   * Start the server
   */
  async listen(options?: Partial<ServerOptions>): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }

    const port = options?.port ?? this.config.get<number>('port', 8000);
    const hostname = options?.hostname ?? this.config.get<string>('host', '0.0.0.0');

    // Create request handler
    const handler = this.createHandler();

    // Create and start server
    this.server = new Server({
      port,
      hostname,
      handler,
      onListen: options?.onListen ?? (({ hostname, port }) => {
        this.logger.info(`Server listening on http://${hostname}:${port}`);
      }),
    });

    // Register shutdown handler
    this.lifecycle.onShutdown(async () => {
      await this.stop();
    });

    // Emit start event
    await this.events.emit('app:start', { port, hostname });

    // Start serving
    await this.server.serve();
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = null;
    }

    // Shutdown WASM runtime
    if (this.wasmRuntime) {
      await this.wasmRuntime.shutdown();
      this.logger.info('WASM runtime shutdown');
    }

    // Emit stop event
    await this.events.emit('app:stop', {});

    this.logger.info('Application stopped');
  }

  /**
   * Create the request handler
   */
  private createHandler(): (request: Request) => Promise<Response> {
    const requestCounter = this.metrics.counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labels: ['method', 'path', 'status'],
    });

    const requestDuration = this.metrics.histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labels: ['method', 'path'],
    });

    return async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      const method = request.method;
      const path = url.pathname;
      const requestId = crypto.randomUUID();

      const timer = requestDuration.startTimer({ method, path });

      // Start debug request tracking
      this.debugger.startRequest(requestId, method, path);

      try {
        // Match route
        const match = this.router.match(method, path);

        if (!match) {
          this.debugger.emit('route:miss', DebugModule.ROUTER, DebugLevel.WARN, `No route: ${method} ${path}`, {
            requestId,
            data: { method, path },
          });
          requestCounter.inc({ method, path, status: '404' });
          timer();
          this.debugger.endRequest(requestId, 404);
          return new Response('Not Found', { status: 404 });
        }

        this.debugger.emit('route:match', DebugModule.ROUTER, DebugLevel.DEBUG, `Matched: ${match.route.pattern}`, {
          requestId,
          data: { pattern: match.route.pattern, params: match.params },
        });

        // Create context with all required properties
        const state = new Map<string, unknown>();
        state.set('debugRequestId', requestId);
        const context: Context = {
          request,
          url,
          params: match.params,
          query: url.searchParams,
          state,
          header: (name: string) => request.headers.get(name),
          method,
        };

        // Create handler chain that wraps the legacy Handler
        const routeHandler: Middleware = async (ctx: Context): Promise<Response> => {
          this.debugger.emit('controller:enter', DebugModule.CONTROLLER, DebugLevel.DEBUG, 'Executing handler', {
            requestId,
          });
          const timing = this.debugger.startTiming('route-handler', DebugModule.CONTROLLER, requestId);

          // Create EchelonRequest and EchelonResponse for the handler
          const req = new EchelonRequest(ctx.request);
          req.setParams(ctx.params);
          const res = new EchelonResponse();

          const result = await match.handler(req, res);

          this.debugger.endTiming(timing);
          this.debugger.emit('controller:exit', DebugModule.CONTROLLER, DebugLevel.DEBUG, 'Handler completed', {
            requestId,
            duration: timing.duration,
          });

          if (result instanceof Response) {
            return result;
          }
          return res.build();
        };

        // Execute middleware pipeline with route handler
        const response = await this.middleware.execute(context, routeHandler);

        requestCounter.inc({ method, path, status: String(response.status) });
        this.debugger.endRequest(requestId, response.status);
        timer();

        return response;
      } catch (error) {
        this.logger.error('Request error', error as Error, { method, path });
        this.debugger.error(DebugModule.HTTP, 'Request error', error as Error, requestId);
        this.debugger.endRequest(requestId, 500);
        requestCounter.inc({ method, path, status: '500' });
        timer();

        return new Response('Internal Server Error', { status: 500 });
      }
    };
  }

  /**
   * Setup default metrics
   */
  private setupMetrics(): void {
    // Process metrics
    this.metrics.gauge({
      name: 'process_start_time_seconds',
      help: 'Start time of the process since unix epoch in seconds',
    }).set(Date.now() / 1000);
  }
}

/**
 * Create a new application instance
 */
export function createApp(options?: ApplicationOptions): Application {
  return new Application(options);
}
