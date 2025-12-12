/**
 * Aggregate Root
 *
 * Base class for aggregate roots - entities that are the root of an aggregate.
 * Aggregates enforce consistency boundaries and collect domain events.
 *
 * @module
 */

import { Entity } from './entity.ts';
import { DomainEvent } from './domain_event.ts';

/**
 * Base class for aggregate roots
 */
export abstract class AggregateRoot<TId = string> extends Entity<TId> {
  private _domainEvents: DomainEvent[] = [];
  private _version: number = 0;

  constructor(id: TId, createdAt?: Date, updatedAt?: Date, version?: number) {
    super(id, createdAt, updatedAt);
    this._version = version ?? 0;
  }

  /**
   * Get aggregate version (for optimistic concurrency)
   */
  get version(): number {
    return this._version;
  }

  /**
   * Increment version
   */
  protected incrementVersion(): void {
    this._version++;
  }

  /**
   * Add a domain event to the aggregate
   */
  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  /**
   * Get all domain events
   */
  getDomainEvents(): readonly DomainEvent[] {
    return [...this._domainEvents];
  }

  /**
   * Clear all domain events (typically after publishing)
   */
  clearDomainEvents(): void {
    this._domainEvents = [];
  }

  /**
   * Check if aggregate has any domain events
   */
  hasDomainEvents(): boolean {
    return this._domainEvents.length > 0;
  }

  /**
   * Mark aggregate as updated and increment version
   */
  protected update(): void {
    this.touch();
    this.incrementVersion();
  }

  /**
   * Convert aggregate to plain object (without domain events)
   */
  abstract override toJSON(): Record<string, unknown>;
}

/**
 * Type guard for AggregateRoot
 */
export function isAggregateRoot(obj: unknown): obj is AggregateRoot {
  return obj instanceof AggregateRoot;
}
