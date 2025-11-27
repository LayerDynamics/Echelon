/**
 * Echelon Framework
 *
 * A full-stack web framework built on Deno.
 * Implements the Application Operating System pattern.
 *
 * @module echelon
 */

// Application
export { Application, createApp, type ApplicationOptions } from './app.ts';

// Layer 0: Runtime
export {
  PermissionManager,
  Lifecycle,
  Environment,
  Runtime,
  checkPermission,
  requirePermission,
} from './runtime/mod.ts';

// Layer 1: HTTP/Server
export {
  Server,
  EchelonRequest,
  EchelonResponse,
  type Context,
  type Middleware,
  type Next,
  type RouteHandler,
  type ServerOptions,
} from './http/mod.ts';

// Layer 2: Middleware
export {
  MiddlewarePipeline,
  cors,
  csrf,
  loggingMiddleware,
  compression,
  rateLimit,
  type CorsOptions,
  type CsrfOptions,
  type CompressionOptions,
  type RateLimitOptions,
} from './middleware/mod.ts';

// Layer 3: Router
export {
  Router,
  RoutePattern,
  RouteGroup,
  type Route,
} from './router/mod.ts';

// Layer 4: Controller
export {
  Controller,
  ResourceController,
} from './controller/mod.ts';

// Layer 5: ORM/Data
export {
  KVStore,
  Model,
  Query,
  validators,
  type ModelDefinition,
  type FieldDefinition,
  type QueryOptions,
  type QueryResult,
  type Validator,
} from './orm/mod.ts';

// Aliases for ORM compatibility
export { Query as QueryBuilder } from './orm/mod.ts';

// Layer 6: Auth
export {
  Auth,
  Session,
  RBAC,
  hashPassword,
  verifyPassword,
  type AuthOptions,
  type AuthUser,
  type SessionData,
  type SessionOptions,
  type Role,
  type Permission,
  type RBACOptions,
} from './auth/mod.ts';

// Alias for compatibility
export { Session as SessionManager } from './auth/mod.ts';

// Generate token utility
export async function generateToken(length: number = 32): Promise<string> {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Layer 7: Cache
export {
  Cache,
  cacheMiddleware,
  type CacheOptions,
  type CacheEntry,
  type CacheMiddlewareOptions,
} from './cache/mod.ts';

// Layer 8: View/Template
export {
  TemplateEngine,
  html,
  type TemplateContext,
} from './view/mod.ts';

// Layer 9: Jobs
export {
  JobQueue,
  JobWorker,
  createJobWorker,
  Scheduler,
  type Job,
  type JobOptions,
  type JobHandler,
  type WorkerOptions,
  type ScheduledJob,
  type CronSchedule,
} from './jobs/mod.ts';

// Layer 10: Search
export {
  SearchEngine,
  SearchIndex,
  type SearchResult,
  type SearchOptions,
  type IndexedDocument,
  type IndexOptions,
} from './search/mod.ts';

// Layer 11: Admin
export {
  AdminRouter,
  HealthCheck,
  type AdminConfig,
  type HealthStatus,
} from './admin/mod.ts';

// Alias for compatibility
export { AdminRouter as AdminPanel } from './admin/mod.ts';

// Layer 12: Plugin
export {
  PluginManager,
  EventEmitter,
  type Plugin,
  type PluginContext,
} from './plugin/mod.ts';

// Layer 13: API
export {
  ApiRouter,
  Serializer,
  createSerializer,
  apiResponse,
  apiError,
  validationError,
  notFoundError,
  unauthorizedError,
  forbiddenError,
  serverError,
  HttpStatus,
  type ApiResponse,
  type ApiError,
  type SerializerOptions,
} from './api/mod.ts';

// Layer 14: Config
export {
  Config,
  FeatureFlags,
  loadConfig,
  type ConfigOptions,
  type FeatureFlagOptions,
} from './config/mod.ts';

// Layer 17: Security
export {
  securityHeaders,
  escapeHtml,
  unescapeHtml,
  stripTags,
  sanitizeHtml,
  sanitizeUrl,
  sanitizeFilename,
  sanitizeObject,
  escapeRegex,
  type SecurityHeadersOptions,
  type ContentSecurityPolicyOptions,
} from './security/mod.ts';

// Layer 18: Telemetry
export {
  Counter,
  Gauge,
  Histogram,
  MetricsRegistry,
  getMetrics,
  Span,
  Tracer,
  getTracer,
  Logger,
  getLogger,
  log,
  type LogLevel,
  type LogEntry,
  type SpanContext,
  type SpanData,
} from './telemetry/mod.ts';

// WASM Runtime (Layer 0 extension)
export {
  WASMRuntimeCore,
  createWASMRuntime,
  WASMModuleLoader,
  WASMExecutor,
  WASMMemoryManager,
  WASMSandboxManager,
  WASMEvents,
  WASMOpcode,
  DEFAULT_WASM_CAPABILITIES,
  type WASMRuntimeConfig,
  type WASMSource,
  type WASMModule,
  type WASMModuleInfo,
  type WASMExecutionResult,
  type WASMExecutionOptions,
  type WASMSandbox,
  type WASMSandboxConfig,
  type WASMCapability,
  type WASMHostFunctionDescriptor,
} from './runtime/mod.ts';

// WASM Generator (Layer 12 extension)
export {
  WASMGeneratorCore,
  createWASMGenerator,
  WASMCompiler,
  WASMCodegen,
  WASMModuleBuilder,
  WASMOptimizer,
  type WASMGenerationResult,
  type WASMGeneratorSource,
  type WASMCompilationResult,
  type WASMOptimizationLevel,
  type WASMTemplate,
} from './plugin/mod.ts';

// WASM Middleware (Layer 2 extension)
export {
  wasmMiddleware,
  wasmFunction,
  wasmHandler,
  wasmLoader,
  getWASMContext,
  setWASMExecution,
  type WASMMiddlewareOptions,
  type WASMContextData,
} from './middleware/mod.ts';
