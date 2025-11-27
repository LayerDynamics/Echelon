/**
 * Plugin Tests
 *
 * Tests for the event emitter system.
 */

import { assertEquals, assert } from 'jsr:@std/assert';
import { EventEmitter, getEventEmitter, Events } from '../../framework/plugin/events.ts';

// EventEmitter.on tests

Deno.test('EventEmitter.on - registers handler', () => {
  const emitter = new EventEmitter();
  emitter.on('test', () => {});
  assertEquals(emitter.listenerCount('test'), 1);
});

Deno.test('EventEmitter.on - registers multiple handlers', () => {
  const emitter = new EventEmitter();
  emitter.on('test', () => {});
  emitter.on('test', () => {});
  assertEquals(emitter.listenerCount('test'), 2);
});

Deno.test('EventEmitter.on - returns this for chaining', () => {
  const emitter = new EventEmitter();
  const result = emitter.on('test', () => {});
  assertEquals(result, emitter);
});

// EventEmitter.emit tests

Deno.test('EventEmitter.emit - calls registered handler', async () => {
  const emitter = new EventEmitter();
  let called = false;
  emitter.on('test', () => {
    called = true;
  });
  await emitter.emit('test');
  assertEquals(called, true);
});

Deno.test('EventEmitter.emit - passes data to handler', async () => {
  const emitter = new EventEmitter();
  let receivedData: unknown = null;
  emitter.on<{ message: string }>('test', (data) => {
    receivedData = data;
  });
  await emitter.emit('test', { message: 'hello' });
  assertEquals(receivedData, { message: 'hello' });
});

Deno.test('EventEmitter.emit - calls multiple handlers in order', async () => {
  const emitter = new EventEmitter();
  const order: number[] = [];
  emitter.on('test', async () => {
    order.push(1);
  });
  emitter.on('test', async () => {
    order.push(2);
  });
  emitter.on('test', async () => {
    order.push(3);
  });
  await emitter.emit('test');
  assertEquals(order, [1, 2, 3]);
});

Deno.test('EventEmitter.emit - does nothing for unregistered event', async () => {
  const emitter = new EventEmitter();
  await emitter.emit('nonexistent'); // Should not throw
});

Deno.test('EventEmitter.emit - handles async handlers', async () => {
  const emitter = new EventEmitter();
  let value = 0;
  emitter.on('test', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    value = 42;
  });
  await emitter.emit('test');
  assertEquals(value, 42);
});

// EventEmitter.emitSync tests

Deno.test('EventEmitter.emitSync - calls handlers synchronously', () => {
  const emitter = new EventEmitter();
  let called = false;
  emitter.on('test', () => {
    called = true;
  });
  emitter.emitSync('test');
  assertEquals(called, true);
});

Deno.test('EventEmitter.emitSync - passes data to handler', () => {
  const emitter = new EventEmitter();
  let receivedData: unknown = null;
  emitter.on('test', (data) => {
    receivedData = data;
  });
  emitter.emitSync('test', { value: 123 });
  assertEquals(receivedData, { value: 123 });
});

// EventEmitter.once tests

Deno.test('EventEmitter.once - handler called only once', async () => {
  const emitter = new EventEmitter();
  let callCount = 0;
  emitter.once('test', () => {
    callCount++;
  });
  await emitter.emit('test');
  await emitter.emit('test');
  await emitter.emit('test');
  assertEquals(callCount, 1);
});

Deno.test('EventEmitter.once - removes handler after first call', async () => {
  const emitter = new EventEmitter();
  emitter.once('test', () => {});
  assertEquals(emitter.listenerCount('test'), 1);
  await emitter.emit('test');
  assertEquals(emitter.listenerCount('test'), 0);
});

Deno.test('EventEmitter.once - returns this for chaining', () => {
  const emitter = new EventEmitter();
  const result = emitter.once('test', () => {});
  assertEquals(result, emitter);
});

// EventEmitter.off tests

Deno.test('EventEmitter.off - removes specific handler', () => {
  const emitter = new EventEmitter();
  const handler = () => {};
  emitter.on('test', handler);
  emitter.on('test', () => {});
  assertEquals(emitter.listenerCount('test'), 2);
  emitter.off('test', handler);
  assertEquals(emitter.listenerCount('test'), 1);
});

