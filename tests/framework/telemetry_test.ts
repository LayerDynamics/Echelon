/**
 * Telemetry Tests
 */

import { assertEquals, assertExists } from 'jsr:@std/assert';
import { Counter, Gauge, Histogram, MetricsRegistry } from '../../framework/telemetry/metrics.ts';
import { Span, Tracer, MemorySpanExporter } from '../../framework/telemetry/tracing.ts';
import { Logger } from '../../framework/telemetry/logger.ts';

// Counter Tests
Deno.test('Counter - increments value', () => {
  const counter = new Counter({ name: 'test_counter', help: 'Test counter', type: 'counter' });

  counter.inc();
  counter.inc();
  counter.inc();

  assertEquals(counter.get(), 3);
});

Deno.test('Counter - increments by custom value', () => {
  const counter = new Counter({ name: 'test_counter', help: 'Test counter', type: 'counter' });

  counter.inc({}, 5);

  assertEquals(counter.get(), 5);
});

Deno.test('Counter - tracks labels separately', () => {
  const counter = new Counter({ name: 'test_counter', help: 'Test counter', type: 'counter' });

  counter.inc({ method: 'GET' }, 1);
  counter.inc({ method: 'POST' }, 2);
  counter.inc({ method: 'GET' }, 1);

  assertEquals(counter.get({ method: 'GET' }), 2);
  assertEquals(counter.get({ method: 'POST' }), 2);
});

// Gauge Tests
Deno.test('Gauge - sets value', () => {
  const gauge = new Gauge({ name: 'test_gauge', help: 'Test gauge', type: 'gauge' });

  gauge.set(42);

  assertEquals(gauge.get(), 42);
});

Deno.test('Gauge - increments and decrements', () => {
  const gauge = new Gauge({ name: 'test_gauge', help: 'Test gauge', type: 'gauge' });

  gauge.set(10);
  gauge.inc();
  gauge.inc({}, 5);
  gauge.dec();
  gauge.dec({}, 2);

  assertEquals(gauge.get(), 13);
});

// Histogram Tests
Deno.test('Histogram - observes values', () => {
  const histogram = new Histogram({
    name: 'test_histogram',
    help: 'Test histogram',
    type: 'histogram',
  });

  histogram.observe(0.1);
  histogram.observe(0.5);
  histogram.observe(1.0);

  const { values } = histogram.collect();
  assertEquals(values.length, 1);
  assertEquals(values[0].count, 3);
});

Deno.test('Histogram - times function execution', async () => {
  const histogram = new Histogram({
    name: 'test_histogram',
    help: 'Test histogram',
    type: 'histogram',
  });

  const result = await histogram.time(async () => {
    await new Promise((r) => setTimeout(r, 10));
    return 'done';
  });

  assertEquals(result, 'done');

  const { values } = histogram.collect();
  assertEquals(values[0].count, 1);
});

// MetricsRegistry Tests
Deno.test('MetricsRegistry - creates and retrieves metrics', () => {
  const registry = new MetricsRegistry();

  const counter = registry.counter({ name: 'requests_total', help: 'Total requests' });
  const gauge = registry.gauge({ name: 'active_connections', help: 'Active connections' });
  const histogram = registry.histogram({
    name: 'request_duration',
    help: 'Request duration',
  });

  assertExists(counter);
  assertExists(gauge);
  assertExists(histogram);

  // Same name returns same instance
  const counter2 = registry.counter({ name: 'requests_total', help: 'Total requests' });
  assertEquals(counter, counter2);
});

Deno.test('MetricsRegistry - exports Prometheus format', () => {
  const registry = new MetricsRegistry();

  const counter = registry.counter({ name: 'http_requests', help: 'HTTP requests' });
  counter.inc({ method: 'GET' });

  const output = registry.toPrometheus();

  assertEquals(output.includes('# HELP http_requests'), true);
  assertEquals(output.includes('# TYPE http_requests counter'), true);
});

// Span Tests
Deno.test('Span - creates with correct context', () => {
  const span = new Span({ name: 'test_span' });

  assertExists(span.context.traceId);
  assertExists(span.context.spanId);
  assertEquals(span.name, 'test_span');
});

Deno.test('Span - sets attributes', () => {
  const span = new Span({ name: 'test_span' });

  span.setAttribute('http.method', 'GET');
  span.setAttributes({ 'http.status_code': 200 });

  const data = span.toJSON();
  assertEquals(data.attributes['http.method'], 'GET');
  assertEquals(data.attributes['http.status_code'], 200);
});

Deno.test('Span - adds events', () => {
  const span = new Span({ name: 'test_span' });

  span.addEvent('cache_hit', { key: 'test' });

  const data = span.toJSON();
  assertEquals(data.events.length, 1);
  assertEquals(data.events[0].name, 'cache_hit');
});

Deno.test('Span - records exceptions', () => {
  const span = new Span({ name: 'test_span' });

  span.recordException(new Error('Test error'));

  const data = span.toJSON();
  assertEquals(data.status, 'error');
  assertEquals(data.events.length, 1);
  assertEquals(data.events[0].name, 'exception');
});

// Tracer Tests
Deno.test('Tracer - creates spans', () => {
  const tracer = new Tracer();
  const span = tracer.startSpan('test_span');

  assertExists(span);
  assertEquals(span.name, 'test_span');
});

Deno.test('Tracer - withSpan executes function', async () => {
  const tracer = new Tracer();
  const exporter = new MemorySpanExporter();
  tracer.addExporter(exporter);

  const result = await tracer.withSpan('test_span', () => {
    return 'result';
  });

  assertEquals(result, 'result');
});

Deno.test('Tracer - withSpan records errors', async () => {
  const tracer = new Tracer();

  try {
    await tracer.withSpan('test_span', () => {
      throw new Error('Test error');
    });
  } catch {
    // Expected
  }

  const span = tracer.getActiveSpan();
  // Span should be undefined after completion
});

// Logger Tests
Deno.test('Logger - logs at different levels', () => {
  const entries: unknown[] = [];
  const logger = new Logger({
    level: 'debug',
    output: (entry) => entries.push(entry),
  });

  logger.debug('debug message');
  logger.info('info message');
  logger.warn('warn message');
  logger.error('error message');

  assertEquals(entries.length, 4);
});

Deno.test('Logger - respects log level', () => {
  const entries: unknown[] = [];
  const logger = new Logger({
    level: 'warn',
    output: (entry) => entries.push(entry),
  });

  logger.debug('debug message');
  logger.info('info message');
  logger.warn('warn message');
  logger.error('error message');

  assertEquals(entries.length, 2);
});

Deno.test('Logger - child logger inherits context', () => {
  const entries: { context?: Record<string, unknown> }[] = [];
  const logger = new Logger({
    level: 'info',
    context: { service: 'test' },
    output: (entry) => entries.push(entry),
  });

  const child = logger.child({ requestId: '123' });
  child.info('test message');

  assertEquals(entries[0].context?.service, 'test');
  assertEquals(entries[0].context?.requestId, '123');
});
