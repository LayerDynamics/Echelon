/**
 * Distributed Tracing
 *
 * Simple tracing implementation for request tracking.
 */

export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
}

export interface SpanOptions {
  name: string;
  kind?: SpanKind;
  attributes?: Record<string, string | number | boolean>;
  parent?: SpanContext;
}

export type SpanKind = 'internal' | 'server' | 'client' | 'producer' | 'consumer';

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, string | number | boolean>;
}

export type SpanStatus = 'ok' | 'error' | 'unset';

/**
 * A span represents a single operation within a trace
 */
export class Span {
  readonly context: SpanContext;
  readonly name: string;
  readonly kind: SpanKind;
  readonly startTime: number;

  private _endTime?: number;
  private _status: SpanStatus = 'unset';
  private _statusMessage?: string;
  private attributes: Record<string, string | number | boolean>;
  private events: SpanEvent[] = [];

  constructor(options: SpanOptions) {
    this.name = options.name;
    this.kind = options.kind ?? 'internal';
    this.startTime = performance.now();
    this.attributes = options.attributes ?? {};

    this.context = {
      traceId: options.parent?.traceId ?? generateId(32),
      spanId: generateId(16),
      parentSpanId: options.parent?.spanId,
      sampled: options.parent?.sampled ?? true,
    };
  }

  /**
   * Set an attribute on the span
   */
  setAttribute(key: string, value: string | number | boolean): this {
    this.attributes[key] = value;
    return this;
  }

  /**
   * Set multiple attributes
   */
  setAttributes(attributes: Record<string, string | number | boolean>): this {
    Object.assign(this.attributes, attributes);
    return this;
  }

  /**
   * Add an event to the span
   */
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): this {
    this.events.push({
      name,
      timestamp: performance.now(),
      attributes,
    });
    return this;
  }

  /**
   * Set the span status
   */
  setStatus(status: SpanStatus, message?: string): this {
    this._status = status;
    this._statusMessage = message;
    return this;
  }

  /**
   * Record an exception
   */
  recordException(error: Error): this {
    this.addEvent('exception', {
      'exception.type': error.name,
      'exception.message': error.message,
      'exception.stacktrace': error.stack ?? '',
    });
    this.setStatus('error', error.message);
    return this;
  }

  /**
   * End the span
   */
  end(): void {
    if (this._endTime === undefined) {
      this._endTime = performance.now();
    }
  }

  /**
   * Get span duration in milliseconds
   */
  get duration(): number | undefined {
    if (this._endTime === undefined) return undefined;
    return this._endTime - this.startTime;
  }

  /**
   * Get span status
   */
  get status(): SpanStatus {
    return this._status;
  }

  /**
   * Get span status message
   */
  get statusMessage(): string | undefined {
    return this._statusMessage;
  }

  /**
   * Get span end time
   */
  get endTime(): number | undefined {
    return this._endTime;
  }

  /**
   * Export span data
   */
  toJSON(): SpanData {
    return {
      traceId: this.context.traceId,
      spanId: this.context.spanId,
      parentSpanId: this.context.parentSpanId,
      name: this.name,
      kind: this.kind,
      startTime: this.startTime,
      endTime: this._endTime,
      duration: this.duration,
      status: this._status,
      statusMessage: this._statusMessage,
      attributes: this.attributes,
      events: this.events,
    };
  }
}

export interface SpanData {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: SpanStatus;
  statusMessage?: string;
  attributes: Record<string, string | number | boolean>;
  events: SpanEvent[];
}

/**
 * Span exporter interface
 */
export interface SpanExporter {
  export(spans: SpanData[]): Promise<void>;
}

/**
 * Console span exporter for development
 */
export class ConsoleSpanExporter implements SpanExporter {
  export(spans: SpanData[]): Promise<void> {
    for (const span of spans) {
      console.log(
        `[Trace] ${span.name} - ${span.duration?.toFixed(2)}ms`,
        JSON.stringify(span, null, 2)
      );
    }
    return Promise.resolve();
  }
}