Deno.test('EventEmitter.off - does nothing for unregistered handler', () => {
  const emitter = new EventEmitter();
  const handler1 = () => {};
  const handler2 = () => {};
  emitter.on('test', handler1);
  emitter.off('test', handler2); // Different handler
  assertEquals(emitter.listenerCount('test'), 1);
});

Deno.test('EventEmitter.off - returns this for chaining', () => {
  const emitter = new EventEmitter();
  const result = emitter.off('test', () => {});
  assertEquals(result, emitter);
});

// EventEmitter.removeAllListeners tests

Deno.test('EventEmitter.removeAllListeners - removes all handlers for event', () => {
  const emitter = new EventEmitter();
  emitter.on('test', () => {});
  emitter.on('test', () => {});
  emitter.on('other', () => {});
  emitter.removeAllListeners('test');
  assertEquals(emitter.listenerCount('test'), 0);
  assertEquals(emitter.listenerCount('other'), 1);
});

Deno.test('EventEmitter.removeAllListeners - removes all handlers when no event specified', () => {
  const emitter = new EventEmitter();
  emitter.on('event1', () => {});
  emitter.on('event2', () => {});
  emitter.on('event3', () => {});
  emitter.removeAllListeners();
  assertEquals(emitter.eventNames().length, 0);
});

Deno.test('EventEmitter.removeAllListeners - returns this for chaining', () => {
  const emitter = new EventEmitter();
  const result = emitter.removeAllListeners();
  assertEquals(result, emitter);
});

// EventEmitter.listenerCount tests

Deno.test('EventEmitter.listenerCount - returns 0 for unregistered event', () => {
  const emitter = new EventEmitter();
  assertEquals(emitter.listenerCount('nonexistent'), 0);
});

Deno.test('EventEmitter.listenerCount - returns correct count', () => {
  const emitter = new EventEmitter();
  emitter.on('test', () => {});
  emitter.on('test', () => {});
  assertEquals(emitter.listenerCount('test'), 2);
});

// EventEmitter.eventNames tests

Deno.test('EventEmitter.eventNames - returns empty array when no events', () => {
  const emitter = new EventEmitter();
  assertEquals(emitter.eventNames(), []);
});

Deno.test('EventEmitter.eventNames - returns all registered event names', () => {
  const emitter = new EventEmitter();
  emitter.on('event1', () => {});
  emitter.on('event2', () => {});
  emitter.on('event3', () => {});
  const names = emitter.eventNames();
  assertEquals(names.length, 3);
  assert(names.includes('event1'));
  assert(names.includes('event2'));
  assert(names.includes('event3'));
});

// getEventEmitter tests

Deno.test('getEventEmitter - returns singleton instance', () => {
  const emitter1 = getEventEmitter();
  const emitter2 = getEventEmitter();
  assertEquals(emitter1, emitter2);
});

// Events constants tests

Deno.test('Events - contains application lifecycle events', () => {
  assertEquals(Events.APP_START, 'app:start');
  assertEquals(Events.APP_READY, 'app:ready');
  assertEquals(Events.APP_SHUTDOWN, 'app:shutdown');
});

Deno.test('Events - contains request lifecycle events', () => {
  assertEquals(Events.REQUEST_START, 'request:start');
  assertEquals(Events.REQUEST_END, 'request:end');
  assertEquals(Events.REQUEST_ERROR, 'request:error');
});

Deno.test('Events - contains auth events', () => {
  assertEquals(Events.AUTH_LOGIN, 'auth:login');
  assertEquals(Events.AUTH_LOGOUT, 'auth:logout');
  assertEquals(Events.AUTH_FAILED, 'auth:failed');
});

Deno.test('Events - contains model events', () => {
  assertEquals(Events.MODEL_CREATED, 'model:created');
  assertEquals(Events.MODEL_UPDATED, 'model:updated');
  assertEquals(Events.MODEL_DELETED, 'model:deleted');
});

Deno.test('Events - contains job events', () => {
  assertEquals(Events.JOB_QUEUED, 'job:queued');
  assertEquals(Events.JOB_STARTED, 'job:started');
  assertEquals(Events.JOB_COMPLETED, 'job:completed');
  assertEquals(Events.JOB_FAILED, 'job:failed');
});
