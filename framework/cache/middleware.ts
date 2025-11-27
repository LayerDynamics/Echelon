/**
 * Cache Middleware
 *
 * HTTP response caching middleware.
 */

import type { LegacyMiddleware } from '../http/types.ts';
import { Cache, getCache } from './cache.ts';

export interface CacheMiddlewareOptions {
  ttl?: number;
  cache?: Cache;
  keyGenerator?: (req: { method: string; url: string }) => string;
  condition?: (req: { method: string }) => boolean;
}

const DEFAULT_OPTIONS: CacheMiddlewareOptions = {
  ttl: 300, // 5 minutes
  keyGenerator: (req) => `http:${req.method}:${req.url}`,
  condition: (req) => req.method === 'GET',
};

/**
 * Create cache middleware
 */
export function cacheMiddleware(options: CacheMiddlewareOptions = {}): LegacyMiddleware {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const cache = opts.cache ?? getCache();

  return async (req, res, next) => {
    // Skip caching if condition not met
    if (!opts.condition!(req)) {
      return await next();
    }

    const key = opts.keyGenerator!(req);

    // Check cache
    const cached = await cache.get<CachedResponse>(key);
    if (cached) {
      // Set cache headers
      res.header('X-Cache', 'HIT');
      res.header('Age', String(Math.floor((Date.now() - cached.timestamp) / 1000)));

      // Reconstruct response
      return new Response(cached.body, {
        status: cached.status,
        headers: new Headers(cached.headers),
      });
    }

    // Execute request
    const response = await next();

    // Cache successful GET responses
    if (response instanceof Response && response.status === 200) {
      const body = await response.clone().text();

      const cachedResponse: CachedResponse = {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body,
        timestamp: Date.now(),
      };

      await cache.set(key, cachedResponse, opts.ttl);

      // Add cache headers
      const headers = new Headers(response.headers);
      headers.set('X-Cache', 'MISS');
      headers.set('Cache-Control', `max-age=${opts.ttl}`);

      return new Response(body, {
        status: response.status,
        headers,
      });
    }

    return response;
  };
}

interface CachedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  timestamp: number;
}

/**
 * Create a cache-control middleware
 */
export function cacheControl(options: {
  maxAge?: number;
  sMaxAge?: number;
  staleWhileRevalidate?: number;
  staleIfError?: number;
  public?: boolean;
  private?: boolean;
  noStore?: boolean;
  noCache?: boolean;
  mustRevalidate?: boolean;
}): LegacyMiddleware {
  return async (_req, res, next) => {
    const response = await next();

    if (response instanceof Response) {
      const directives: string[] = [];

      if (options.public) directives.push('public');
      if (options.private) directives.push('private');
      if (options.noStore) directives.push('no-store');
      if (options.noCache) directives.push('no-cache');
      if (options.mustRevalidate) directives.push('must-revalidate');
      if (options.maxAge !== undefined) directives.push(`max-age=${options.maxAge}`);
      if (options.sMaxAge !== undefined) directives.push(`s-maxage=${options.sMaxAge}`);
      if (options.staleWhileRevalidate !== undefined) {
        directives.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
      }
      if (options.staleIfError !== undefined) {
        directives.push(`stale-if-error=${options.staleIfError}`);
      }

      const headers = new Headers(response.headers);
      headers.set('Cache-Control', directives.join(', '));

      return new Response(response.body, {
        status: response.status,
        headers,
      });
    }

    return response;
  };
}
