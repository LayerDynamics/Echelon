/**
 * Layer 2: Middleware Layer
 *
 * Cross-cutting concerns that wrap every request/response cycle.
 * Implements the onion model where each middleware wraps the next.
 *
 * Responsibilities:
 * - Handle cross-cutting concerns without polluting business logic
 * - Provide extension points for plugins
 * - Enable composition of features
 * - Maintain separation of concerns
 * - WASM execution middleware
 */

export { MiddlewarePipeline, type MiddlewareContext } from './pipeline.ts';
export { corsMiddleware, cors, type CorsOptions } from './cors.ts';
export { csrfMiddleware, csrf, type CsrfOptions } from './csrf.ts';
export { loggingMiddleware, type LoggingOptions } from './logging.ts';
export { compressionMiddleware, compression, type CompressionOptions } from './compression.ts';
export { rateLimitMiddleware, rateLimit, type RateLimitOptions } from './ratelimit.ts';

// WASM Middleware exports
export {
  wasmMiddleware,
  wasmFunction,
  wasmHandler,
  wasmLoader,
  getWASMContext,
  setWASMExecution,
  type WASMMiddlewareOptions,
  type WASMContextData,
} from './wasm.ts';
