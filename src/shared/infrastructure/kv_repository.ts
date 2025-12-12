/**
 * KV Repository
 *
 * Base repository implementation using Deno KV.
 * Provides persistence for aggregates with event publishing.
 *
 * @module
 */

import { getKV, type KVStore } from '@echelon/orm/kv.ts';
import { AggregateRoot } from '../domain/aggregate_root.ts';
import { Repository, type FindAllOptions, type PaginatedResult } from '../domain/repository.ts';
import { getEventBus, type EventBus } from './event_bus.ts';
import { getEventStore, type EventStore } from './event_store.ts';

/**
 * Base repository implementation with KV storage
 */
export abstract class KVRepository<T extends AggregateRoot<string>>
  implements Repository<T, string> {
  protected kv!: KVStore;
  protected eventBus: EventBus;
  protected eventStore!: EventStore;
  protected initialized = false;

  constructor(
    protected readonly prefix: string,
    protected readonly aggregateType: string,
    protected readonly enableEventSourcing: boolean = false
  ) {
    this.eventBus = getEventBus();
  }

  /**
   * Initialize the repository
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.kv = await getKV();
    if (this.enableEventSourcing) {
      this.eventStore = await getEventStore();
    }
    this.initialized = true;
  }

  /**
   * Ensure initialization
   */
  protected async ensureInit(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  /**
   * Find aggregate by ID
   */
  async findById(id: string): Promise<T | null> {
    await this.ensureInit();

    // If event sourcing enabled, rebuild from events
    if (this.enableEventSourcing) {
      return await this.findByIdFromEvents(id);
    }

    // Otherwise, load from KV
    const data = await this.kv.get<Record<string, unknown>>([this.prefix, id]);
    if (!data) return null;

    return this.fromData(data);
  }

  /**
   * Find by ID from event store
   */
  protected async findByIdFromEvents(id: string): Promise<T | null> {
    const exists = await this.eventStore.exists(id);
    if (!exists) return null;

    const { state, version } = await this.eventStore.replayEvents(
      id,
      (state, event) => this.applyEvent(state, event),
      this.createInitialState(id)
    );

    return this.fromState(id, state, version);
  }

  /**
   * Find all aggregates
   */
  async findAll(options?: FindAllOptions): Promise<T[]> {
    await this.ensureInit();

    const limit = options?.limit ?? 100;
    const entries = await this.kv.list<Record<string, unknown>>([this.prefix], { limit });

    const aggregates: T[] = [];
    for (const { value } of entries) {
      const aggregate = this.fromData(value);
      if (aggregate) {
        aggregates.push(aggregate);
      }
    }

    return aggregates;
  }

  /**
   * Find with pagination
   */
  async findPaginated(
    page: number = 1,
    pageSize: number = 20
  ): Promise<PaginatedResult<T>> {
    await this.ensureInit();

    const offset = (page - 1) * pageSize;
    const entries = await this.kv.list<Record<string, unknown>>([this.prefix], {
      limit: pageSize + 1, // Fetch one extra to check hasNext
    });

    const items: T[] = [];
    let count = 0;

    for (const { value } of entries) {
      if (count >= pageSize) break;
      const aggregate = this.fromData(value);
      if (aggregate) {
        items.push(aggregate);
        count++;
      }
    }

    const hasNext = entries.length > pageSize;
    const hasPrevious = page > 1;

    // Estimate total (this is approximate)
    const allEntries = await this.kv.list([this.prefix]);
    const total = allEntries.length;

    return {
      items,
      total,
      page,
      pageSize,
      hasNext,
      hasPrevious,
    };
  }

  /**
   * Save aggregate
   */
  async save(aggregate: T): Promise<void> {
    await this.ensureInit();

    // If event sourcing enabled, append events to event store
    if (this.enableEventSourcing && aggregate.hasDomainEvents()) {
      const events = aggregate.getDomainEvents();
      await this.eventStore.appendEvents(
        aggregate.id,
        this.aggregateType,
        [...events], // Create mutable copy of readonly array
        aggregate.version - events.length
      );
    }

    // Save aggregate state to KV
    const data = this.toData(aggregate);
    await this.kv.set([this.prefix, aggregate.id], data);

    // Publish domain events
    if (aggregate.hasDomainEvents()) {
      const events = aggregate.getDomainEvents();
      await this.eventBus.publishAll([...events]);
      aggregate.clearDomainEvents();
    }
  }

  /**
   * Delete aggregate
   */
  async delete(id: string): Promise<void> {
    await this.ensureInit();
    await this.kv.delete([this.prefix, id]);
  }

  /**
   * Check if aggregate exists
   */
  async exists(id: string): Promise<boolean> {
    await this.ensureInit();

    if (this.enableEventSourcing) {
      return await this.eventStore.exists(id);
    }

    const data = await this.kv.get([this.prefix, id]);
    return data !== null;
  }

  /**
   * Convert aggregate to data for storage
   */
  protected abstract toData(aggregate: T): Record<string, unknown>;

  /**
   * Convert data to aggregate
   */
  protected abstract fromData(data: Record<string, unknown>): T | null;

  /**
   * Create initial state for event sourcing
   */
  protected createInitialState(_id: string): Record<string, unknown> {
    throw new Error('createInitialState must be implemented for event-sourced aggregates');
  }

  /**
   * Apply event to state (for event sourcing)
   */
  protected applyEvent(
    _state: Record<string, unknown>,
    _event: unknown
  ): Record<string, unknown> {
    throw new Error('applyEvent must be implemented for event-sourced aggregates');
  }

  /**
   * Rebuild aggregate from state (for event sourcing)
   */
  protected fromState(
    _id: string,
    _state: Record<string, unknown>,
    _version: number
  ): T | null {
    throw new Error('fromState must be implemented for event-sourced aggregates');
  }
}
