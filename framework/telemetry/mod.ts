/**
 * Layer 18: Telemetry & Observability
 *
 * Cross-cutting observability concerns.
 *
 * Responsibilities:
 * - Metrics collection (Prometheus-compatible)
 * - Distributed tracing (W3C Trace Context)
 * - Structured logging (JSON format)
 * - Request correlation
 */

export {
  Counter,
  Gauge,
  Histogram,
  MetricsRegistry,
  getMetrics,
  type MetricOptions,
  type CounterMetric,
  type GaugeMetric,
  type HistogramMetric,
  type MetricType,
} from './metrics.ts';

export {
  Span,
  Tracer,
  ConsoleSpanExporter,
  MemorySpanExporter,
  getTracer,
  setTracer,
  type SpanContext,
  type SpanOptions,
  // SpanKind is exported from OTEL integration below instead
  type SpanEvent,
  type SpanStatus,
  type SpanData,
  type SpanExporter,
} from './tracing.ts';

export {
  Logger,
  getLogger,
  setLogger,
  log,
  createRequestLogger,
  type LogLevel,
  type LogEntry,
  type LoggerOptions,
  type RequestLogContext,
} from './logger.ts';

// ============================================================================
// OpenTelemetry Integration
// ============================================================================

export {
  // Environment detection
  isOTELEnabled,
  getOTELConfig,
  // Span access and manipulation
  getActiveSpan,
  setRouteAttribute,
  setSpanAttributes,
  recordSpanException,
  setSpanOk,
  addSpanEvent,
  // Tracer and meter access
  getOTELTracer,
  getOTELMeter,
  // Span creation utilities
  withSpan,
  withSpanSync,
  withDbSpan,
  withHttpClientSpan,
  // Re-exports from @opentelemetry/api
  trace,
  metrics,
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  type OTELConfig,
  type CreateSpanOptions,
  type Tracer as OTELTracer,
  type Meter as OTELMeter,
  type Span as OTELSpan,
  type Context as OTELContext,
  type SpanContext as OTELSpanContext,
  type Attributes as OTELAttributes,
} from './otel.ts';

// ============================================================================
// OpenTelemetry Metrics
// ============================================================================

export {
  OTelMetrics,
  getOTelMetrics,
  createOTelMetrics,
  type HttpRequestAttributes,
  type CacheAttributes,
  type DbAttributes,
  type JobAttributes,
  type AuthAttributes,
} from './otel_metrics.ts';

// ============================================================================
// OpenTelemetry Context Propagation
// ============================================================================

export {
  // Context extraction/injection
  extractContextFromHeaders,
  injectContextIntoHeaders,
  // Request context management
  setRequestContext,
  getRequestContext,
  clearRequestContext,
  setRequestSpan,
  getRequestSpan,
  // Context-aware execution
  runWithContext,
  runWithContextSync,
  runWithSpan,
  runWithSpanSync,
  // Child span creation
  createChildSpan,
  withChildSpan,
  // Trace utilities
  getCurrentTraceId,
  getCurrentSpanId,
  isCurrentSpanSampled,
  createSpanLink,
  // HTTP helpers
  createHttpServerSpan,
  endHttpServerSpan,
  type HttpServerSpanOptions,
} from './otel_context.ts';
