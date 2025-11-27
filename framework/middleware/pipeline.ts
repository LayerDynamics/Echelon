/**
 * Middleware Pipeline
 *
 * Manages the execution of middleware in a chain (onion model).
 * Each middleware can:
 * - Inspect/modify request before handler
 * - Short-circuit and return early response
 * - Inspect/modify response after handler
 * - Handle exceptions at any point
 */

import type { Context, Middleware, Next } from '../http/types.ts';
import { getDebugger, DebugLevel, DebugModule } from '../debugger/mod.ts';

export interface MiddlewareContext {
  request: Request;
  url: URL;
  params: Record<string, string>;
  state: Map<string, unknown>;
}

/**
 * Middleware pipeline for request processing
 */
export class MiddlewarePipeline {
  private middleware: Middleware[] = [];

  /**
   * Add middleware to the pipeline
   */
  use(middleware: Middleware): this {
    this.middleware.push(middleware);
    return this;
  }

  /**
   * Add middleware at a specific position
   */
  useAt(index: number, middleware: Middleware): this {
    this.middleware.splice(index, 0, middleware);
    return this;
  }

  /**
   * Remove middleware from the pipeline
   */
  remove(middleware: Middleware): this {
    const index = this.middleware.indexOf(middleware);
    if (index !== -1) {
      this.middleware.splice(index, 1);
    }
    return this;
  }

  /**
   * Clear all middleware
   */
  clear(): this {
    this.middleware = [];
    return this;
  }

  /**
   * Get the number of middleware in the pipeline
   */
  get length(): number {
    return this.middleware.length;
  }

  /**
   * Execute the middleware pipeline
   */
  async execute(
    ctx: Context,
    finalHandler: Middleware
  ): Promise<Response> {
    const debugger_ = getDebugger();
    const requestId = ctx.state.get('debugRequestId') as string | undefined;
    let index = 0;

    const next: Next = async (): Promise<Response> => {
      if (index >= this.middleware.length) {
        // All middleware executed, run final handler
        return await finalHandler(ctx, next);
      }

      const currentIndex = index;
      const middleware = this.middleware[index++];
      const middlewareName = middleware.name || `middleware[${currentIndex}]`;

      // Debug: entering middleware
      debugger_.emit('middleware:enter', DebugModule.MIDDLEWARE, DebugLevel.DEBUG, `Entering ${middlewareName}`, {
        requestId,
        data: { index: currentIndex, name: middlewareName },
      });

      const timing = debugger_.startTiming(`middleware:${middlewareName}`, DebugModule.MIDDLEWARE, requestId);

      try {
        const response = await middleware(ctx, next);

        debugger_.endTiming(timing);

        // Debug: exiting middleware
        debugger_.emit('middleware:exit', DebugModule.MIDDLEWARE, DebugLevel.DEBUG, `Exiting ${middlewareName}`, {
          requestId,
          duration: timing.duration,
          data: { index: currentIndex, name: middlewareName, duration: timing.duration },
        });

        return response;
      } catch (error) {
        debugger_.endTiming(timing);
        debugger_.error(DebugModule.MIDDLEWARE, `Error in ${middlewareName}`, error as Error, requestId);
        throw error;
      }
    };

    return await next();
  }

  /**
   * Create a composed middleware function
   */
  compose(): Middleware {
    return async (ctx, next) => {
      return await this.execute(ctx, async () => next());
    };
  }
}

/**
 * Create a middleware that runs conditionally
 */
export function conditional(
  condition: (ctx: Context) => boolean,
  middleware: Middleware
): Middleware {
  return async (ctx, next) => {
    if (condition(ctx)) {
      return await middleware(ctx, next);
    }
    return await next();
  };
}

/**
 * Create a middleware that runs for specific paths
 */
export function forPath(pathPrefix: string, middleware: Middleware): Middleware {
  return conditional((ctx) => ctx.url.pathname.startsWith(pathPrefix), middleware);
}

/**
 * Create a middleware that runs for specific methods
 */
export function forMethods(methods: string[], middleware: Middleware): Middleware {
  const methodSet = new Set(methods.map((m) => m.toUpperCase()));
  return conditional((ctx) => methodSet.has(ctx.request.method), middleware);
}
