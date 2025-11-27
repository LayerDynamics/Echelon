/**
 * HTTP Type Definitions
 */

import type { EchelonRequest } from './request.ts';
import type { EchelonResponse } from './response.ts';

/**
 * Request context for middleware and handlers
 */
export interface Context {
  request: Request;
  url: URL;
  params: Record<string, string>;
  query: URLSearchParams;
  state: Map<string, unknown>;
  // Convenience methods for compatibility
  header(name: string): string | null;
  method: string;
}

/**
 * Middleware next function (context-based)
 */
export type Next = () => Promise<Response>;

/**
 * HTTP request handler function
 */
export type Handler = (
  req: EchelonRequest,
  res: EchelonResponse
) => Promise<Response | void> | Response | void;

/**
 * Route handler using context
 */
export type RouteHandler = (ctx: Context) => Promise<Response> | Response;

/**
 * Middleware next function (legacy)
 */
export type NextFunction = () => Promise<Response | void>;

/**
 * Middleware function signature (context-based)
 */
export type Middleware = (
  ctx: Context,
  next: Next
) => Promise<Response> | Response;

/**
 * Legacy middleware function signature
 */
export type LegacyMiddleware = (
  req: EchelonRequest,
  res: EchelonResponse,
  next: NextFunction
) => Promise<Response | void> | Response | void;

/**
 * HTTP methods supported by Echelon
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

/**
 * Route definition
 */
export interface Route {
  method: HttpMethod | HttpMethod[];
  path: string;
  handler: Handler;
  middleware?: Middleware[];
}

/**
 * Cookie options
 */
export interface CookieOptions {
  maxAge?: number;
  expires?: Date;
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}
