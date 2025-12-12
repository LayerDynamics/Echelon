/**
 * OpenTelemetry Integration
 *
 * Core utilities for integrating with Deno's built-in OpenTelemetry support.
 * When OTEL_DENO=true, Deno automatically instruments:
 * - Deno.serve() for incoming HTTP requests
 * - fetch() for outgoing HTTP requests
 * - console.* for log capture
 *
 * This module provides utilities to:
 * - Check if OTEL is enabled
 * - Access and annotate active spans
 * - Set route attributes on auto-instrumented spans
 * - Create custom spans for framework operations
 *
 * @module
 */

import {
  trace,
  metrics,
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  type Tracer,
  type Meter,
  type Span,
  type Context,
  type SpanContext,
  type Attributes,
} from '@opentelemetry/api';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * OpenTelemetry configuration options
 */
export interface OTELConfig {
  /** Whether OTEL is enabled (derived from OTEL_DENO env var) */
  enabled: boolean;
  /** Service name for traces (from OTEL_SERVICE_NAME env var) */
  serviceName: string;
  /** OTLP endpoint (from OTEL_EXPORTER_OTLP_ENDPOINT env var) */
  endpoint?: string;
  /** Console capture mode: 'capture' | 'replace' | 'ignore' */
  consoleCapture?: 'capture' | 'replace' | 'ignore';
}

// ============================================================================
// Environment Detection
// ============================================================================

/**
 * Check if OpenTelemetry is enabled via OTEL_DENO environment variable
 */
export function isOTELEnabled(): boolean {
  try {
    return Deno.env.get('OTEL_DENO') === 'true';
  } catch {
    // If we can't read env vars, assume OTEL is not enabled
    return false;
  }
}

/**
 * Get the current OTEL configuration from environment variables
 */
export function getOTELConfig(): OTELConfig {
  try {
    return {
      enabled: isOTELEnabled(),
      serviceName: Deno.env.get('OTEL_SERVICE_NAME') ?? 'echelon',
      endpoint: Deno.env.get('OTEL_EXPORTER_OTLP_ENDPOINT'),
      consoleCapture: (Deno.env.get('OTEL_DENO_CONSOLE') as OTELConfig['consoleCapture']) ??
        'capture',
    };
  } catch {
    return {
      enabled: false,
      serviceName: 'echelon',
    };
  }
}

// ============================================================================
// Span Access and Manipulation
// ============================================================================

/**
 * Get the currently active span from the context
 * Returns undefined if no span is active or OTEL is not enabled
 */
export function getActiveSpan(): Span | undefined {
  if (!isOTELEnabled()) return undefined;
  return trace.getActiveSpan();
}

/**
 * Set the http.route attribute on the active span and optionally update span name
 * This should be called after route matching to annotate Deno's auto-instrumented span
 *
 * @param routePattern - The matched route pattern (e.g., '/users/:id')
 * @param method - The HTTP method
 * @param updateName - Whether to update the span name (default: true)
 */
export function setRouteAttribute(
  routePattern: string,
  method: string,
  updateName = true,
): void {
  const span = getActiveSpan();
  if (span) {
    span.setAttribute('http.route', routePattern);
    if (updateName) {
      span.updateName(`${method} ${routePattern}`);
    }
  }
}

/**
 * Add custom attributes to the active span
 *
 * @param attributes - Key-value pairs to add as span attributes
 */
export function setSpanAttributes(attributes: Attributes): void {
  const span = getActiveSpan();
  if (span) {
    span.setAttributes(attributes);
  }
}

/**
 * Record an exception on the active span and set error status
 *
 * @param error - The error to record
 * @param message - Optional custom error message
 */
export function recordSpanException(error: Error, message?: string): void {
  const span = getActiveSpan();
  if (span) {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: message ?? error.message,
    });
  }
}

/**
 * Set the status of the active span to OK
 */
export function setSpanOk(): void {
  const span = getActiveSpan();
  if (span) {
    span.setStatus({ code: SpanStatusCode.OK });
  }
}

/**
 * Add an event to the active span
 *
 * @param name - Event name
 * @param attributes - Optional event attributes
 */