/**
 * Memory span exporter for testing
 */
export class MemorySpanExporter implements SpanExporter {
  private spans: SpanData[] = [];

  export(spans: SpanData[]): Promise<void> {
    this.spans.push(...spans);
    return Promise.resolve();
  }

  getSpans(): SpanData[] {
    return [...this.spans];
  }

  clear(): void {
    this.spans = [];
  }
}

/**
 * Tracer for creating spans
 */
export class Tracer {
  private currentSpan?: Span;
  private exporters: SpanExporter[] = [];
  private spans: Span[] = [];
  private sampleRate: number;

  constructor(options: TracerOptions = {}) {
    this.sampleRate = options.sampleRate ?? 1.0;
    if (options.exporters) {
      this.exporters = options.exporters;
    }
  }

  /**
   * Add an exporter
   */
  addExporter(exporter: SpanExporter): this {
    this.exporters.push(exporter);
    return this;
  }

  /**
   * Start a new span
   */
  startSpan(name: string, options: Partial<SpanOptions> = {}): Span {
    const shouldSample = Math.random() < this.sampleRate;

    const span = new Span({
      name,
      ...options,
      parent: options.parent ?? this.currentSpan?.context,
    });

    if (!shouldSample) {
      span.context.sampled = false;
    }

    this.currentSpan = span;
    this.spans.push(span);

    return span;
  }

  /**
   * Get the current active span
   */
  getActiveSpan(): Span | undefined {
    return this.currentSpan;
  }

  /**
   * Run a function within a span
   */
  async withSpan<T>(
    name: string,
    fn: (span: Span) => T | Promise<T>,
    options: Partial<SpanOptions> = {}
  ): Promise<T> {
    const span = this.startSpan(name, options);
    const previousSpan = this.currentSpan;

    try {
      this.currentSpan = span;
      const result = await fn(span);
      span.setStatus('ok');
      return result;
    } catch (error) {
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
      this.currentSpan = previousSpan;
    }
  }

  /**
   * Flush spans to exporters
   */
  async flush(): Promise<void> {
    const completedSpans = this.spans
      .filter((s) => s.endTime !== undefined && s.context.sampled)
      .map((s) => s.toJSON());

    if (completedSpans.length === 0) return;

    await Promise.all(this.exporters.map((e) => e.export(completedSpans)));

    // Clear exported spans
    this.spans = this.spans.filter((s) => s.endTime === undefined);
  }

  /**
   * Extract trace context from headers
   */
  extractContext(headers: Headers): SpanContext | undefined {
    // W3C Trace Context format
    const traceparent = headers.get('traceparent');
    if (!traceparent) return undefined;

    const parts = traceparent.split('-');
    if (parts.length !== 4) return undefined;

    const [_version, traceId, spanId, flags] = parts;

    return {
      traceId,
      spanId,
      sampled: (parseInt(flags, 16) & 0x01) === 0x01,
    };
  }

  /**
   * Inject trace context into headers
   */
  injectContext(headers: Headers, context: SpanContext): void {
    const flags = context.sampled ? '01' : '00';
    headers.set('traceparent', `00-${context.traceId}-${context.spanId}-${flags}`);
  }
}

interface TracerOptions {
  sampleRate?: number;
  exporters?: SpanExporter[];
}

/**
 * Generate a random hex ID
 */
function generateId(length: number): string {
  const bytes = new Uint8Array(length / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Default tracer
let defaultTracer: Tracer | null = null;

/**
 * Get the default tracer
 */
export function getTracer(): Tracer {
  if (!defaultTracer) {
    defaultTracer = new Tracer();
  }
  return defaultTracer;
}

/**
 * Set the default tracer
 */
export function setTracer(tracer: Tracer): void {
  defaultTracer = tracer;
}
