/**
 * OpenTelemetry Core Utilities Tests
 */

import { assertEquals, assertExists, assert } from 'jsr:@std/assert';
import {
  isOTELEnabled,
  getOTELConfig,
  getActiveSpan,
  setRouteAttribute,
  setSpanAttributes,
  recordSpanException,
  setSpanOk,
  addSpanEvent,
  getOTELTracer,
  getOTELMeter,
  withSpan,
  withSpanSync,
  withDbSpan,
  withHttpClientSpan,
  SpanKind,
  SpanStatusCode,
} from '../../framework/telemetry/otel.ts';

// Environment Detection Tests
Deno.test('isOTELEnabled - returns false when OTEL_DENO not set', () => {
  // Ensure env var is not set
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  assertEquals(isOTELEnabled(), false);

  // Restore original value
  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

Deno.test('isOTELEnabled - returns true when OTEL_DENO=true', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  assertEquals(isOTELEnabled(), true);

  // Restore original value
  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

Deno.test('getOTELConfig - returns configuration object', () => {
  const originalDeno = Deno.env.get('OTEL_DENO');
  const originalService = Deno.env.get('OTEL_SERVICE_NAME');
  const originalEndpoint = Deno.env.get('OTEL_EXPORTER_OTLP_ENDPOINT');

  Deno.env.set('OTEL_DENO', 'true');
  Deno.env.set('OTEL_SERVICE_NAME', 'test-service');
  Deno.env.set('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4318');

  const config = getOTELConfig();

  assertEquals(config.enabled, true);
  assertEquals(config.serviceName, 'test-service');
  assertEquals(config.endpoint, 'http://localhost:4318');
  assertExists(config.consoleCapture);

  // Restore original values
  if (originalDeno) {
    Deno.env.set('OTEL_DENO', originalDeno);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
  if (originalService) {
    Deno.env.set('OTEL_SERVICE_NAME', originalService);
  } else {
    Deno.env.delete('OTEL_SERVICE_NAME');
  }
  if (originalEndpoint) {
    Deno.env.set('OTEL_EXPORTER_OTLP_ENDPOINT', originalEndpoint);
  } else {
    Deno.env.delete('OTEL_EXPORTER_OTLP_ENDPOINT');
  }
});

// Span Manipulation Tests (when OTEL is disabled, these should be no-ops)
Deno.test('setRouteAttribute - does not throw when OTEL disabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  // Should not throw
  setRouteAttribute('/users/:id', 'GET');
  setRouteAttribute('/users/:id', 'GET', false);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

Deno.test('setSpanAttributes - does not throw when OTEL disabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  // Should not throw
  setSpanAttributes({ 'custom.attr': 'value' });

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

Deno.test('recordSpanException - does not throw when OTEL disabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  // Should not throw
  recordSpanException(new Error('Test error'));

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

Deno.test('setSpanOk - does not throw when OTEL disabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  // Should not throw
  setSpanOk();

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

Deno.test('addSpanEvent - does not throw when OTEL disabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  // Should not throw
  addSpanEvent('test.event', { key: 'value' });

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

// withSpan Tests
Deno.test('withSpan - executes function when OTEL disabled', async () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  let executed = false;
  const result = await withSpan('test.span', async (span) => {
    executed = true;
    assertExists(span); // Span exists as NonRecordingSpan (noop) when disabled
    return 'success';
  });

  assertEquals(executed, true);
  assertEquals(result, 'success');

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

Deno.test('withSpanSync - executes function when OTEL disabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  let executed = false;
  const result = withSpanSync('test.span', (span) => {
    executed = true;
    assertExists(span); // Span exists as NonRecordingSpan (noop) when disabled
    return 'success';
  });

  assertEquals(executed, true);
  assertEquals(result, 'success');

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

Deno.test('withDbSpan - executes function when OTEL disabled', async () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  let executed = false;
  const result = await withDbSpan('get', ['users', '123'], async (span) => {
    executed = true;
    assertExists(span); // Span exists but is a noop span
    return { rows: [] };
  });

  assertEquals(executed, true);
  assertExists(result);
  assert(Array.isArray(result.rows));
  assertEquals(result.rows.length, 0);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

Deno.test('withHttpClientSpan - executes function when OTEL disabled', async () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  let executed = false;
  const result = await withHttpClientSpan('GET', 'https://example.com', async (span) => {
    executed = true;
    assertExists(span); // Span exists as NonRecordingSpan (noop) when disabled
    return { status: 200 };
  });

  assertEquals(executed, true);
  assertExists(result);
  assertEquals(result.status, 200);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

// Error Handling Tests
Deno.test('withSpan - propagates errors', async () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  let errorThrown = false;
  try {
    await withSpan('test.span', async () => {
      throw new Error('Test error');
    });
  } catch (error) {
    errorThrown = true;
    assertEquals((error as Error).message, 'Test error');
  }

  assertEquals(errorThrown, true);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

Deno.test('withSpanSync - propagates errors', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  let errorThrown = false;
  try {
    withSpanSync('test.span', () => {
      throw new Error('Test error');
    });
  } catch (error) {
    errorThrown = true;
    assertEquals((error as Error).message, 'Test error');
  }

  assertEquals(errorThrown, true);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

// Tracer and Meter Access Tests
Deno.test('getOTELTracer - returns tracer when OTEL enabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const tracer = getOTELTracer();
  assertExists(tracer);
  assertExists(tracer.startSpan);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

Deno.test('getOTELMeter - returns meter when OTEL enabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const meter = getOTELMeter();
  assertExists(meter);
  assertExists(meter.createCounter);
  assertExists(meter.createHistogram);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});
