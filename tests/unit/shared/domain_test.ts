/**
 * Domain Base Classes Tests
 *
 * Tests for Entity, ValueObject, AggregateRoot, and DomainEvent.
 */

import { assertEquals, assertExists, assert } from 'jsr:@std/assert';
import { Entity } from '../../../src/shared/domain/entity.ts';
import { ValueObject } from '../../../src/shared/domain/value_object.ts';
import { AggregateRoot } from '../../../src/shared/domain/aggregate_root.ts';
import { DomainEvent } from '../../../src/shared/domain/domain_event.ts';

// ============================================================================
// Test Implementations
// ============================================================================

class TestEntity extends Entity<string> {
  constructor(id: string, private name: string) {
    super(id);
  }

  getName(): string {
    return this.name;
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
    };
  }
}

interface MoneyProps {
  amount: number;
  currency: string;
}

class Money extends ValueObject<MoneyProps> {
  static create(amount: number, currency: string): Money {
    return new Money({ amount, currency });
  }

  get amount(): number {
    return this.props.amount;
  }

  get currency(): string {
    return this.props.currency;
  }
}

class TestAggregate extends AggregateRoot<string> {
  constructor(
    id: string,
    private name: string
  ) {
    super(id);
  }

  changeName(newName: string): void {
    this.name = newName;
    this.update();
    this.addDomainEvent(new TestEvent(this.id, newName));
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
    };
  }
}

class TestEvent extends DomainEvent {
  constructor(
    public override readonly aggregateId: string,
    public readonly newName: string
  ) {
    super(aggregateId, 'TestAggregate', 'TestEvent');
  }

  protected getEventData(): Record<string, unknown> {
    return {
      newName: this.newName,
    };
  }
}

// ============================================================================
// Tests
// ============================================================================

Deno.test('Entity: should have identity', () => {
  const entity1 = new TestEntity('1', 'Test');
  const entity2 = new TestEntity('1', 'Test');
  const entity3 = new TestEntity('2', 'Test');

  assert(entity1.equals(entity2), 'Entities with same ID should be equal');
  assert(!entity1.equals(entity3), 'Entities with different IDs should not be equal');
});

Deno.test('Entity: should track timestamps', () => {
  const entity = new TestEntity('1', 'Test');

  assertExists(entity.createdAt);
  assertExists(entity.updatedAt);
  assert(entity.createdAt instanceof Date);
  assert(entity.updatedAt instanceof Date);
});

Deno.test('ValueObject: should be immutable', () => {
  const money = Money.create(100, 'USD');

  assertEquals(money.amount, 100);
  assertEquals(money.currency, 'USD');

  // Props should be frozen
  const props = money.getValue();
  assertEquals(props.amount, 100);
  assertEquals(props.currency, 'USD');
});

Deno.test('ValueObject: should compare by value', () => {
  const money1 = Money.create(100, 'USD');
  const money2 = Money.create(100, 'USD');
  const money3 = Money.create(200, 'USD');

  assert(money1.equals(money2), 'Value objects with same props should be equal');
  assert(!money1.equals(money3), 'Value objects with different props should not be equal');
});

Deno.test('AggregateRoot: should collect domain events', () => {
  const aggregate = new TestAggregate('1', 'Initial');

  assertEquals(aggregate.hasDomainEvents(), false);
  assertEquals(aggregate.getDomainEvents().length, 0);

  aggregate.changeName('Updated');

  assertEquals(aggregate.hasDomainEvents(), true);
  assertEquals(aggregate.getDomainEvents().length, 1);

  const events = aggregate.getDomainEvents();
  assertEquals(events[0].eventType, 'TestEvent');
  assertEquals((events[0] as TestEvent).newName, 'Updated');
});

Deno.test('AggregateRoot: should clear domain events', () => {
  const aggregate = new TestAggregate('1', 'Initial');

  aggregate.changeName('Updated');
  assertEquals(aggregate.hasDomainEvents(), true);

  aggregate.clearDomainEvents();
  assertEquals(aggregate.hasDomainEvents(), false);
  assertEquals(aggregate.getDomainEvents().length, 0);
});

Deno.test('AggregateRoot: should increment version', () => {
  const aggregate = new TestAggregate('1', 'Initial');
  const initialVersion = aggregate.version;

  aggregate.changeName('Updated');

  assertEquals(aggregate.version, initialVersion + 1);
});

Deno.test('DomainEvent: should have metadata', () => {
  const event = new TestEvent('agg-1', 'NewName');

  assertExists(event.eventId);
  assertExists(event.occurredAt);
  assertEquals(event.aggregateId, 'agg-1');
  assertEquals(event.aggregateType, 'TestAggregate');
  assertEquals(event.eventType, 'TestEvent');
  assert(event.occurredAt instanceof Date);
});

Deno.test('DomainEvent: should serialize to JSON', () => {
  const event = new TestEvent('agg-1', 'NewName');
  const json = event.toJSON();

  assertExists(json.eventId);
  assertExists(json.occurredAt);
  assertEquals(json.aggregateId, 'agg-1');
  assertEquals(json.aggregateType, 'TestAggregate');
  assertEquals(json.eventType, 'TestEvent');
  assertEquals((json as {newName: string}).newName, 'NewName');
});
