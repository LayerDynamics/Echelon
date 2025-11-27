/**
 * URL Router
 *
 * High-performance router using URLPattern for matching.
 */

import type { Handler, HttpMethod, LegacyMiddleware } from '../http/types.ts';
import { EchelonRequest } from '../http/request.ts';
import { EchelonResponse } from '../http/response.ts';

export interface RouteDefinition {
  method: HttpMethod | HttpMethod[] | '*';
  pattern: URLPattern;
  handler: Handler;
  middleware: LegacyMiddleware[];
  name?: string;
  meta?: Record<string, unknown>;
}

export interface RouteMatch {
  route: RouteDefinition;
  params: Record<string, string>;
  // Convenience accessor for the handler
  handler: Handler;
}

/**
 * URL Router for Echelon
 */
export class Router {
  private routes: RouteDefinition[] = [];
  private namedRoutes = new Map<string, RouteDefinition>();
  private globalMiddleware: LegacyMiddleware[] = [];
  private prefix: string = '';

  constructor(prefix: string = '') {
    this.prefix = prefix;
  }

  /**
   * Add global middleware
   */
  use(middleware: LegacyMiddleware): this {
    this.globalMiddleware.push(middleware);
    return this;
  }

  /**
   * Register a GET route
   */
  get(path: string, handler: Handler, options?: RouteOptions): this {
    return this.addRoute('GET', path, handler, options);
  }

  /**
   * Register a POST route
   */
  post(path: string, handler: Handler, options?: RouteOptions): this {
    return this.addRoute('POST', path, handler, options);
  }

  /**
   * Register a PUT route
   */
  put(path: string, handler: Handler, options?: RouteOptions): this {
    return this.addRoute('PUT', path, handler, options);
  }

  /**
   * Register a PATCH route
   */
  patch(path: string, handler: Handler, options?: RouteOptions): this {
    return this.addRoute('PATCH', path, handler, options);
  }

  /**
   * Register a DELETE route
   */
  delete(path: string, handler: Handler, options?: RouteOptions): this {
    return this.addRoute('DELETE', path, handler, options);
  }

  /**
   * Register an OPTIONS route
   */
  options(path: string, handler: Handler, options?: RouteOptions): this {
    return this.addRoute('OPTIONS', path, handler, options);
  }

  /**
   * Register a route for all methods
   */
  all(path: string, handler: Handler, options?: RouteOptions): this {
    return this.addRoute('*', path, handler, options);
  }

  /**
   * Add a route with explicit method
   */
  addRoute(
    method: HttpMethod | HttpMethod[] | '*',
    path: string,
    handler: Handler,
    options: RouteOptions = {}
  ): this {
    const fullPath = this.prefix + path;
    const pattern = new URLPattern({ pathname: fullPath });

    const route: RouteDefinition = {
      method,
      pattern,
      handler,
      middleware: options.middleware ?? [],
      name: options.name,
      meta: options.meta,
    };

    this.routes.push(route);

    if (options.name) {
      this.namedRoutes.set(options.name, route);
    }

    return this;
  }

  /**
   * Mount a sub-router with a prefix
   */
  mount(prefix: string, router: Router): this {
    for (const route of router.routes) {
      const fullPath = this.prefix + prefix + route.pattern.pathname;
      const pattern = new URLPattern({ pathname: fullPath });

      this.routes.push({
        ...route,
        pattern,
        middleware: [...router.globalMiddleware, ...route.middleware],
      });

      if (route.name) {
        this.namedRoutes.set(route.name, route);
      }
    }

    return this;
  }

  /**
   * Match a request to a route
   */
  match(method: string, path: string): RouteMatch | null {
    // Construct a full URL for pattern matching
    const url = new URL(path, 'http://localhost');

    for (const route of this.routes) {
      // Check method
      if (route.method !== '*') {
        const methods = Array.isArray(route.method) ? route.method : [route.method];
        if (!methods.includes(method as HttpMethod)) {
          continue;
        }
      }

      // Check pattern
      const result = route.pattern.exec(url);
      if (result) {
        return {
          route,
          params: result.pathname.groups as Record<string, string>,
          handler: route.handler,
        };
      }
    }

    return null;
  }

  /**
   * Add a route (alias for addRoute)
   */
  add(
    method: HttpMethod | HttpMethod[] | '*',
    pattern: URLPattern | string,
    handler: Handler,
    options: RouteOptions = {}
  ): this {
    const path = typeof pattern === 'string' ? pattern : pattern.pathname;
    return this.addRoute(method, path, handler, options);
  }

  /**
   * Match a request object to a route
   */
  matchRequest(req: EchelonRequest): RouteMatch | null {
    return this.match(req.method, req.path);
  }

  /**
   * Handle a request
   */
  async handle(req: EchelonRequest, res: EchelonResponse): Promise<Response | void> {
    const match = this.matchRequest(req);

    if (!match) {
      return res.notFound('Route not found');
    }

    // Set params on request
    req.setParams(match.params);

    // Collect all middleware
    const allMiddleware = [...this.globalMiddleware, ...match.route.middleware];

    // Execute middleware chain
    let index = 0;
    const next = async (): Promise<Response | void> => {
      if (index < allMiddleware.length) {
        const middleware = allMiddleware[index++];
        return await middleware(req, res, next);
      }
      return await match.route.handler(req, res);
    };

    return await next();
  }

  /**
   * Generate a URL for a named route
   */
  url(name: string, params: Record<string, string> = {}): string | null {
    const route = this.namedRoutes.get(name);
    if (!route) return null;

    let path = route.pattern.pathname;

    // Replace path parameters
    for (const [key, value] of Object.entries(params)) {
      path = path.replace(`:${key}`, encodeURIComponent(value));
      path = path.replace(`{${key}}`, encodeURIComponent(value));
    }

    return path;
  }

  /**
   * Get all registered routes (for debugging/admin)
   */
  getRoutes(): RouteDefinition[] {
    return [...this.routes];
  }
}

interface RouteOptions {
  name?: string;
  middleware?: LegacyMiddleware[];
  meta?: Record<string, unknown>;
}
