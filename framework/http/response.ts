/**
 * Enhanced Response Builder
 *
 * Provides a fluent interface for building HTTP responses
 * with common utilities for JSON, HTML, redirects, etc.
 */

import type { CookieOptions } from './types.ts';

export interface ResponseOptions {
  status?: number;
  headers?: Headers | Record<string, string>;
}

/**
 * Response builder for Echelon
 */
export class EchelonResponse {
  private _status: number = 200;
  private _headers: Headers = new Headers();
  private _body: BodyInit | null = null;
  private _cookies: string[] = [];

  constructor(options?: ResponseOptions) {
    if (options?.status) {
      this._status = options.status;
    }
    if (options?.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((value, key) => {
          this._headers.set(key, value);
        });
      } else {
        for (const [key, value] of Object.entries(options.headers)) {
          this._headers.set(key, value);
        }
      }
    }
  }

  /**
   * Set the response status code
   */
  status(code: number): this {
    this._status = code;
    return this;
  }

  /**
   * Set a response header
   */
  header(name: string, value: string): this {
    this._headers.set(name, value);
    return this;
  }

  /**
   * Set multiple headers
   */
  headers(headers: Record<string, string>): this {
    for (const [name, value] of Object.entries(headers)) {
      this._headers.set(name, value);
    }
    return this;
  }

  /**
   * Set the Content-Type header
   */
  type(contentType: string): this {
    this._headers.set('Content-Type', contentType);
    return this;
  }

  /**
   * Set a cookie
   */
  cookie(name: string, value: string, options: CookieOptions = {}): this {
    const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];

    if (options.maxAge !== undefined) {
      parts.push(`Max-Age=${options.maxAge}`);
    }
    if (options.expires) {
      parts.push(`Expires=${options.expires.toUTCString()}`);
    }
    if (options.path) {
      parts.push(`Path=${options.path}`);
    }
    if (options.domain) {
      parts.push(`Domain=${options.domain}`);
    }
    if (options.secure) {
      parts.push('Secure');
    }
    if (options.httpOnly) {
      parts.push('HttpOnly');
    }
    if (options.sameSite) {
      parts.push(`SameSite=${options.sameSite}`);
    }

    this._cookies.push(parts.join('; '));
    return this;
  }

  /**
   * Clear a cookie
   */
  clearCookie(name: string, options: CookieOptions = {}): this {
    return this.cookie(name, '', {
      ...options,
      maxAge: 0,
      expires: new Date(0),
    });
  }

  /**
   * Send a JSON response
   */
  json(data: unknown): Response {
    this._headers.set('Content-Type', 'application/json; charset=utf-8');
    this._body = JSON.stringify(data);
    return this.build();
  }

  /**
   * Send an HTML response
   */
  html(content: string): Response {
    this._headers.set('Content-Type', 'text/html; charset=utf-8');
    this._body = content;
    return this.build();
  }

  /**
   * Send a plain text response
   */
  text(content: string): Response {
    this._headers.set('Content-Type', 'text/plain; charset=utf-8');
    this._body = content;
    return this.build();
  }

  /**
   * Send a redirect response
   */
  redirect(url: string, status: 301 | 302 | 303 | 307 | 308 = 302): Response {
    this._status = status;
    this._headers.set('Location', url);
    return this.build();
  }

  /**
   * Send a file response
   */
  async file(path: string): Promise<Response> {
    const file = await Deno.open(path, { read: true });
    const stat = await file.stat();

    // Determine content type from extension
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

    this._headers.set('Content-Type', contentType);
    this._headers.set('Content-Length', stat.size.toString());

    return new Response(file.readable, {
      status: this._status,
      headers: this.buildHeaders(),
    });
  }

  /**
   * Send a stream response
   */
  stream(readable: ReadableStream): Response {
    return new Response(readable, {
      status: this._status,
      headers: this.buildHeaders(),
    });
  }

  /**
   * Send an empty response
   */
  empty(): Response {
    this._body = null;
    return this.build();
  }

  /**
   * Send a 204 No Content response
   */
  noContent(): Response {
    this._status = 204;
    this._body = null;
    return this.build();
  }

  /**
   * Send a 404 Not Found response
   */
  notFound(message = 'Not Found'): Response {
    this._status = 404;
    return this.json({ error: message });
  }

  /**
   * Send a 400 Bad Request response
   */
  badRequest(message = 'Bad Request'): Response {
    this._status = 400;
    return this.json({ error: message });
  }

  /**
   * Send a 401 Unauthorized response
   */
  unauthorized(message = 'Unauthorized'): Response {
    this._status = 401;
    return this.json({ error: message });
  }

  /**
   * Send a 403 Forbidden response
   */
  forbidden(message = 'Forbidden'): Response {
    this._status = 403;
    return this.json({ error: message });
  }

  /**
   * Send a 500 Internal Server Error response
   */
  serverError(message = 'Internal Server Error'): Response {
    this._status = 500;
    return this.json({ error: message });
  }

  /**
   * Build the final Response object
   */
  build(): Response {
    return new Response(this._body, {
      status: this._status,
      headers: this.buildHeaders(),
    });
  }

  /**
   * Build headers including cookies
   */
  private buildHeaders(): Headers {
    const headers = new Headers(this._headers);
    for (const cookie of this._cookies) {
      headers.append('Set-Cookie', cookie);
    }
    return headers;
  }
}

/**
 * Common MIME types
 */
const MIME_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  mjs: 'application/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  pdf: 'application/pdf',
  zip: 'application/zip',
};
