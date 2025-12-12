/**
 * OpenTelemetry Context Propagation
 *
 * Manages trace context propagation across async boundaries and HTTP requests.
 * Supports W3C Trace Context format for distributed tracing.
 *
 * @module
 */

import {
  trace,
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  type Context,
  type Span,
  type SpanContext,
} from '@opentelemetry/api';
import { isOTELEnabled, getOTELTracer } from './otel.ts';

// ============================================================================
// Request Context Storage
// ============================================================================

/**
 * Storage for request-scoped contexts.
 * Maps request IDs to their associated OTel contexts.
 */
const requestContexts = new Map<string, Context>();

/**
 * Storage for request-scoped root spans.
 * Maps request IDs to their root HTTP server spans.
 */
const requestSpans = new Map<string, Span>();

// ============================================================================
// Context Extraction and Injection
// ============================================================================

/**
 * Extract trace context from incoming HTTP headers.
 * Supports W3C Trace Context format (traceparent, tracestate headers).
 *
 * @param headers - HTTP headers to extract from
 * @returns The extracted context, or the current active context if no trace headers
 */
export function extractContextFromHeaders(headers: Headers): Context {
  if (!isOTELEnabled()) return context.active();

  const carrier: Record<string, string> = {};
  headers.forEach((value, key) => {
    carrier[key.toLowerCase()] = value;
  });

  return propagation.extract(context.active(), carrier);
}

/**
 * Inject trace context into outgoing HTTP headers.
 * Adds W3C Trace Context headers (traceparent, tracestate).
 *
 * @param headers - Headers to inject into
 * @param ctx - Context to inject (uses active context if not provided)
 */
export function injectContextIntoHeaders(headers: Headers, ctx?: Context): void {
  if (!isOTELEnabled()) return;

  const carrier: Record<string, string> = {};
  propagation.inject(ctx ?? context.active(), carrier);

  for (const [key, value] of Object.entries(carrier)) {
    headers.set(key, value);
  }
}

// ============================================================================
// Request Context Management
// ============================================================================

/**
 * Store the OTel context for a request.
 * Should be called at the start of request processing.
 *
 * @param requestId - Unique request identifier
 * @param ctx - Context to store
 */
export function setRequestContext(requestId: string, ctx: Context): void {
  requestContexts.set(requestId, ctx);
}

/**
 * Get the stored OTel context for a request.
 *
 * @param requestId - Unique request identifier
 * @returns The stored context, or undefined if not found
 */
export function getRequestContext(requestId: string): Context | undefined {
  return requestContexts.get(requestId);
}

/**
 * Clear the stored context for a request.
 * Should be called at the end of request processing.
 *
 * @param requestId - Unique request identifier
 */
export function clearRequestContext(requestId: string): void {
  requestContexts.delete(requestId);
  requestSpans.delete(requestId);
}

/**
 * Store the root span for a request.
 *
 * @param requestId - Unique request identifier
 * @param span - Root span for the request
 */
export function setRequestSpan(requestId: string, span: Span): void {
  requestSpans.set(requestId, span);
}

/**
 * Get the root span for a request.
 *
 * @param requestId - Unique request identifier
 * @returns The root span, or undefined if not found
 */
export function getRequestSpan(requestId: string): Span | undefined {
  return requestSpans.get(requestId);
}

// ============================================================================
// Context-Aware Execution
// ============================================================================

/**
 * Run an async function within a specific context.
 * The context will be active for the duration of the function execution.
 *
 * @param ctx - Context to make active
 * @param fn - Async function to run
 * @returns Result of the function
 */
export async function runWithContext<T>(ctx: Context, fn: () => Promise<T>): Promise<T> {
  return context.with(ctx, fn);
}

/**
 * Run a sync function within a specific context.
 *
 * @param ctx - Context to make active
 * @param fn - Sync function to run
 * @returns Result of the function
 */
export function runWithContextSync<T>(ctx: Context, fn: () => T): T {
  return context.with(ctx, fn);
}

/**
 * Run an async function within a span's context.
 * Creates a new context with the span set as active.
 *
 * @param span - Span to make active
 * @param fn - Async function to run
 * @returns Result of the function
 */
export async function runWithSpan<T>(span: Span, fn: () => Promise<T>): Promise<T> {
  const spanContext = trace.setSpan(context.active(), span);
  return context.with(spanContext, fn);
}

/**
 * Run a sync function within a span's context.
 *
 * @param span - Span to make active
 * @param fn - Sync function to run
 * @returns Result of the function
 */
