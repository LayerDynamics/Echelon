/**
 * OpenTelemetry Metrics
 *
 * Provides a metrics implementation using OpenTelemetry Meter API.
 * When OTEL_DENO=true, metrics are automatically exported to the OTLP endpoint.
 *
 * @module
 */

import {
  type Counter,
  type Histogram,
  type UpDownCounter,
  type ObservableGauge,
  type Attributes,
} from '@opentelemetry/api';
import { getOTELMeter, isOTELEnabled } from './otel.ts';

// ============================================================================
// Types
// ============================================================================

/**
 * HTTP request attributes for metrics
 */
export interface HttpRequestAttributes {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}

/**
 * Cache operation attributes
 */
export interface CacheAttributes {
  key?: string;
  source?: 'memory' | 'kv';
  reason?: string;
}

/**
 * Database operation attributes
 */
export interface DbAttributes {
  operation: string;
  table?: string;
  durationMs: number;
}

/**
 * Job operation attributes
 */
export interface JobAttributes {
  name: string;
  queue?: string;
  status: 'completed' | 'failed' | 'retried';
  durationMs: number;
}

/**
 * Auth operation attributes
 */
export interface AuthAttributes {
  method?: string;
  success: boolean;
  reason?: string;
  durationMs?: number;
}

// ============================================================================
// OTel Metrics Class
// ============================================================================

/**
 * OpenTelemetry Metrics manager for the Echelon framework.
 * Provides pre-defined metrics for HTTP, cache, database, jobs, and auth.
 */
export class OTelMetrics {
  // HTTP Metrics
  private httpRequestsTotal: Counter | null = null;
  private httpRequestDuration: Histogram | null = null;
  private httpActiveRequests: UpDownCounter | null = null;
  private httpRequestBodySize: Histogram | null = null;
  private httpResponseBodySize: Histogram | null = null;

  // Cache Metrics
  private cacheHits: Counter | null = null;
  private cacheMisses: Counter | null = null;
  private cacheOperationDuration: Histogram | null = null;

  // Database Metrics
  private dbOperationsTotal: Counter | null = null;
  private dbOperationDuration: Histogram | null = null;
  private dbConnectionsActive: UpDownCounter | null = null;

  // Job Metrics
  private jobsProcessed: Counter | null = null;
  private jobsFailed: Counter | null = null;
  private jobDuration: Histogram | null = null;
  private jobsQueued: UpDownCounter | null = null;

  // Auth Metrics
  private authAttempts: Counter | null = null;
  private authFailures: Counter | null = null;
  private authDuration: Histogram | null = null;

  // Middleware Metrics
  private middlewareDuration: Histogram | null = null;

  private initialized = false;

