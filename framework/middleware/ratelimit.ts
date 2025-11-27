/**
 * Rate Limiting Middleware
 *
 * Protects against abuse by limiting request rates per IP/user.
 */

import type { LegacyMiddleware } from '../http/types.ts';

export interface RateLimitOptions {
  windowMs?: number; // Time window in milliseconds
  max?: number; // Max requests per window
  keyGenerator?: (req: { ip: string; state: Map<string, unknown> }) => string;
  handler?: (req: unknown, res: { status: (code: number) => { json: (data: unknown) => Response } }) => Response;
  skipFailedRequests?: boolean;
  headers?: boolean;
}

const DEFAULT_OPTIONS: RateLimitOptions = {
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  keyGenerator: (req) => req.ip,
  skipFailedRequests: false,
  headers: true,
};

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * In-memory rate limit store
 */
class RateLimitStore {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: number;

  constructor(windowMs: number) {
    // Clean up expired entries periodically
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, windowMs);
  }

  get(key: string): RateLimitEntry | undefined {
    return this.store.get(key);
  }

  set(key: string, entry: RateLimitEntry): void {
    this.store.set(key, entry);
  }

  increment(key: string, windowMs: number): RateLimitEntry {
    const now = Date.now();
    const existing = this.store.get(key);

    if (existing && existing.resetTime > now) {
      existing.count++;
      return existing;
    }

    const entry: RateLimitEntry = {
      count: 1,
      resetTime: now + windowMs,
    };
    this.store.set(key, entry);
    return entry;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime <= now) {
        this.store.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

/**
 * Create rate limiting middleware
 */
export function rateLimitMiddleware(options: RateLimitOptions = {}): LegacyMiddleware {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const store = new RateLimitStore(opts.windowMs!);

  return async (req, res, next) => {
    const key = opts.keyGenerator!(req);
    const entry = store.increment(key, opts.windowMs!);

    // Calculate remaining requests
    const remaining = Math.max(0, opts.max! - entry.count);
    const resetTime = entry.resetTime;

    // Set rate limit headers
    if (opts.headers) {
      res.header('X-RateLimit-Limit', opts.max!.toString());
      res.header('X-RateLimit-Remaining', remaining.toString());
      res.header('X-RateLimit-Reset', Math.ceil(resetTime / 1000).toString());
    }

    // Check if limit exceeded
    if (entry.count > opts.max!) {
      if (opts.handler) {
        return opts.handler(req, res);
      }

      res.header('Retry-After', Math.ceil((resetTime - Date.now()) / 1000).toString());
      return res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil((resetTime - Date.now()) / 1000),
      });
    }

    // Continue with request
    const response = await next();

    // Skip failed requests from count if configured
    if (opts.skipFailedRequests && response instanceof Response) {
      if (response.status >= 400) {
        entry.count--;
      }
    }

    return response;
  };
}

/**
 * Create a stricter rate limit for specific routes
 */
export function strictRateLimit(max: number, windowMs: number): LegacyMiddleware {
  return rateLimitMiddleware({ max, windowMs });
}

// Alias for convenience
export const rateLimit = rateLimitMiddleware;
