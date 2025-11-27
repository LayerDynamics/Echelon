/**
 * HTTP Server
 *
 * Wraps Deno.serve() with Echelon's request/response abstractions.
 * Provides a high-level interface for handling HTTP requests.
 */

import { EchelonRequest } from './request.ts';
import { EchelonResponse } from './response.ts';
import type { Handler, LegacyMiddleware } from './types.ts';
import { Lifecycle } from '../runtime/lifecycle.ts';

export interface ServerOptions {
  port?: number;
  hostname?: string;
  signal?: AbortSignal;
  onListen?: (addr: Deno.NetAddr) => void;
  onError?: (error: Error) => Response;
  handler?: Handler | ((request: Request) => Promise<Response> | Response);
}

/**
 * HTTP Server for Echelon applications
 */
export class Server {
  private handler: Handler | ((request: Request) => Promise<Response> | Response);
  private middleware: LegacyMiddleware[] = [];
  private lifecycle: Lifecycle;
  private options: ServerOptions;
  private server?: Deno.HttpServer;

  constructor(handlerOrOptions: Handler | ServerOptions, options?: ServerOptions) {
    // Support both constructor patterns:
    // new Server(handler, options) and new Server({ handler, ...options })
    if (typeof handlerOrOptions === 'function') {
      this.handler = handlerOrOptions;
      this.options = {
        port: options?.port ?? 8000,
        hostname: options?.hostname ?? '0.0.0.0',
        ...options,
      };
    } else {
      this.handler = handlerOrOptions.handler!;
      this.options = {
        port: handlerOrOptions.port ?? 8000,
        hostname: handlerOrOptions.hostname ?? '0.0.0.0',
        ...handlerOrOptions,
      };
    }
    this.lifecycle = new Lifecycle();
  }

  /**
   * Add middleware to the server
   */
  use(middleware: LegacyMiddleware): this {
    this.middleware.push(middleware);
    return this;
  }

  /**
   * Get the lifecycle manager
   */
  getLifecycle(): Lifecycle {
    return this.lifecycle;
  }

  /**
   * Start the server
   */
  async serve(): Promise<void> {
    const signal = this.options.signal ?? this.lifecycle.signal;

    await this.lifecycle.emitStart();

    this.server = Deno.serve(
      {
        port: this.options.port,
        hostname: this.options.hostname,
        signal,
        onListen: (addr) => {
          if (this.options.onListen) {
            this.options.onListen(addr);
          }
          this.lifecycle.emitReady();
        },
      },
      async (request: Request) => {
        return await this.handleRequest(request);
      }
    );

    // Wait for server to finish
    await this.server.finished;
  }

  /**
   * Handle an incoming request
   */
  private async handleRequest(request: Request): Promise<Response> {
    // Check if handler is a raw Request handler (from Application)
    if (this.isRawHandler(this.handler)) {
      try {
        return await this.handler(request);
      } catch (error) {
        console.error('Request error:', error);
        if (this.options.onError) {
          return this.options.onError(error as Error);
        }
        return new Response('Internal Server Error', { status: 500 });
      }
    }

    const req = new EchelonRequest(request);
    const res = new EchelonResponse();

    try {
      // Run middleware chain
      const response = await this.runMiddleware(req, res, 0);
      if (response) {
        return response;
      }

      // Run main handler (Handler type)
      const result = await (this.handler as Handler)(req, res);
      if (result instanceof Response) {
        return result;
      }

      // If no response returned, build default
      return res.build();
    } catch (error) {
      console.error('Request error:', error);

      if (this.options.onError) {
        return this.options.onError(error as Error);
      }

      return new EchelonResponse()
        .status(500)
        .json({ error: 'Internal Server Error' });
    }
  }

  /**
   * Check if handler is a raw Request handler
   */
  private isRawHandler(handler: unknown): handler is (request: Request) => Promise<Response> | Response {
    // If handler was passed in options with handler property, it's likely a raw handler
    return this.options.handler === handler && typeof handler === 'function';
  }

  /**
   * Run middleware chain recursively
   */
  private async runMiddleware(
    req: EchelonRequest,
    res: EchelonResponse,
    index: number
  ): Promise<Response | void> {
    if (index >= this.middleware.length) {
      return;
    }

    const middleware = this.middleware[index];
    let nextCalled = false;

    const next = async (): Promise<Response | void> => {
      if (nextCalled) {
        throw new Error('next() called multiple times');
      }
      nextCalled = true;
      return await this.runMiddleware(req, res, index + 1);
    };

    const result = await middleware(req, res, next);
    return result;
  }

  /**
   * Gracefully shutdown the server
   */
  async shutdown(): Promise<void> {
    await this.lifecycle.shutdown('Server shutdown requested');
  }

  /**
   * Close the server (alias for shutdown)
   */
  close(): void {
    this.lifecycle.shutdown('Server closed').catch(console.error);
  }
}

/**
 * Create a simple handler that returns a Response
 */
export function createHandler(fn: (req: Request) => Response | Promise<Response>): Handler {
  return async (req: EchelonRequest) => {
    return await fn(req.raw);
  };
}