  /**
   * Initialize all OTel metrics instruments.
   * Should be called once when the application starts.
   */
  initialize(): void {
    if (this.initialized || !isOTELEnabled()) return;

    const meter = getOTELMeter();

    // HTTP Metrics
    this.httpRequestsTotal = meter.createCounter('http.server.request.total', {
      description: 'Total number of HTTP requests received',
      unit: '{request}',
    });

    this.httpRequestDuration = meter.createHistogram('http.server.request.duration', {
      description: 'HTTP request duration',
      unit: 'ms',
    });

    this.httpActiveRequests = meter.createUpDownCounter('http.server.active_requests', {
      description: 'Number of active HTTP requests',
      unit: '{request}',
    });

    this.httpRequestBodySize = meter.createHistogram('http.server.request.body.size', {
      description: 'Size of HTTP request bodies',
      unit: 'By',
    });

    this.httpResponseBodySize = meter.createHistogram('http.server.response.body.size', {
      description: 'Size of HTTP response bodies',
      unit: 'By',
    });

    // Cache Metrics
    this.cacheHits = meter.createCounter('cache.hits.total', {
      description: 'Total number of cache hits',
      unit: '{hit}',
    });

    this.cacheMisses = meter.createCounter('cache.misses.total', {
      description: 'Total number of cache misses',
      unit: '{miss}',
    });

    this.cacheOperationDuration = meter.createHistogram('cache.operation.duration', {
      description: 'Cache operation duration',
      unit: 'ms',
    });

    // Database Metrics
    this.dbOperationsTotal = meter.createCounter('db.operations.total', {
      description: 'Total number of database operations',
      unit: '{operation}',
    });

    this.dbOperationDuration = meter.createHistogram('db.operation.duration', {
      description: 'Database operation duration',
      unit: 'ms',
    });

    this.dbConnectionsActive = meter.createUpDownCounter('db.connections.active', {
      description: 'Number of active database connections',
      unit: '{connection}',
    });

    // Job Metrics
    this.jobsProcessed = meter.createCounter('jobs.processed.total', {
      description: 'Total number of jobs processed',
      unit: '{job}',
    });

    this.jobsFailed = meter.createCounter('jobs.failed.total', {
      description: 'Total number of failed jobs',
      unit: '{job}',
    });

    this.jobDuration = meter.createHistogram('job.duration', {
      description: 'Job processing duration',
      unit: 'ms',
    });

    this.jobsQueued = meter.createUpDownCounter('jobs.queued', {
      description: 'Number of jobs in queue',
      unit: '{job}',
    });

    // Auth Metrics
    this.authAttempts = meter.createCounter('auth.attempts.total', {
      description: 'Total number of authentication attempts',
      unit: '{attempt}',
    });

    this.authFailures = meter.createCounter('auth.failures.total', {
      description: 'Total number of authentication failures',
      unit: '{failure}',
    });

    this.authDuration = meter.createHistogram('auth.duration', {
      description: 'Authentication operation duration',
      unit: 'ms',
    });

    // Middleware Metrics
    this.middlewareDuration = meter.createHistogram('middleware.duration', {
      description: 'Middleware execution duration',
      unit: 'ms',
    });

    this.initialized = true;
  }

  /**
   * Check if metrics are initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ============================================================================
  // HTTP Methods
  // ============================================================================

  /**
   * Record an HTTP request
   */
  recordHttpRequest(attrs: HttpRequestAttributes): void {
    if (!this.initialized) return;
    const attributes: Attributes = {
      'http.request.method': attrs.method,
      'http.route': attrs.route,
      'http.response.status_code': attrs.statusCode,
    };
    this.httpRequestsTotal?.add(1, attributes);
    this.httpRequestDuration?.record(attrs.durationMs, attributes);
  }

  /**
   * Increment active HTTP requests
   */
  incrementActiveRequests(): void {
    this.httpActiveRequests?.add(1);
  }

  /**
   * Decrement active HTTP requests
   */
  decrementActiveRequests(): void {
    this.httpActiveRequests?.add(-1);
  }

  /**
   * Record HTTP request body size
   */
  recordRequestBodySize(size: number, attrs: { method: string; route: string }): void {
    this.httpRequestBodySize?.record(size, {
      'http.request.method': attrs.method,
      'http.route': attrs.route,
    });
  }

  /**
   * Record HTTP response body size
   */
  recordResponseBodySize(size: number, method: string, status: string): void {
    this.httpResponseBodySize?.record(size, {
      'http.request.method': method,
      'http.response.status_code': status,
    });
  }

  // ============================================================================
  // Cache Methods
  // ============================================================================

  /**
   * Record a cache hit
   */
  recordCacheHit(attrs?: CacheAttributes): void {
    if (!this.initialized) return;
    const attributes: Attributes = {};
    if (attrs?.source) attributes['cache.source'] = attrs.source;
    this.cacheHits?.add(1, attributes);
  }

  /**
   * Record a cache miss
   */
  recordCacheMiss(attrs?: CacheAttributes): void {
    if (!this.initialized) return;
    const attributes: Attributes = {};
    if (attrs?.source) attributes['cache.source'] = attrs.source;
    this.cacheMisses?.add(1, attributes);
  }