export function runWithSpanSync<T>(span: Span, fn: () => T): T {
  const spanContext = trace.setSpan(context.active(), span);
  return context.with(spanContext, fn);
}

// ============================================================================
// Child Span Creation
// ============================================================================

/**
 * Create a child span with proper parent context.
 * If a requestId is provided, uses the request's context as parent.
 *
 * @param name - Span name
 * @param requestId - Optional request ID to use for parent context
 * @param kind - Span kind (default: INTERNAL)
 * @returns The created span
 */
export function createChildSpan(
  name: string,
  requestId?: string,
  kind: SpanKind = SpanKind.INTERNAL,
): Span {
  if (!isOTELEnabled()) {
    return trace.getTracer('noop').startSpan('noop');
  }

  const tracer = getOTELTracer();
  const parentCtx = requestId ? getRequestContext(requestId) : context.active();

  return tracer.startSpan(name, { kind }, parentCtx);
}

/**
 * Create a child span and run an async function within it.
 * The span is automatically ended when the function completes.
 *
 * @param name - Span name
 * @param fn - Async function to run
 * @param requestId - Optional request ID for parent context
 * @param kind - Span kind (default: INTERNAL)
 * @returns Result of the function
 */
export async function withChildSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  requestId?: string,
  kind: SpanKind = SpanKind.INTERNAL,
): Promise<T> {
  const span = createChildSpan(name, requestId, kind);

  try {
    const result = await runWithSpan(span, () => fn(span));
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
// Trace Context Utilities
// ============================================================================

/**
 * Get the current trace ID from active context.
 *
 * @returns The trace ID, or undefined if no active span
 */
export function getCurrentTraceId(): string | undefined {
  const span = trace.getActiveSpan();
  return span?.spanContext().traceId;
}

/**
 * Get the current span ID from active context.
 *
 * @returns The span ID, or undefined if no active span
 */
export function getCurrentSpanId(): string | undefined {
  const span = trace.getActiveSpan();
  return span?.spanContext().spanId;
}

/**
 * Check if the current span is being sampled.
 *
 * @returns True if sampled, false otherwise
 */
export function isCurrentSpanSampled(): boolean {
  const span = trace.getActiveSpan();
  if (!span) return false;
  return span.spanContext().traceFlags === 1;
}

/**
 * Create a span link to the current active span.
 * Useful for linking spans across different traces.
 *
 * @returns Span link object, or undefined if no active span
 */
export function createSpanLink(): { context: SpanContext } | undefined {
  const span = trace.getActiveSpan();
  if (!span) return undefined;
  return { context: span.spanContext() };
}

// ============================================================================
// HTTP Request Span Helpers
// ============================================================================

/**
 * Options for creating an HTTP server span
 */
export interface HttpServerSpanOptions {
  method: string;
  url: URL;
  headers: Headers;
  requestId: string;
}

/**
 * Create an HTTP server span for an incoming request.
 * Extracts parent context from headers and stores the context for the request.
 *
 * @param options - HTTP request options
 * @returns The created span and context
 */
export function createHttpServerSpan(options: HttpServerSpanOptions): {
  span: Span;
  context: Context;
} {
  if (!isOTELEnabled()) {
    const noopSpan = trace.getTracer('noop').startSpan('noop');
    return { span: noopSpan, context: context.active() };
  }

  const tracer = getOTELTracer();
  const parentCtx = extractContextFromHeaders(options.headers);

  const span = tracer.startSpan(
    `HTTP ${options.method}`,
    {
      kind: SpanKind.SERVER,
      attributes: {
        'http.request.method': options.method,
        'url.full': options.url.href,
        'url.scheme': options.url.protocol.replace(':', ''),
        'url.path': options.url.pathname,
        'url.query': options.url.search,
        'http.user_agent': options.headers.get('user-agent') ?? '',
      },
    },
    parentCtx,
  );

  const spanContext = trace.setSpan(parentCtx, span);
  setRequestContext(options.requestId, spanContext);
  setRequestSpan(options.requestId, span);

  return { span, context: spanContext };
}

/**
 * End an HTTP server span with response information.
 *
 * @param requestId - Request identifier
 * @param status - HTTP status code
 * @param error - Optional error that occurred
 */
export function endHttpServerSpan(
  requestId: string,
  status: number,
  error?: Error,
): void {
  const span = getRequestSpan(requestId);
  if (!span) return;

  span.setAttribute('http.response.status_code', status);

  if (error) {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
  } else if (status >= 400) {
    span.setStatus({ code: SpanStatusCode.ERROR });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }

  span.end();
  clearRequestContext(requestId);
}
