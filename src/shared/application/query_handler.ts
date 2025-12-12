/**
 * Query Handler
 *
 * Base interface for query handlers in CQRS pattern.
 * Handlers execute queries and return read-only data.
 *
 * @module
 */

import type { Query, QueryResult } from './query.ts';

/**
 * Base interface for query handlers
 */
export interface QueryHandler<TQuery extends Query, TResult = unknown> {
  /**
   * Handle the query
   */
  handle(query: TQuery): Promise<QueryResult<TResult>>;
}

/**
 * Query handler decorator for caching
 */
export function withCaching<TQuery extends Query, TResult>(
  handler: QueryHandler<TQuery, TResult>,
  getCacheKey: (query: TQuery) => string,
  cache: Map<string, { data: TResult; timestamp: number }>,
  ttl: number = 300000 // 5 minutes default
): QueryHandler<TQuery, TResult> {
  return {
    async handle(query: TQuery): Promise<QueryResult<TResult>> {
      const cacheKey = getCacheKey(query);
      const cached = cache.get(cacheKey);

      // Check if cached and not expired
      if (cached && Date.now() - cached.timestamp < ttl) {
        return {
          success: true,
          data: cached.data,
          cached: true,
        };
      }

      // Execute query
      const start = performance.now();
      const result = await handler.handle(query);
      const executionTime = performance.now() - start;

      // Cache successful result
      if (result.success && result.data !== undefined) {
        cache.set(cacheKey, {
          data: result.data,
          timestamp: Date.now(),
        });
      }

      return {
        ...result,
        cached: false,
        executionTime,
      };
    },
  };
}

/**
 * Query handler decorator for logging
 */
export function withQueryLogging<TQuery extends Query, TResult>(
  handler: QueryHandler<TQuery, TResult>
): QueryHandler<TQuery, TResult> {
  return {
    async handle(query: TQuery): Promise<QueryResult<TResult>> {
      const start = performance.now();
      try {
        console.log(`[Query] Handling ${query.constructor.name}`, {
          queryId: query.queryId,
          userId: query.userId,
        });

        const result = await handler.handle(query);

        const duration = performance.now() - start;
        console.log(`[Query] Completed ${query.constructor.name}`, {
          queryId: query.queryId,
          success: result.success,
          cached: result.cached,
          duration: `${duration.toFixed(2)}ms`,
        });

        return result;
      } catch (error) {
        const duration = performance.now() - start;
        console.error(`[Query] Failed ${query.constructor.name}`, {
          queryId: query.queryId,
          error: error instanceof Error ? error.message : String(error),
          duration: `${duration.toFixed(2)}ms`,
        });
        throw error;
      }
    },
  };
}

/**
 * Base query handler implementation
 */
export abstract class BaseQueryHandler<TQuery extends Query, TResult = unknown>
  implements QueryHandler<TQuery, TResult> {
  /**
   * Handle the query (must be implemented by subclasses)
   */
  abstract handle(query: TQuery): Promise<QueryResult<TResult>>;

  /**
   * Create success result
   */
  protected success(data: TResult, cached: boolean = false): QueryResult<TResult> {
    return {
      success: true,
      data,
      cached,
    };
  }

  /**
   * Create error result
   */
  protected error(error: Error): QueryResult<TResult> {
    return {
      success: false,
      error,
    };
  }
}
