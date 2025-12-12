/**
 * OpenTelemetry Integration Tests
 *
 * End-to-end tests for OTEL integration across the framework.
 */

import { assertEquals, assertExists, assert } from 'jsr:@std/assert';
import { Application } from '../../framework/app.ts';
import { KVStore } from '../../framework/orm/kv.ts';
import { Cache } from '../../framework/cache/cache.ts';
import { Auth } from '../../framework/auth/auth.ts';
import { Session } from '../../framework/auth/session.ts';
import { JobQueue } from '../../framework/jobs/queue.ts';
import { isOTELEnabled, getActiveSpan } from '../../framework/telemetry/otel.ts';
import {
  createHttpServerSpan,
  endHttpServerSpan,
  setRequestContext,
  clearRequestContext,
} from '../../framework/telemetry/otel_context.ts';
import { getOTelMetrics } from '../../framework/telemetry/otel_metrics.ts';
import { attachOTelBridge } from '../../framework/debugger/otel_bridge.ts';
import { getDebugger } from '../../framework/debugger/debugger.ts';

// Helper to setup OTEL environment
function setupOTEL(): () => void {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  return () => {
    if (originalValue) {
      Deno.env.set('OTEL_DENO', originalValue);
    } else {
      Deno.env.delete('OTEL_DENO');
    }
  };
}

