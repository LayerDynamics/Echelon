/**
 * CORS Middleware
 *
 * Handles Cross-Origin Resource Sharing (CORS) headers
 * and preflight OPTIONS requests.
 */

import type { LegacyMiddleware } from '../http/types.ts';

export interface CorsOptions {
  origin?: string | string[] | ((origin: string) => boolean);
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

const DEFAULT_OPTIONS: CorsOptions = {
  origin: '*',
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: [],
  credentials: false,
  maxAge: 86400, // 24 hours
};

/**
 * Create CORS middleware
 */
export function corsMiddleware(options: CorsOptions = {}): LegacyMiddleware {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return async (req, res, next) => {
    const origin = req.header('Origin');

    // Check if origin is allowed
    const allowedOrigin = getOriginHeader(origin, opts.origin);

    // Set CORS headers
    if (allowedOrigin) {
      res.header('Access-Control-Allow-Origin', allowedOrigin);
    }

    if (opts.credentials) {
      res.header('Access-Control-Allow-Credentials', 'true');
    }

    if (opts.exposedHeaders && opts.exposedHeaders.length > 0) {
      res.header('Access-Control-Expose-Headers', opts.exposedHeaders.join(', '));
    }

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.header('Access-Control-Allow-Methods', opts.methods!.join(', '));
      res.header('Access-Control-Allow-Headers', opts.allowedHeaders!.join(', '));

      if (opts.maxAge) {
        res.header('Access-Control-Max-Age', opts.maxAge.toString());
      }

      return res.status(204).empty();
    }

    return await next();
  };
}

/**
 * Determine the Access-Control-Allow-Origin header value
 */
function getOriginHeader(
  origin: string | null,
  allowed: CorsOptions['origin']
): string | null {
  if (!origin) return null;

  if (allowed === '*') {
    return '*';
  }

  if (typeof allowed === 'string') {
    return origin === allowed ? allowed : null;
  }

  if (Array.isArray(allowed)) {
    return allowed.includes(origin) ? origin : null;
  }

  if (typeof allowed === 'function') {
    return allowed(origin) ? origin : null;
  }

  return null;
}

// Alias for convenience
export const cors = corsMiddleware;
