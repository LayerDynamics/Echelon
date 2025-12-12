/**
 * Event Bus Tests
 *
 * Tests for domain event bus.
 */

import { assertEquals, assert } from 'jsr:@std/assert';
import { EventBus } from '../../../src/shared/infrastructure/event_bus.ts';
import { DomainEvent } from '../../../src/shared/domain/domain_event.ts';

// ============================================================================
// Test Event
// ============================================================================

class TestEvent extends DomainEvent {
  constructor(
    public override readonly aggregateId: string,
    public readonly data: string
  ) {
    super(aggregateId, 'Test', 'TestEvent');
  }

  protected getEventData(): Record<string, unknown> {
    return { data: this.data };
  }
}

// ============================================================================
// Tests
// ============================================================================

Deno.test('EventBus: should subscribe and publish events', async () => {
  const eventBus = new EventBus();
  let received: TestEvent | null = null;

  eventBus.subscribe<TestEvent>('TestEvent', (event) => {
    received = event;
  });

  const event = new TestEvent('agg-1', 'test data');
  await eventBus.publish(event);

  assertEquals(received!.aggregateId, 'agg-1');
  assertEquals(received!.data, 'test data');
});

Deno.test('EventBus: should support multiple subscribers', async () => {
  const eventBus = new EventBus();
  const received: TestEvent[] = [];

  eventBus.subscribe<TestEvent>('TestEvent', (event) => {
    received.push(event);
  });

  eventBus.subscribe<TestEvent>('TestEvent', (event) => {
    received.push(event);
  });

  const event = new TestEvent('agg-1', 'test data');
  await eventBus.publish(event);

  assertEquals(received.length, 2);
  assertEquals(received[0].aggregateId, 'agg-1');
  assertEquals(received[1].aggregateId, 'agg-1');
});

Deno.test('EventBus: should unsubscribe handlers', async () => {
  const eventBus = new EventBus();
  let count = 0;

  const handler = () => {
    count++;
  };

  eventBus.subscribe('TestEvent', handler);

  const event1 = new TestEvent('agg-1', 'test 1');
  await eventBus.publish(event1);

  assertEquals(count, 1);

  eventBus.unsubscribe('TestEvent', handler);

  const event2 = new TestEvent('agg-2', 'test 2');
  await eventBus.publish(event2);

  assertEquals(count, 1); // Should not increment
});

Deno.test('EventBus: should support one-time handlers', async () => {
  const eventBus = new EventBus();
  let count = 0;

  eventBus.subscribeOnce('TestEvent', () => {
    count++;
  });

  const event1 = new TestEvent('agg-1', 'test 1');
  await eventBus.publish(event1);

  assertEquals(count, 1);

  const event2 = new TestEvent('agg-2', 'test 2');
  await eventBus.publish(event2);

  assertEquals(count, 1); // Should not increment
});

Deno.test('EventBus: should publish multiple events', async () => {
  const eventBus = new EventBus();
  const received: TestEvent[] = [];

  eventBus.subscribe<TestEvent>('TestEvent', (event) => {
    received.push(event);
  });

  const events = [
    new TestEvent('agg-1', 'test 1'),
    new TestEvent('agg-2', 'test 2'),
    new TestEvent('agg-3', 'test 3'),
  ];

  await eventBus.publishAll(events);

  assertEquals(received.length, 3);
  assertEquals(received[0].data, 'test 1');
  assertEquals(received[1].data, 'test 2');
  assertEquals(received[2].data, 'test 3');
});

Deno.test('EventBus: should report handler count', () => {
  const eventBus = new EventBus();
  const eventName = 'TestEvent_HandlerCount_' + crypto.randomUUID();

  assertEquals(eventBus.getHandlerCount(eventName), 0);

  eventBus.subscribe(eventName, () => {});
  assertEquals(eventBus.getHandlerCount(eventName), 1);

  eventBus.subscribe(eventName, () => {});
  assertEquals(eventBus.getHandlerCount(eventName), 2);

  // Cleanup
  eventBus.clearHandlers(eventName);
});

Deno.test('EventBus: should check for handlers', () => {
  const eventBus = new EventBus();
  const eventName = 'TestEvent_HasHandlers_' + crypto.randomUUID();

  assertEquals(eventBus.hasHandlers(eventName), false);

  eventBus.subscribe(eventName, () => {});

  assertEquals(eventBus.hasHandlers(eventName), true);

  // Cleanup
  eventBus.clearHandlers(eventName);
});

Deno.test('EventBus: should clear handlers', async () => {
  const eventBus = new EventBus();
  let count = 0;

  eventBus.subscribe('TestEvent', () => {
    count++;
  });

  const event1 = new TestEvent('agg-1', 'test 1');
  await eventBus.publish(event1);

  assertEquals(count, 1);

  eventBus.clearHandlers('TestEvent');

  const event2 = new TestEvent('agg-2', 'test 2');
  await eventBus.publish(event2);

  assertEquals(count, 1); // Should not increment
});

Deno.test('EventBus: should support async handlers', async () => {
  const eventBus = new EventBus();
  let processed = false;

  eventBus.subscribe('TestEvent', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    processed = true;
  });

  const event = new TestEvent('agg-1', 'test data');
  await eventBus.publish(event);

  assert(processed);
});
