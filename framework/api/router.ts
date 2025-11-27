/**
 * API Router
 *
 * Specialized router for REST API endpoints.
 */

import { Router } from '../router/router.ts';
import type { Handler, LegacyMiddleware } from '../http/types.ts';

export interface ApiRouterOptions {
  prefix?: string;
  version?: string;
  middleware?: LegacyMiddleware[];
}

/**
 * API Router with versioning and common middleware
 */
export class ApiRouter {
  private router: Router;
  private version: string;

  constructor(options: ApiRouterOptions = {}) {
    const prefix = options.prefix ?? '/api';
    this.version = options.version ?? 'v1';
    this.router = new Router(`${prefix}/${this.version}`);

    // Add default middleware
    if (options.middleware) {
      for (const mw of options.middleware) {
        this.router.use(mw);
      }
    }
  }

  /**
   * Get the underlying router
   */
  getRouter(): Router {
    return this.router;
  }

  /**
   * Register a resource with CRUD routes
   */
  resource(name: string, handlers: ResourceHandlers): this {
    const path = `/${name}`;

    if (handlers.index) this.router.get(path, handlers.index);
    if (handlers.show) this.router.get(`${path}/:id`, handlers.show);
    if (handlers.create) this.router.post(path, handlers.create);
    if (handlers.update) {
      this.router.put(`${path}/:id`, handlers.update);
      this.router.patch(`${path}/:id`, handlers.update);
    }
    if (handlers.destroy) this.router.delete(`${path}/:id`, handlers.destroy);

    return this;
  }

  /**
   * Register routes
   */
  get(path: string, handler: Handler): this {
    this.router.get(path, handler);
    return this;
  }

  post(path: string, handler: Handler): this {
    this.router.post(path, handler);
    return this;
  }

  put(path: string, handler: Handler): this {
    this.router.put(path, handler);
    return this;
  }

  patch(path: string, handler: Handler): this {
    this.router.patch(path, handler);
    return this;
  }

  delete(path: string, handler: Handler): this {
    this.router.delete(path, handler);
    return this;
  }

  /**
   * Add middleware
   */
  use(middleware: LegacyMiddleware): this {
    this.router.use(middleware);
    return this;
  }

  /**
   * Create a route group
   */
  group(prefix: string, callback: (router: ApiRouter) => void): this {
    const groupRouter = new ApiRouter({
      prefix: `${this.router['prefix']}${prefix}`,
      version: '',
    });
    callback(groupRouter);

    // Merge routes
    for (const route of groupRouter.getRouter().getRoutes()) {
      this.router['routes'].push(route);
    }

    return this;
  }
}

interface ResourceHandlers {
  index?: Handler;
  show?: Handler;
  create?: Handler;
  update?: Handler;
  destroy?: Handler;
}
