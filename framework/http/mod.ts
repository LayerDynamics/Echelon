/**
 * Layer 1: HTTP/Server Layer
 *
 * First framework-specific abstraction layer built on Deno.serve().
 * Wraps raw HTTP into rich Request/Response objects.
 *
 * Responsibilities:
 * - Normalize HTTP variations
 * - Provide consistent developer interface
 * - Handle encoding/decoding automatically
 * - Enable testability (mock request/response)
 */

export { Server, type ServerOptions } from './server.ts';
export { EchelonRequest, type RequestContext } from './request.ts';
export { EchelonResponse, type ResponseOptions } from './response.ts';
export type {
  Handler,
  NextFunction,
  Context,
  Middleware,
  Next,
  RouteHandler,
  LegacyMiddleware,
  HttpMethod,
  Route,
  CookieOptions,
} from './types.ts';
