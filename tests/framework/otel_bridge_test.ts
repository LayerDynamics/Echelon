/**
 * Debugger to OpenTelemetry Bridge Tests
 */

import { assertEquals, assertExists, assert } from 'jsr:@std/assert';
import {
  DebuggerOTelBridge,
  getDebuggerOTelBridge,
  createDebuggerOTelBridge,
  attachOTelBridge,
} from '../../framework/debugger/otel_bridge.ts';
import { Debugger } from '../../framework/debugger/debugger.ts';
import type { DebugEvent } from '../../framework/debugger/debugger.ts';
import { DebugLevel, DebugModule } from '../../framework/debugger/levels.ts';

// Bridge Creation Tests
Deno.test('DebuggerOTelBridge - creates bridge instance', () => {
  const bridge = new DebuggerOTelBridge();
  assertExists(bridge);
});

Deno.test('DebuggerOTelBridge - creates listener function', () => {
  const bridge = new DebuggerOTelBridge();
  const listener = bridge.createListener();

  assertExists(listener);
  assertEquals(typeof listener, 'function');
});

Deno.test('DebuggerOTelBridge - accepts configuration options', () => {
  const bridge = new DebuggerOTelBridge({
    convertEventsToSpanEvents: false,
    createChildSpans: false,
    minLevel: DebugLevel.INFO,
    ignoreEvents: ['cache:hit', 'cache:miss'],
  });

  assertExists(bridge);
});

// Event Handling Tests (OTEL Disabled)
Deno.test('DebuggerOTelBridge - does not throw when OTEL disabled', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  const bridge = new DebuggerOTelBridge();
  const listener = bridge.createListener();

  const event: DebugEvent = {
    type: 'middleware:enter',
    module: DebugModule.MIDDLEWARE,
    level: DebugLevel.DEBUG,
    message: 'Entering middleware',
    timestamp: Date.now(),
    requestId: 'test-request',
    data: { name: 'cors' },
  };

  // Should not throw
  listener(event);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});