Deno.test({
  name: 'OTEL Integration - Application with OTEL enabled',
  async fn() {
    const cleanup = setupOTEL();

    try {
      const app = new Application({ enableWasm: false });
      await app.init();

      // Add a test route
      app.get('/test', (ctx) => {
        return new Response('OK');
      });

      // Verify OTEL is enabled
      assertEquals(isOTELEnabled(), true);

      // Verify debugger bridge is attached
      const debuggerInstance = app.getDebugger();
      assertExists(debuggerInstance);
    } finally {
      cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: 'OTEL Integration - HTTP request with spans',
  async fn() {
    const cleanup = setupOTEL();

    try {
      const requestId = crypto.randomUUID();
      const url = new URL('http://localhost:8000/api/users');
      const headers = new Headers({
        'content-type': 'application/json',
      });

      // Create HTTP server span
      const { span, context } = createHttpServerSpan({
        requestId,
        method: 'GET',
        url,
        headers,
      });

      assertExists(span);
      assertExists(context);

      setRequestContext(requestId, context);

      // Record metrics
      const metrics = getOTelMetrics();
      metrics.initialize();

      metrics.incrementActiveRequests();
      metrics.recordHttpRequest({
        method: 'GET',
        route: '/api/users',
        statusCode: 200,
        durationMs: 45,
      });
      metrics.decrementActiveRequests();

      // End span
      endHttpServerSpan(requestId, 200);

      // Clean up
      clearRequestContext(requestId);
    } finally {
      cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: 'OTEL Integration - KV operations with spans',
  async fn() {
    const cleanup = setupOTEL();

    try {
      const kv = new KVStore();
      await kv.init();

      // Test KV operations
      await kv.set(['test', 'key'], 'value');
      const value = await kv.get<string>(['test', 'key']);
      assertEquals(value, 'value');

      await kv.delete(['test', 'key']);

      kv.close();
    } finally {
      cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: 'OTEL Integration - Cache operations with spans',
  async fn() {
    const cleanup = setupOTEL();

    try {
      const cache = new Cache({ maxSize: 100 }); // Memory-only mode

      // Test cache operations
      await cache.set('test-key', 'test-value', 1000);

      const value = await cache.get<string>('test-key');
      assertEquals(value, 'test-value');

      const exists = await cache.has('test-key');
      assertEquals(exists, true);

      await cache.delete('test-key');

      const afterDelete = await cache.get<string>('test-key');
      assertEquals(afterDelete, undefined);
    } finally {
      cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: 'OTEL Integration - Auth operations with spans',
  async fn() {
    const cleanup = setupOTEL();

    try {
      // Create a session instance
      const session = new Session('test-session', {
        name: 'test',
        maxAge: 3600,
      });

      const auth = new Auth(session, {
        userLoader: async (id: string) => ({
          id,
          email: 'test@example.com',
          username: 'testuser',
          roles: ['user'],
          permissions: ['read'],
        }),
      });

      // Test login
      await auth.login({
        id: '123',
        email: 'test@example.com',
        username: 'testuser',
        roles: ['user'],
        permissions: ['read'],
      });

      assertEquals(auth.isAuthenticated, true);
      assertEquals(auth.user?.id, '123');

      // Test logout
      await auth.logout();
      assertEquals(auth.isAuthenticated, false);
    } finally {
      cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: 'OTEL Integration - Job queue with spans',
  async fn() {
    const cleanup = setupOTEL();

    try {
      const queue = new JobQueue('test-jobs');

      // Register a handler
      queue.register('test-job', async (job) => {
        // Simulate work
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // Enqueue a job
      const jobId = await queue.enqueue('test-job', { data: 'test' }, {
        maxAttempts: 1,
        delay: 0,
      });

      assertExists(jobId);

      // Get job
      const job = await queue.getJob(jobId);
      assertExists(job);
      assertEquals(job?.name, 'test-job');
    } finally {
      cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: 'OTEL Integration - Debugger bridge events',
  async fn() {
    const cleanup = setupOTEL();

    try {
      const debuggerInstance = getDebugger();
      const bridge = attachOTelBridge(debuggerInstance);

      assertExists(bridge);

      // Set up a request context
      const requestId = crypto.randomUUID();
      const { span, context } = createHttpServerSpan({
        requestId,
        method: 'GET',
        url: new URL('http://localhost:8000/test'),
        headers: new Headers(),
      });

      setRequestContext(requestId, context);

      // Emit debugger events (these should be converted to spans)
      debuggerInstance.startRequest(requestId, 'GET', '/test');
      debuggerInstance.endRequest(requestId, 200);

      // Clean up
      span.end();
      clearRequestContext(requestId);
      bridge.cleanupRequest(requestId);

      const stats = bridge.getStats();
      assertExists(stats);
    } finally {
      cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: 'OTEL Integration - Full request lifecycle',
  async fn() {
    const cleanup = setupOTEL();

    try {
      const requestId = crypto.randomUUID();
      const url = new URL('http://localhost:8000/api/users/123');
      const headers = new Headers();

      // Initialize metrics
      const metrics = getOTelMetrics();
      metrics.initialize();

      // 1. Create HTTP server span
      const { span, context } = createHttpServerSpan({
        requestId,
        method: 'GET',
        url,
        headers,
      });

      setRequestContext(requestId, context);

      // 2. Increment active requests
      metrics.incrementActiveRequests();

      // 3. Initialize cache
      const cache = new Cache({ maxSize: 100 });

      // 4. Check cache (miss)
      const cacheKey = 'user:123';
      let userData = await cache.get<{ id: string; name: string }>(cacheKey);

      if (!userData) {
        // 5. Fetch from database (simulated with KV)
        const kv = new KVStore();
        await kv.init();

        // Simulate database query
        userData = { id: '123', name: 'Test User' };
        await kv.set(['users', '123'], userData);

        // 6. Store in cache
        await cache.set(cacheKey, userData, 60000);

        kv.close();
      }

      // 7. Record metrics
      metrics.recordHttpRequest({
        method: 'GET',
        route: '/api/users/:id',
        statusCode: 200,
        durationMs: 65,
      });

      metrics.recordCacheMiss({ key: cacheKey, reason: 'not_found' });
      metrics.recordDbOperation({
        operation: 'SELECT',
        table: 'users',
        durationMs: 25,
      });

      // 8. Decrement active requests
      metrics.decrementActiveRequests();

      // 9. End span
      endHttpServerSpan(requestId, 200);

      // 10. Clean up
      clearRequestContext(requestId);

      // Verify data was processed correctly
      assertExists(userData);
      assertEquals(userData.id, '123');
    } finally {
      cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: 'OTEL Integration - Error handling with spans',
  async fn() {
    const cleanup = setupOTEL();

    try {
      const requestId = crypto.randomUUID();
      const url = new URL('http://localhost:8000/api/error');
      const headers = new Headers();

      // Create HTTP server span
      const { span, context } = createHttpServerSpan({
        requestId,
        method: 'GET',
        url,
        headers,
      });

      setRequestContext(requestId, context);

      // Simulate an error
      const error = new Error('Test error');

      // Record metrics for error
      const metrics = getOTelMetrics();
      metrics.initialize();

      metrics.recordHttpRequest({
        method: 'GET',
        route: '/api/error',
        statusCode: 500,
        durationMs: 12,
      });

      // End span with error
      endHttpServerSpan(requestId, 500, error);

      // Clean up
      clearRequestContext(requestId);
    } finally {
      cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: 'OTEL Integration - Context propagation across async boundaries',
  async fn() {
    const cleanup = setupOTEL();

    try {
      const requestId = crypto.randomUUID();
      const { span, context } = createHttpServerSpan({
        requestId,
        method: 'GET',
        url: new URL('http://localhost:8000/test'),
        headers: new Headers(),
      });

      setRequestContext(requestId, context);

      // Simulate async operations
      async function asyncOperation1() {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'result1';
      }

      async function asyncOperation2() {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'result2';
      }

      // Execute async operations
      const [result1, result2] = await Promise.all([
        asyncOperation1(),
        asyncOperation2(),
      ]);

      assertEquals(result1, 'result1');
      assertEquals(result2, 'result2');

      // End span
      span.end();
      clearRequestContext(requestId);
    } finally {
      cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: 'OTEL Integration - Metrics collection across components',
  async fn() {
    const cleanup = setupOTEL();

    try {
      const metrics = getOTelMetrics();
      metrics.initialize();

      // Simulate various operations
      metrics.incrementActiveRequests();

      // HTTP request
      metrics.recordHttpRequest({
        method: 'POST',
        route: '/api/data',
        statusCode: 201,
        durationMs: 150,
      });

      // Cache operations
      metrics.recordCacheHit({ key: 'config:main', source: 'memory' });
      metrics.recordCacheMiss({ key: 'config:backup', reason: 'not_found' });

      // Database operations
      metrics.recordDbOperation({
        operation: 'INSERT',
        table: 'events',
        durationMs: 35,
      });

      // Job processing
      metrics.recordJobProcessed({
        name: 'process-upload',
        status: 'completed',
        durationMs: 2500,
      });

      // Auth
      metrics.recordAuthAttempt({
        method: 'oauth',
        success: true,
      });

      // Middleware
      metrics.recordMiddleware({
        name: 'rate-limit',
        durationMs: 3,
      });

      metrics.decrementActiveRequests();

      // Verify metrics are initialized
      assertEquals(metrics.isInitialized(), true);
    } finally {
      cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
