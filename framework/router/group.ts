/**
 * Route Group
 *
 * Groups routes with shared prefixes and middleware.
 */

import type { Handler, LegacyMiddleware } from '../http/types.ts';
import { Router } from './router.ts';

/**
 * Route group for organizing related routes
 */
export class RouteGroup {
  private router: Router;
  private prefix: string;
  private middleware: LegacyMiddleware[] = [];

  constructor(prefix: string, router: Router) {
    this.prefix = prefix;
    this.router = router;
  }

  /**
   * Add middleware to the group
   */
  use(middleware: LegacyMiddleware): this {
    this.middleware.push(middleware);
    return this;
  }

  /**
   * Register a GET route
   */
  get(path: string, handler: Handler, options: RouteGroupOptions = {}): this {
    this.addRoute('GET', path, handler, options);
    return this;
  }

  /**
   * Register a POST route
   */
  post(path: string, handler: Handler, options: RouteGroupOptions = {}): this {
    this.addRoute('POST', path, handler, options);
    return this;
  }

  /**
   * Register a PUT route
   */
  put(path: string, handler: Handler, options: RouteGroupOptions = {}): this {
    this.addRoute('PUT', path, handler, options);
    return this;
  }

  /**
   * Register a PATCH route
   */
  patch(path: string, handler: Handler, options: RouteGroupOptions = {}): this {
    this.addRoute('PATCH', path, handler, options);
    return this;
  }

  /**
   * Register a DELETE route
   */
  delete(path: string, handler: Handler, options: RouteGroupOptions = {}): this {
    this.addRoute('DELETE', path, handler, options);
    return this;
  }

  /**
   * Create a nested group
   */
  group(prefix: string, callback: (group: RouteGroup) => void): this {
    const nestedGroup = new RouteGroup(this.prefix + prefix, this.router);
    nestedGroup.middleware = [...this.middleware];
    callback(nestedGroup);
    return this;
  }

  /**
   * Add a route to the underlying router
   */
  private addRoute(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    handler: Handler,
    options: RouteGroupOptions
  ): void {
    const fullPath = this.prefix + path;
    const allMiddleware = [...this.middleware, ...(options.middleware ?? [])];

    this.router.addRoute(method, fullPath, handler, {
      ...options,
      middleware: allMiddleware,
    });
  }
}

interface RouteGroupOptions {
  name?: string;
  middleware?: LegacyMiddleware[];
  meta?: Record<string, unknown>;
}

/**
 * Create a route group
 */
export function group(prefix: string, router: Router): RouteGroup {
  return new RouteGroup(prefix, router);
}