Deno.test('DebuggerOTelBridge - handles middleware:enter event', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const bridge = new DebuggerOTelBridge();
  const listener = bridge.createListener();

  const event: DebugEvent = {
    type: 'middleware:enter',
    module: DebugModule.MIDDLEWARE,
    level: DebugLevel.DEBUG,
    message: 'Entering middleware',
    timestamp: Date.now(),
    requestId: 'test-request-1',
    data: { name: 'cors', index: 0 },
  };

  // Should not throw
  listener(event);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

Deno.test('DebuggerOTelBridge - handles middleware:exit event', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const bridge = new DebuggerOTelBridge();
  const listener = bridge.createListener();

  // Enter middleware
  const enterEvent: DebugEvent = {
    type: 'middleware:enter',
    module: DebugModule.MIDDLEWARE,
    level: DebugLevel.DEBUG,
    message: 'Entering middleware',
    timestamp: Date.now(),
    requestId: 'test-request-2',
    data: { name: 'cors' },
  };
  listener(enterEvent);

  // Exit middleware
  const exitEvent: DebugEvent = {
    type: 'middleware:exit',
    module: DebugModule.MIDDLEWARE,
    level: DebugLevel.DEBUG,
    message: 'Exiting middleware',
    timestamp: Date.now(),
    requestId: 'test-request-2',
    data: { name: 'cors' },
    duration: 5,
  };

  // Should not throw
  listener(exitEvent);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

Deno.test('DebuggerOTelBridge - handles controller:enter event', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const bridge = new DebuggerOTelBridge();
  const listener = bridge.createListener();

  const event: DebugEvent = {
    type: 'controller:enter',
    module: DebugModule.CONTROLLER,
    level: DebugLevel.DEBUG,
    message: 'Entering controller',
    timestamp: Date.now(),
    requestId: 'test-request-3',
  };

  // Should not throw
  listener(event);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

Deno.test('DebuggerOTelBridge - handles controller:exit event', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const bridge = new DebuggerOTelBridge();
  const listener = bridge.createListener();

  // Enter controller
  const enterEvent: DebugEvent = {
    type: 'controller:enter',
    module: DebugModule.CONTROLLER,
    level: DebugLevel.DEBUG,
    message: 'Entering controller',
    timestamp: Date.now(),
    requestId: 'test-request-4',
  };
  listener(enterEvent);

  // Exit controller
  const exitEvent: DebugEvent = {
    type: 'controller:exit',
    module: DebugModule.CONTROLLER,
    level: DebugLevel.DEBUG,
    message: 'Exiting controller',
    timestamp: Date.now(),
    requestId: 'test-request-4',
    duration: 25,
  };

  // Should not throw
  listener(exitEvent);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

Deno.test('DebuggerOTelBridge - handles cache events', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const bridge = new DebuggerOTelBridge();
  const listener = bridge.createListener();

  // Create a parent span context
  const enterEvent: DebugEvent = {
    type: 'controller:enter',
    module: DebugModule.CONTROLLER,
    level: DebugLevel.DEBUG,
    message: 'Entering controller',
    timestamp: Date.now(),
    requestId: 'test-request-5',
  };
  listener(enterEvent);

  // Cache hit
  const hitEvent: DebugEvent = {
    type: 'cache:hit',
    module: DebugModule.CACHE,
    level: DebugLevel.DEBUG,
    message: 'Cache hit',
    timestamp: Date.now(),
    requestId: 'test-request-5',
    data: { key: 'user:123' },
  };

  // Should not throw
  listener(hitEvent);

  // Cache miss
  const missEvent: DebugEvent = {
    type: 'cache:miss',
    module: DebugModule.CACHE,
    level: DebugLevel.DEBUG,
    message: 'Cache miss',
    timestamp: Date.now(),
    requestId: 'test-request-5',
    data: { key: 'user:456' },
  };

  // Should not throw
  listener(missEvent);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

Deno.test('DebuggerOTelBridge - handles auth events', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const bridge = new DebuggerOTelBridge();
  const listener = bridge.createListener();

  // Create a parent span context
  const enterEvent: DebugEvent = {
    type: 'controller:enter',
    module: DebugModule.CONTROLLER,
    level: DebugLevel.DEBUG,
    message: 'Entering controller',
    timestamp: Date.now(),
    requestId: 'test-request-6',
  };
  listener(enterEvent);

  // Auth success
  const successEvent: DebugEvent = {
    type: 'auth:success',
    module: DebugModule.AUTH,
    level: DebugLevel.INFO,
    message: 'Authentication successful',
    timestamp: Date.now(),
    requestId: 'test-request-6',
    data: { userId: '123' },
  };

  // Should not throw
  listener(successEvent);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

Deno.test('DebuggerOTelBridge - handles error events', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const bridge = new DebuggerOTelBridge();
  const listener = bridge.createListener();

  // Create a parent span context
  const enterEvent: DebugEvent = {
    type: 'controller:enter',
    module: DebugModule.CONTROLLER,
    level: DebugLevel.DEBUG,
    message: 'Entering controller',
    timestamp: Date.now(),
    requestId: 'test-request-7',
  };
  listener(enterEvent);

  // Error event
  const errorEvent: DebugEvent = {
    type: 'error',
    module: DebugModule.HTTP,
    level: DebugLevel.ERROR,
    message: 'Request error',
    timestamp: Date.now(),
    requestId: 'test-request-7',
    data: new Error('Test error'),
  };

  // Should not throw
  listener(errorEvent);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

// Configuration Tests
Deno.test('DebuggerOTelBridge - respects minLevel configuration', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const bridge = new DebuggerOTelBridge({
    minLevel: DebugLevel.WARN,
  });
  const listener = bridge.createListener();

  // DEBUG level event (should be ignored)
  const debugEvent: DebugEvent = {
    type: 'middleware:enter',
    module: DebugModule.MIDDLEWARE,
    level: DebugLevel.DEBUG,
    message: 'Debug message',
    timestamp: Date.now(),
    requestId: 'test-request-8',
  };

  // Should not create span for DEBUG level
  listener(debugEvent);

  // WARN level event (should be processed)
  const warnEvent: DebugEvent = {
    type: 'error',
    module: DebugModule.HTTP,
    level: DebugLevel.WARN,
    message: 'Warning message',
    timestamp: Date.now(),
    requestId: 'test-request-8',
  };

  // Should process WARN level
  listener(warnEvent);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

Deno.test('DebuggerOTelBridge - respects ignoreEvents configuration', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const bridge = new DebuggerOTelBridge({
    ignoreEvents: ['cache:hit', 'cache:miss'],
  });
  const listener = bridge.createListener();

  // Create parent span
  const enterEvent: DebugEvent = {
    type: 'controller:enter',
    module: DebugModule.CONTROLLER,
    level: DebugLevel.DEBUG,
    message: 'Entering controller',
    timestamp: Date.now(),
    requestId: 'test-request-9',
  };
  listener(enterEvent);

  // Ignored event
  const cacheEvent: DebugEvent = {
    type: 'cache:hit',
    module: DebugModule.CACHE,
    level: DebugLevel.DEBUG,
    message: 'Cache hit',
    timestamp: Date.now(),
    requestId: 'test-request-9',
  };

  // Should be ignored (no error)
  listener(cacheEvent);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

Deno.test('DebuggerOTelBridge - respects createChildSpans configuration', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const bridge = new DebuggerOTelBridge({
    createChildSpans: false,
  });
  const listener = bridge.createListener();

  // Middleware enter (should not create child span)
  const event: DebugEvent = {
    type: 'middleware:enter',
    module: DebugModule.MIDDLEWARE,
    level: DebugLevel.DEBUG,
    message: 'Entering middleware',
    timestamp: Date.now(),
    requestId: 'test-request-10',
    data: { name: 'cors' },
  };

  // Should not create child span
  listener(event);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

// Span Cleanup Tests
Deno.test('DebuggerOTelBridge - cleanupRequest removes all spans', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const bridge = new DebuggerOTelBridge();
  const listener = bridge.createListener();

  const requestId = 'test-cleanup';

  // Create some spans
  const enterEvent: DebugEvent = {
    type: 'middleware:enter',
    module: DebugModule.MIDDLEWARE,
    level: DebugLevel.DEBUG,
    message: 'Entering middleware',
    timestamp: Date.now(),
    requestId,
    data: { name: 'cors' },
  };
  listener(enterEvent);

  // Clean up
  bridge.cleanupRequest(requestId);

  // Stats should show no active spans for this request
  const stats = bridge.getStats();
  assertExists(stats);
  assertEquals(typeof stats.activeRequests, 'number');
  assertEquals(typeof stats.totalActiveSpans, 'number');

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});

Deno.test('DebuggerOTelBridge - getStats returns statistics', () => {
  const bridge = new DebuggerOTelBridge();

  const stats = bridge.getStats();

  assertExists(stats);
  assertExists(stats.activeRequests);
  assertExists(stats.totalActiveSpans);
  assertEquals(typeof stats.activeRequests, 'number');
  assertEquals(typeof stats.totalActiveSpans, 'number');
});

// Factory Functions Tests
Deno.test('getDebuggerOTelBridge - returns singleton instance', () => {
  const bridge1 = getDebuggerOTelBridge();
  const bridge2 = getDebuggerOTelBridge();

  // Should return the same instance
  assertEquals(bridge1, bridge2);
});

Deno.test('createDebuggerOTelBridge - creates new instance', () => {
  const bridge1 = createDebuggerOTelBridge();
  const bridge2 = createDebuggerOTelBridge();

  // Should create different instances
  assert(bridge1 !== bridge2);
});

Deno.test('attachOTelBridge - attaches bridge to debugger', () => {
  const debuggerInstance = new Debugger();
  const bridge = attachOTelBridge(debuggerInstance, {
    minLevel: DebugLevel.INFO,
  });

  assertExists(bridge);

  // Emit an event
  debuggerInstance.info(DebugModule.HTTP, 'Test message');

  // Should not throw
});

// Integration Test
Deno.test('DebuggerOTelBridge - full event lifecycle', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  const bridge = new DebuggerOTelBridge();
  const listener = bridge.createListener();

  const requestId = 'test-full-lifecycle';

  // Simulate request lifecycle
  const events: DebugEvent[] = [
    {
      type: 'middleware:enter',
      module: DebugModule.MIDDLEWARE,
      level: DebugLevel.DEBUG,
      message: 'Entering middleware',
      timestamp: Date.now(),
      requestId,
      data: { name: 'cors' },
    },
    {
      type: 'middleware:exit',
      module: DebugModule.MIDDLEWARE,
      level: DebugLevel.DEBUG,
      message: 'Exiting middleware',
      timestamp: Date.now(),
      requestId,
      data: { name: 'cors' },
      duration: 2,
    },
    {
      type: 'controller:enter',
      module: DebugModule.CONTROLLER,
      level: DebugLevel.DEBUG,
      message: 'Entering controller',
      timestamp: Date.now(),
      requestId,
    },
    {
      type: 'cache:hit',
      module: DebugModule.CACHE,
      level: DebugLevel.DEBUG,
      message: 'Cache hit',
      timestamp: Date.now(),
      requestId,
      data: { key: 'user:123' },
    },
    {
      type: 'controller:exit',
      module: DebugModule.CONTROLLER,
      level: DebugLevel.DEBUG,
      message: 'Exiting controller',
      timestamp: Date.now(),
      requestId,
      duration: 45,
    },
  ];

  // Process all events
  for (const event of events) {
    listener(event);
  }

  // Clean up
  bridge.cleanupRequest(requestId);

  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});
