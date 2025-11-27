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
  type SpanKind,
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
