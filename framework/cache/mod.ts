/**
 * Layer 7: Caching Layer
 *
 * Multi-level caching to reduce database load and improve response times.
 *
 * Responsibilities:
 * - Reduce database load
 * - Improve response times
 * - Scale read-heavy workloads
 * - Manage cache invalidation complexity
 * - Provide multiple cache strategies
 */

export { Cache, type CacheOptions, type CacheEntry } from './cache.ts';
export { cacheMiddleware, type CacheMiddlewareOptions } from './middleware.ts';