  /**
   * Record cache operation duration
   */
  recordCacheOperation(attrs: { operation: string; durationMs: number; source?: 'memory' | 'kv' }): void {
    if (!this.initialized) return;
    const attributes: Attributes = { 'cache.operation': attrs.operation };
    if (attrs.source) attributes['cache.source'] = attrs.source;
    this.cacheOperationDuration?.record(attrs.durationMs, attributes);
  }

  // ============================================================================
  // Database Methods
  // ============================================================================

  /**
   * Record a database operation
   */
  recordDbOperation(attrs: DbAttributes): void {
    if (!this.initialized) return;
    const attributes: Attributes = { 'db.operation': attrs.operation };
    if (attrs.table) attributes['db.table'] = attrs.table;
    this.dbOperationsTotal?.add(1, attributes);
    this.dbOperationDuration?.record(attrs.durationMs, attributes);
  }

  /**
   * Increment active database connections
   */
  incrementDbConnections(): void {
    this.dbConnectionsActive?.add(1);
  }

  /**
   * Decrement active database connections
   */
  decrementDbConnections(): void {
    this.dbConnectionsActive?.add(-1);
  }

  // ============================================================================
  // Job Methods
  // ============================================================================

  /**
   * Record a processed job
   */
  recordJobProcessed(attrs: JobAttributes): void {
    if (!this.initialized) return;
    const attributes: Attributes = {
      'job.name': attrs.name,
      'job.status': attrs.status,
    };
    if (attrs.queue) attributes['job.queue'] = attrs.queue;
    this.jobsProcessed?.add(1, attributes);
    this.jobDuration?.record(attrs.durationMs, attributes);
  }

  /**
   * Record a failed job
   */
  recordJobFailed(attrs: JobAttributes): void {
    if (!this.initialized) return;
    const attributes: Attributes = { 'job.name': attrs.name };
    if (attrs.queue) attributes['job.queue'] = attrs.queue;
    this.jobsFailed?.add(1, attributes);
  }

  /**
   * Update jobs queued count
   */
  updateJobsQueued(delta: number, queue?: string): void {
    const attributes: Attributes = queue ? { 'job.queue': queue } : {};
    this.jobsQueued?.add(delta, attributes);
  }

  // ============================================================================
  // Auth Methods
  // ============================================================================

  /**
   * Record an authentication attempt
   */
  recordAuthAttempt(attrs: AuthAttributes): void {
    if (!this.initialized) return;
    const attributes: Attributes = {
      'auth.success': attrs.success,
    };
    if (attrs.method) attributes['auth.method'] = attrs.method;
    if (attrs.reason) attributes['auth.reason'] = attrs.reason;
    this.authAttempts?.add(1, attributes);
    if (attrs.durationMs) {
      this.authDuration?.record(attrs.durationMs, attributes);
    }
  }

  /**
   * Record an authentication failure
   */
  recordAuthFailure(attrs?: AuthAttributes): void {
    if (!this.initialized) return;
    const attributes: Attributes = {};
    if (attrs?.method) attributes['auth.method'] = attrs.method;
    this.authFailures?.add(1, attributes);
  }

  // ============================================================================
  // Middleware Methods
  // ============================================================================

  /**
   * Record middleware execution duration
   */
  recordMiddleware(attrs: { name: string; durationMs: number }): void {
    if (!this.initialized) return;
    this.middlewareDuration?.record(attrs.durationMs, { 'middleware.name': attrs.name });
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _otelMetrics: OTelMetrics | null = null;

/**
 * Get the OTel metrics instance (singleton)
 */
export function getOTelMetrics(): OTelMetrics {
  if (!_otelMetrics) {
    _otelMetrics = new OTelMetrics();
    _otelMetrics.initialize();
  }
  return _otelMetrics;
}

/**
 * Create a new OTel metrics instance
 */
export function createOTelMetrics(): OTelMetrics {
  const metrics = new OTelMetrics();
  metrics.initialize();
  return metrics;
}