export function addSpanEvent(name: string, attributes?: Attributes): void {
  const span = getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

// ============================================================================
// Tracer and Meter Access
// ============================================================================

/** Cached tracer instance */
let _tracer: Tracer | undefined;

/** Cached meter instance */
let _meter: Meter | undefined;

/**
 * Get the OpenTelemetry tracer for the Echelon framework
 *
 * @param name - Tracer name (default: 'echelon')
 * @param version - Tracer version (default: '0.1.0')
 */
export function getOTELTracer(name = 'echelon', version = '0.1.0'): Tracer {
  if (!_tracer) {
    _tracer = trace.getTracer(name, version);
  }
  return _tracer;
}

/**
 * Get the OpenTelemetry meter for the Echelon framework
 *
 * @param name - Meter name (default: 'echelon')
 * @param version - Meter version (default: '0.1.0')
 */
export function getOTELMeter(name = 'echelon', version = '0.1.0'): Meter {
  if (!_meter) {
    _meter = metrics.getMeter(name, version);
  }
  return _meter;
}

// ============================================================================
// Span Creation Utilities
// ============================================================================

/**
 * Options for creating a new span
 */
export interface CreateSpanOptions {
  /** Span kind (default: INTERNAL) */
  kind?: SpanKind;
  /** Initial attributes */
  attributes?: Attributes;
  /** Parent context (uses current context if not provided) */
  parentContext?: Context;
}

/**
 * Create a new span and run a function within its context
 * The span is automatically ended when the function completes
 *
 * @param name - Span name
 * @param fn - Async function to run within the span
 * @param options - Span creation options
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options: CreateSpanOptions = {},
): Promise<T> {
  if (!isOTELEnabled()) {
    // When OTEL is disabled, create a no-op span
    const noopSpan = trace.getTracer('noop').startSpan('noop');
    try {
      return await fn(noopSpan);
    } finally {
      noopSpan.end();
    }
  }

  const tracer = getOTELTracer();
  const parentCtx = options.parentContext ?? context.active();

  return tracer.startActiveSpan(
    name,
    {
      kind: options.kind ?? SpanKind.INTERNAL,
      attributes: options.attributes,
    },
    parentCtx,
    async (span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        });
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

/**
 * Create a new span and run a synchronous function within its context
 * The span is automatically ended when the function completes
 *
 * @param name - Span name
 * @param fn - Sync function to run within the span
 * @param options - Span creation options
 */
export function withSpanSync<T>(
  name: string,
  fn: (span: Span) => T,
  options: CreateSpanOptions = {},
): T {
  if (!isOTELEnabled()) {
    const noopSpan = trace.getTracer('noop').startSpan('noop');
    try {
      return fn(noopSpan);
    } finally {
      noopSpan.end();
    }
  }

  const tracer = getOTELTracer();
  const span = tracer.startSpan(name, {
    kind: options.kind ?? SpanKind.INTERNAL,
    attributes: options.attributes,
  }, options.parentContext);

  try {
    const result = fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.recordException(error as Error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: (error as Error).message,
    });
    throw error;
  } finally {
    span.end();
  }
}

// ============================================================================
// Database Span Utilities
// ============================================================================

/**
 * Create a database operation span
 *
 * @param operation - Database operation name (e.g., 'get', 'set', 'delete')
 * @param key - Database key being accessed
 * @param fn - Async function performing the database operation
 */
export async function withDbSpan<T>(
  operation: string,
  key: Deno.KvKey,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return withSpan(`db.${operation}`, fn, {
    kind: SpanKind.CLIENT,
    attributes: {
      'db.system': 'deno_kv',
      'db.operation': operation,
      'db.key': JSON.stringify(key),
    },
  });
}

// ============================================================================
// HTTP Span Utilities
// ============================================================================

/**
 * Create an HTTP client span for outgoing requests
 *
 * @param method - HTTP method
 * @param url - Request URL
 * @param fn - Async function making the HTTP request
 */
export async function withHttpClientSpan<T>(
  method: string,
  url: string,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const urlObj = new URL(url);
  return withSpan(`HTTP ${method}`, fn, {
    kind: SpanKind.CLIENT,
    attributes: {
      'http.method': method,
      'http.url': url,
      'http.scheme': urlObj.protocol.replace(':', ''),
      'http.host': urlObj.host,
      'http.target': urlObj.pathname + urlObj.search,
    },
  });
}

// ============================================================================
// Re-exports from @opentelemetry/api
// ============================================================================

export {
  trace,
  metrics,
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  type Tracer,
  type Meter,
  type Span,
  type Context,
  type SpanContext,
  type Attributes,
};
