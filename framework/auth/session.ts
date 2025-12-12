/**
 * Session Management
 *
 * Handles session creation, storage, and retrieval.
 * Uses Deno KV for session storage.
 */

import { getKV } from '../orm/kv.ts';

export interface SessionData {
  [key: string]: unknown;
}

export interface SessionOptions {
  name?: string;
  maxAge?: number; // in seconds
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  path?: string;
  domain?: string;
  prefix?: string;
}

const DEFAULT_OPTIONS: SessionOptions = {
  name: 'echelon_session',
  maxAge: 86400 * 7, // 7 days
  secure: true,
  httpOnly: true,
  sameSite: 'Lax',
  path: '/',
  prefix: 'sessions',
};

/**
 * Session manager
 */
export class Session {
  private id: string;
  private data: SessionData = {};
  private isNew = true;
  private isModified = false;
  private options: SessionOptions;

  constructor(id: string | null, options: SessionOptions = {}) {
    this.id = id ?? crypto.randomUUID();
    this.isNew = id === null;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Get the session ID
   */
  getId(): string {
    return this.id;
  }

  /**
   * Check if this is a new session
   */
  getIsNew(): boolean {
    return this.isNew;
  }

  /**
   * Get a session value
   */
  get<T>(key: string): T | undefined {
    return this.data[key] as T | undefined;
  }

  /**
   * Set a session value
   */
  set(key: string, value: unknown): void {
    this.data[key] = value;
    this.isModified = true;
  }

  /**
   * Delete a session value
   */
  delete(key: string): void {
    delete this.data[key];
    this.isModified = true;
  }

  /**
   * Check if a key exists
   */
  has(key: string): boolean {
    return key in this.data;
  }

  /**
   * Clear all session data
   */
  clear(): void {
    this.data = {};
    this.isModified = true;
  }

  /**
   * Get all session data
   */
  all(): SessionData {
    return { ...this.data };
  }

  /**
   * Load session from KV store
   */
  async load(): Promise<void> {
    const kv = await getKV();
    const stored = await kv.get<SessionData>([this.options.prefix!, this.id]);

    if (stored) {
      this.data = stored;
      this.isNew = false;
    }
  }

  /**
   * Save session to KV store
   */
  async save(): Promise<void> {
    if (!this.isModified && !this.isNew) {
      return;
    }

    const kv = await getKV();
    const expireIn = this.options.maxAge! * 1000; // Convert to ms

    await kv.set([this.options.prefix!, this.id], this.data, { expireIn });

    this.isNew = false;
    this.isModified = false;
  }

  /**
   * Destroy the session
   */
  async destroy(): Promise<void> {
    const kv = await getKV();
    await kv.delete([this.options.prefix!, this.id]);
    this.data = {};
    this.isNew = true;
  }

  /**
   * Regenerate session ID (for security after login)
   */
  async regenerate(): Promise<void> {
    const oldId = this.id;
    const kv = await getKV();

    // Delete old session
    await kv.delete([this.options.prefix!, oldId]);

    // Create new session ID
    this.id = crypto.randomUUID();
    this.isNew = true;
    this.isModified = true;

    // Save with new ID
    await this.save();
  }

  /**
   * Get cookie options for Set-Cookie header
   */
  getCookieOptions(): SessionOptions {
    return this.options;
  }

  /**
   * Convert session to Set-Cookie header value
   */
  toCookie(): string {
    const parts = [
      `${this.options.name}=${this.id}`
    ];

    if (this.options.maxAge) {
      parts.push(`Max-Age=${this.options.maxAge}`);
    }

    if (this.options.path) {
      parts.push(`Path=${this.options.path}`);
    }

    if (this.options.domain) {
      parts.push(`Domain=${this.options.domain}`);
    }

    if (this.options.secure) {
      parts.push('Secure');
    }

    if (this.options.httpOnly) {
      parts.push('HttpOnly');
    }

    if (this.options.sameSite) {
      parts.push(`SameSite=${this.options.sameSite}`);
    }

    return parts.join('; ');
  }

  /**
   * Flash data - available only for the next request
   */
  flash(key: string, value?: unknown): unknown {
    const flashKey = `_flash_${key}`;

    if (value !== undefined) {
      // Set flash data
      this.set(flashKey, value);
      return;
    }

    // Get and delete flash data
    const flashValue = this.get(flashKey);
    this.delete(flashKey);
    return flashValue;
  }
}

/**
 * Session middleware
 */
export function sessionMiddleware(options: SessionOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return async (
    req: { cookie: (name: string) => string | undefined; state: Map<string, unknown> },
    res: { cookie: (name: string, value: string, options?: object) => void },
    next: () => Promise<Response | void>
  ) => {
    // Get session ID from cookie
    const sessionId = req.cookie(opts.name!);

    // Create session instance
    const session = new Session(sessionId ?? null, opts);

    // Load existing session data
    if (sessionId) {
      await session.load();
    }

    // Attach session to request
    req.state.set('session', session);

    // Continue with request
    const response = await next();

    // Save session after request
    await session.save();

    // Set session cookie if new
    if (session.getIsNew() || !sessionId) {
      res.cookie(opts.name!, session.getId(), {
        maxAge: opts.maxAge,
        secure: opts.secure,
        httpOnly: opts.httpOnly,
        sameSite: opts.sameSite,
        path: opts.path,
        domain: opts.domain,
      });
    }

    return response;
  };
}

/**
 * Context-based session middleware for Application
 * This is the middleware used by app.use()
 */
export function createSessionMiddleware(options: SessionOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  type MiddlewareContext = {
    request: Request;
    url: URL;
    params: Record<string, string>;
    query: URLSearchParams;
    state: Map<string, unknown>;
    header(name: string): string | null;
    method: string;
  };

  return async (
    ctx: MiddlewareContext,
    next: () => Promise<Response>
  ): Promise<Response> => {
    // Parse cookies from request
    const cookieHeader = ctx.request.headers.get('Cookie') ?? '';
    const cookies = new Map<string, string>();
    for (const cookie of cookieHeader.split(';')) {
      const [name, ...rest] = cookie.split('=');
      if (name) {
        cookies.set(name.trim(), rest.join('=').trim());
      }
    }

    // Get session ID from cookie
    const sessionId = cookies.get(opts.name!);
    const hadCookie = sessionId !== undefined;

    // Create session instance
    const session = new Session(sessionId ?? null, opts);

    // Load existing session data
    if (sessionId) {
      await session.load();
    }

    // Attach session to context state
    ctx.state.set('session', session);

    // Continue with request
    const response = await next();

    // Save session after request
    await session.save();

    // Set session cookie if we didn't have one before
    if (!hadCookie) {
      const headers = new Headers(response.headers);
      headers.append('Set-Cookie', session.toCookie());

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return response;
  };
}
