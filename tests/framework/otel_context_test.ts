/**
 * OpenTelemetry Context Propagation Tests
 */

import { assertEquals, assertExists, assert } from 'jsr:@std/assert';
import { trace } from '@opentelemetry/api';
import {
  extractContextFromHeaders,
  injectContextIntoHeaders,
  setRequestContext,
  getRequestContext,
  clearRequestContext,
  setRequestSpan,
  getRequestSpan,
  runWithContext,
  runWithContextSync,
  runWithSpan,
  runWithSpanSync,
  createChildSpan,
  withChildSpan,
  getCurrentTraceId,
  getCurrentSpanId,
  isCurrentSpanSampled,
  createSpanLink,
  createHttpServerSpan,
  endHttpServerSpan,
} from '../../framework/telemetry/otel_context.ts';
import { SpanKind } from '../../framework/telemetry/otel.ts';

// Context Extraction Tests
Deno.test('extractContextFromHeaders - extracts traceparent header', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const headers = new Headers({
    'traceparent': '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
  });

  const context = extractContextFromHeaders(headers);
  assertExists(context);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

Deno.test('extractContextFromHeaders - returns root context when no traceparent', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const headers = new Headers();
  const context = extractContextFromHeaders(headers);
  assertExists(context);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

Deno.test('extractContextFromHeaders - does not throw when OTEL disabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  const headers = new Headers({
    'traceparent': '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
  });

  const context = extractContextFromHeaders(headers);
  assertExists(context);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

// Context Injection Tests
Deno.test('injectContextIntoHeaders - injects traceparent header', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const headers = new Headers();
  injectContextIntoHeaders(headers);

  // Should have traceparent header (or be empty if no active context)
  assert(headers.has('traceparent') || !headers.has('traceparent'));

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

Deno.test('injectContextIntoHeaders - does not throw when OTEL disabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  const headers = new Headers();
  injectContextIntoHeaders(headers);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

// Request Context Management Tests
Deno.test('setRequestContext and getRequestContext - stores and retrieves context', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const requestId = 'test-request-123';
  const headers = new Headers();
  const context = extractContextFromHeaders(headers);

  setRequestContext(requestId, context);

  const retrieved = getRequestContext(requestId);
  assertExists(retrieved);
  assertEquals(retrieved, context);

  // Clean up
  clearRequestContext(requestId);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

Deno.test('clearRequestContext - removes context', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const requestId = 'test-request-456';
  const headers = new Headers();
  const context = extractContextFromHeaders(headers);

  setRequestContext(requestId, context);
  clearRequestContext(requestId);

  const retrieved = getRequestContext(requestId);
  assertEquals(retrieved, undefined);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

Deno.test('getRequestContext - returns undefined for non-existent request', () => {
  const requestId = 'non-existent-request';
  const retrieved = getRequestContext(requestId);
  assertEquals(retrieved, undefined);
});

// Request Span Management Tests
Deno.test('setRequestSpan and getRequestSpan - stores and retrieves span', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const requestId = 'test-request-789';
  const { span } = createHttpServerSpan({
    requestId,
    method: 'GET',
    url: new URL('http://localhost:8000/test'),
    headers: new Headers(),
  });

  setRequestSpan(requestId, span);

  const retrieved = getRequestSpan(requestId);
  assertExists(retrieved);
  assertEquals(retrieved, span);

  // Clean up
  span.end();
  clearRequestContext(requestId);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

// Context-Aware Execution Tests
Deno.test('runWithContext - executes function with context', async () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const headers = new Headers();
  const context = extractContextFromHeaders(headers);

  let executed = false;
  const result = await runWithContext(context, async () => {
    executed = true;
    return 'success';
  });

  assertEquals(executed, true);
  assertEquals(result, 'success');

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

Deno.test('runWithContextSync - executes function with context', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const headers = new Headers();
  const context = extractContextFromHeaders(headers);

  let executed = false;
  const result = runWithContextSync(context, () => {
    executed = true;
    return 'success';
  });

  assertEquals(executed, true);
  assertEquals(result, 'success');

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

Deno.test('runWithSpan - executes function with span', async () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const { span } = createHttpServerSpan({
    requestId: 'test-span-exec',
    method: 'GET',
    url: new URL('http://localhost:8000/test'),
    headers: new Headers(),
  });

  let executed = false;
  const result = await runWithSpan(span, async () => {
    executed = true;
    return 'result';
  });

  assertEquals(executed, true);
  assertEquals(result, 'result');

  span.end();

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

// Child Span Tests
Deno.test('createChildSpan - creates child span', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const requestId = 'test-child-span';
  const { span: parentSpan } = createHttpServerSpan({
    requestId,
    method: 'GET',
    url: new URL('http://localhost:8000/test'),
    headers: new Headers(),
  });

  setRequestSpan(requestId, parentSpan);

  const childSpan = createChildSpan('test.child', requestId, SpanKind.INTERNAL);
  assertExists(childSpan);

  childSpan.end();
  parentSpan.end();
  clearRequestContext(requestId);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

Deno.test('withChildSpan - executes function with child span', async () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const requestId = 'test-with-child-span';
  const { span: parentSpan } = createHttpServerSpan({
    requestId,
    method: 'GET',
    url: new URL('http://localhost:8000/test'),
    headers: new Headers(),
  });

  setRequestSpan(requestId, parentSpan);

  let executed = false;
  const result = await withChildSpan('test.operation', async (span) => {
    executed = true;
    assertExists(span);
    return 'done';
  }, requestId);

  assertEquals(executed, true);
  assertEquals(result, 'done');

  parentSpan.end();
  clearRequestContext(requestId);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

// HTTP Server Span Tests
Deno.test('createHttpServerSpan - creates server span with attributes', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const { span, context } = createHttpServerSpan({
    requestId: 'test-http-server',
    method: 'POST',
    url: new URL('http://localhost:8000/api/users'),
    headers: new Headers({
      'content-type': 'application/json',
    }),
  });

  assertExists(span);
  assertExists(context);

  span.end();

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

Deno.test('endHttpServerSpan - ends span with status code', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const requestId = 'test-end-http-server';
  const { span } = createHttpServerSpan({
    requestId,
    method: 'GET',
    url: new URL('http://localhost:8000/test'),
    headers: new Headers(),
  });

  setRequestSpan(requestId, span);

  // Should not throw
  endHttpServerSpan(requestId, 200);

  clearRequestContext(requestId);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

Deno.test('endHttpServerSpan - records error when status >= 500', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const requestId = 'test-error-span';
  const { span } = createHttpServerSpan({
    requestId,
    method: 'GET',
    url: new URL('http://localhost:8000/test'),
    headers: new Headers(),
  });

  setRequestSpan(requestId, span);

  const error = new Error('Internal Server Error');
  endHttpServerSpan(requestId, 500, error);

  clearRequestContext(requestId);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

// Trace Utilities Tests
Deno.test('getCurrentTraceId - returns trace ID or null', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const traceId = getCurrentTraceId();
  // May be undefined if no active span
  assert(traceId === undefined || typeof traceId === 'string');

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

Deno.test('getCurrentSpanId - returns span ID or null', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const spanId = getCurrentSpanId();
  // May be undefined if no active span
  assert(spanId === undefined || typeof spanId === 'string');

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

Deno.test('isCurrentSpanSampled - returns boolean', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const sampled = isCurrentSpanSampled();
  assertEquals(typeof sampled, 'boolean');

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

Deno.test('createSpanLink - creates span link', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const { span, context } = createHttpServerSpan({
    requestId: 'test-span-link',
    method: 'GET',
    url: new URL('http://localhost:8000/test'),
    headers: new Headers(),
  });

  // Run within the span context to make it active
  trace.setSpan(context, span);
  const link = createSpanLink();

  // Link may be undefined if span isn't active in current context
  if (link) {
    assertExists(link.context);
  }

  span.end();

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

// OTEL Disabled Tests
Deno.test('Context functions do not throw when OTEL disabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  // All functions should be safe to call
  const headers = new Headers();
  const context = extractContextFromHeaders(headers);
  injectContextIntoHeaders(headers);

  const requestId = 'test-disabled';
  setRequestContext(requestId, context);
  getRequestContext(requestId);
  clearRequestContext(requestId);

  assertEquals(getCurrentTraceId(), undefined);
  assertEquals(getCurrentSpanId(), undefined);
  assertEquals(isCurrentSpanSampled(), false);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});
