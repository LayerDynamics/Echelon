/**
 * OpenTelemetry Metrics Tests
 */

import { assertEquals, assertExists, assert } from 'jsr:@std/assert';
import {
  OTelMetrics,
  getOTelMetrics,
  createOTelMetrics,
} from '../../framework/telemetry/otel_metrics.ts';

// OTelMetrics Tests
Deno.test('OTelMetrics - initializes without errors when OTEL disabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  const metrics = new OTelMetrics();
  metrics.initialize();

  // Should not throw
  assertEquals(metrics.isInitialized(), false);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

Deno.test('OTelMetrics - initializes when OTEL enabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const metrics = new OTelMetrics();
  metrics.initialize();

  assertEquals(metrics.isInitialized(), true);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

Deno.test('OTelMetrics - only initializes once', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const metrics = new OTelMetrics();
  metrics.initialize();
  metrics.initialize(); // Should be no-op

  assertEquals(metrics.isInitialized(), true);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

// HTTP Metrics Tests
Deno.test('OTelMetrics - recordHttpRequest does not throw when disabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  const metrics = new OTelMetrics();
  metrics.initialize();

  // Should not throw
  metrics.recordHttpRequest({
    method: 'GET',
    route: '/users/:id',
    statusCode: 200,
    durationMs: 125,
  });

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

Deno.test('OTelMetrics - incrementActiveRequests does not throw when disabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  const metrics = new OTelMetrics();
  metrics.initialize();

  // Should not throw
  metrics.incrementActiveRequests();
  metrics.decrementActiveRequests();

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

Deno.test('OTelMetrics - recordRequestBodySize does not throw when disabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  const metrics = new OTelMetrics();
  metrics.initialize();

  // Should not throw
  metrics.recordRequestBodySize(1024, { method: 'POST', route: '/api/data' });

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

// Cache Metrics Tests
Deno.test('OTelMetrics - recordCacheHit does not throw when disabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  const metrics = new OTelMetrics();
  metrics.initialize();

  // Should not throw
  metrics.recordCacheHit({ key: 'user:123', source: 'memory' });

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

Deno.test('OTelMetrics - recordCacheMiss does not throw when disabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  const metrics = new OTelMetrics();
  metrics.initialize();

  // Should not throw
  metrics.recordCacheMiss({ key: 'user:123', reason: 'not_found' });

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

Deno.test('OTelMetrics - recordCacheOperation does not throw when disabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  const metrics = new OTelMetrics();
  metrics.initialize();

  // Should not throw
  metrics.recordCacheOperation({
    operation: 'get',
    durationMs: 5,
  });

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

// Database Metrics Tests
Deno.test('OTelMetrics - recordDbOperation does not throw when disabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  const metrics = new OTelMetrics();
  metrics.initialize();

  // Should not throw
  metrics.recordDbOperation({
    operation: 'SELECT',
    table: 'users',
    durationMs: 25,
  });

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

Deno.test('OTelMetrics - incrementDbConnections does not throw when disabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  const metrics = new OTelMetrics();
  metrics.initialize();

  // Should not throw
  metrics.incrementDbConnections();
  metrics.decrementDbConnections();

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

// Job Metrics Tests
Deno.test('OTelMetrics - recordJobProcessed does not throw when disabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  const metrics = new OTelMetrics();
  metrics.initialize();

  // Should not throw
  metrics.recordJobProcessed({
    name: 'send-email',
    status: 'completed',
    durationMs: 1500,
  });

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

Deno.test('OTelMetrics - recordJobFailed does not throw when disabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  const metrics = new OTelMetrics();
  metrics.initialize();

  // Should not throw
  metrics.recordJobFailed({
    name: 'send-email',
    status: 'failed',
    durationMs: 1000,
  });

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

Deno.test('OTelMetrics - updateJobsQueued does not throw when disabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  const metrics = new OTelMetrics();
  metrics.initialize();

  // Should not throw
  metrics.updateJobsQueued(5, 'default');

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

// Auth Metrics Tests
Deno.test('OTelMetrics - recordAuthAttempt does not throw when disabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  const metrics = new OTelMetrics();
  metrics.initialize();

  // Should not throw
  metrics.recordAuthAttempt({
    method: 'password',
    success: true,
  });

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

Deno.test('OTelMetrics - recordAuthFailure does not throw when disabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  const metrics = new OTelMetrics();
  metrics.initialize();

  // Should not throw
  metrics.recordAuthFailure({
    method: 'password',
    success: false,
    reason: 'invalid_password',
  });

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

// Middleware Metrics Tests
Deno.test('OTelMetrics - recordMiddleware does not throw when disabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  const metrics = new OTelMetrics();
  metrics.initialize();

  // Should not throw
  metrics.recordMiddleware({
    name: 'cors',
    durationMs: 2,
  });

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

// Factory Functions Tests
Deno.test('getOTelMetrics - returns singleton instance', () => {
  const metrics1 = getOTelMetrics();
  const metrics2 = getOTelMetrics();

  // Should return the same instance
  assertEquals(metrics1, metrics2);
});

Deno.test('createOTelMetrics - creates new instance', () => {
  const metrics1 = createOTelMetrics();
  const metrics2 = createOTelMetrics();

  // Should create different instances
  assert(metrics1 !== metrics2);
});

// Integration Test with OTEL Enabled
Deno.test('OTelMetrics - full workflow with OTEL enabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const metrics = createOTelMetrics();
  metrics.initialize();

  // Should not throw and should record metrics
  metrics.incrementActiveRequests();
  metrics.recordHttpRequest({
    method: 'GET',
    route: '/api/users',
    statusCode: 200,
    durationMs: 45,
  });
  metrics.decrementActiveRequests();

  metrics.recordCacheHit({ key: 'user:1', source: 'memory' });
  metrics.recordDbOperation({
    operation: 'SELECT',
    table: 'users',
    durationMs: 12,
  });

  metrics.recordJobProcessed({
    name: 'email',
    status: 'completed',
    durationMs: 500,
  });

  metrics.recordAuthAttempt({
    method: 'password',
    success: true,
  });

  // All operations should complete without errors
  assertEquals(metrics.isInitialized(), true);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});
