/**
 * Event Store
 *
 * Event sourcing implementation using Deno KV.
 * Stores domain events as immutable append-only log.
 *
 * @module
 */

import { getKV, type KVStore } from '@echelon/orm/kv.ts';
import { DomainEvent } from '../domain/domain_event.ts';

/**
 * Stored event with metadata
 */
export interface StoredEvent {
  eventId: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  sequenceNumber: number;
  occurredAt: string;
  userId?: string;
  workspaceId?: string;
  correlationId?: string;
  causationId?: string;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

/**
 * Event stream for an aggregate
 */
export interface EventStream {
  aggregateId: string;
  aggregateType: string;
  version: number;
  events: StoredEvent[];
}

/**
 * Event store options
 */
export interface EventStoreOptions {
  snapshotInterval?: number; // Take snapshot every N events
}

/**
 * Snapshot of aggregate state
 */
export interface Snapshot {
  aggregateId: string;
  aggregateType: string;
  version: number;
  state: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Event store implementation with Deno KV
 */
export class EventStore {
  private kv!: KVStore;
  private options: Required<EventStoreOptions>;

  constructor(options: EventStoreOptions = {}) {
    this.options = {
      snapshotInterval: options.snapshotInterval ?? 100,
    };
  }

  /**
   * Initialize the event store
   */
  async init(): Promise<void> {
    this.kv = await getKV();
  }

  /**
   * Append events to an aggregate's event stream
   */
  async appendEvents(
    aggregateId: string,
    aggregateType: string,
    events: DomainEvent[],
    expectedVersion: number
  ): Promise<void> {
    if (events.length === 0) return;

    // Get current version
    const currentVersion = await this.getVersion(aggregateId);

    // Optimistic concurrency check
    if (currentVersion !== expectedVersion) {
      throw new Error(
        `Concurrency conflict: expected version ${expectedVersion}, got ${currentVersion}`
      );
    }

    // Prepare atomic operation
    const atomic = this.kv.atomic();

    let sequenceNumber = currentVersion + 1;
    for (const event of events) {
      // Convert event to JSON and extract event-specific data
      const jsonEvent = event.toJSON();
      const { eventId: _eventId, occurredAt: _occurredAt, aggregateId: _aggregateId,
              aggregateType: _aggregateType, eventType: _eventType, sequenceNumber: _sequenceNumber,
              userId: _userId, workspaceId: _workspaceId, correlationId: _correlationId,
              causationId: _causationId, ...eventData } = jsonEvent;

      const storedEvent: StoredEvent = {
        eventId: event.eventId,
        aggregateId,
        aggregateType,
        eventType: event.eventType,
        sequenceNumber,
        occurredAt: event.occurredAt.toISOString(),
        userId: event.userId,
        workspaceId: event.workspaceId,
        correlationId: event.correlationId,
        causationId: event.causationId,
        data: eventData,
        metadata: {
          ...event.getMetadata(),
        },
      };

      // Store event: ['events', aggregateId, sequenceNumber]
      atomic.set(['events', aggregateId, sequenceNumber], storedEvent);

      // Store by event type for queries: ['events_by_type', eventType, eventId]
      atomic.set(['events_by_type', event.eventType, event.eventId], {
        aggregateId,
        sequenceNumber,
      });

      // Store by workspace for queries: ['events_by_workspace', workspaceId, eventId]
      if (event.workspaceId) {
        atomic.set(['events_by_workspace', event.workspaceId, event.eventId], {
          aggregateId,
          sequenceNumber,
        });
      }

      sequenceNumber++;
    }

    // Update version counter: ['event_stream_version', aggregateId]
    atomic.set(['event_stream_version', aggregateId], sequenceNumber - 1);

    // Commit atomic operation
    const result = await atomic.commit();
    if (!result.ok) {
      throw new Error('Failed to append events to event store');
    }

    console.log(`[EventStore] Appended ${events.length} events to ${aggregateId}`, {
      aggregateType,
      newVersion: sequenceNumber - 1,
    });

    // Check if snapshot is needed
    if ((sequenceNumber - 1) % this.options.snapshotInterval === 0) {
      console.log(`[EventStore] Snapshot interval reached for ${aggregateId}`);
    }
  }

  /**
   * Get event stream for an aggregate
   */
  async getEventStream(
    aggregateId: string,
    fromVersion: number = 0
  ): Promise<EventStream> {
    const events: StoredEvent[] = [];
    // List all events for this aggregate and filter by version
    const entries = await this.kv.list<StoredEvent>(['events', aggregateId]);

    for (const { value } of entries) {
      // Filter events by version (only include events after fromVersion)
      if (value.sequenceNumber > fromVersion) {
        events.push(value);
      }
    }

    const version = events.length > 0
      ? events[events.length - 1].sequenceNumber
      : 0;

    return {
      aggregateId,
      aggregateType: events[0]?.aggregateType ?? 'unknown',
      version,
      events,
    };
  }

  /**
   * Get current version of an aggregate
   */
  async getVersion(aggregateId: string): Promise<number> {
    const result = await this.kv.get<number>(['event_stream_version', aggregateId]);
    return result ?? 0;
  }

  /**
   * Check if aggregate exists in event store
   */
  async exists(aggregateId: string): Promise<boolean> {
    const version = await this.getVersion(aggregateId);
    return version > 0;
  }

  /**
   * Get events by type
   */
  async getEventsByType(
    eventType: string,
    limit: number = 100
  ): Promise<StoredEvent[]> {
    const references = await this.kv.list<{ aggregateId: string; sequenceNumber: number }>(
      ['events_by_type', eventType],
      { limit }
    );

    const events: StoredEvent[] = [];
    for (const { value } of references) {
      const event = await this.kv.get<StoredEvent>([
        'events',
        value.aggregateId,
        value.sequenceNumber,
      ]);
      if (event) {
        events.push(event);
      }
    }

    return events;
  }

  /**
   * Get events by workspace
   */
  async getEventsByWorkspace(
    workspaceId: string,
    limit: number = 100
  ): Promise<StoredEvent[]> {
    const references = await this.kv.list<{ aggregateId: string; sequenceNumber: number }>(
      ['events_by_workspace', workspaceId],
      { limit }
    );

    const events: StoredEvent[] = [];
    for (const { value } of references) {
      const event = await this.kv.get<StoredEvent>([
        'events',
        value.aggregateId,
        value.sequenceNumber,
      ]);
      if (event) {
        events.push(event);
      }
    }

    return events;
  }

  /**
   * Save a snapshot
   */
  async saveSnapshot(snapshot: Snapshot): Promise<void> {
    await this.kv.set(
      ['snapshots', snapshot.aggregateId, snapshot.version],
      {
        ...snapshot,
        createdAt: snapshot.createdAt.toISOString(),
      }
    );

    // Update latest snapshot pointer
    await this.kv.set(['snapshots_latest', snapshot.aggregateId], snapshot.version);

    console.log(`[EventStore] Saved snapshot for ${snapshot.aggregateId}`, {
      version: snapshot.version,
    });
  }

  /**
   * Get latest snapshot
   */
  async getLatestSnapshot(aggregateId: string): Promise<Snapshot | null> {
    const latestVersion = await this.kv.get<number>(['snapshots_latest', aggregateId]);
    if (!latestVersion) return null;

    const snapshot = await this.kv.get<Snapshot & { createdAt: string }>([
      'snapshots',
      aggregateId,
      latestVersion,
    ]);

    if (!snapshot) return null;

    return {
      ...snapshot,
      createdAt: new Date(snapshot.createdAt),
    };
  }

  /**
   * Replay events to rebuild aggregate state
   */
  async replayEvents<T>(
    aggregateId: string,
    applyEvent: (state: T, event: StoredEvent) => T,
    initialState: T
  ): Promise<{ state: T; version: number }> {
    // Try to load from snapshot first
    const snapshot = await this.getLatestSnapshot(aggregateId);
    let state = initialState;
    let fromVersion = 0;

    if (snapshot) {
      state = snapshot.state as T;
      fromVersion = snapshot.version;
      console.log(`[EventStore] Loaded snapshot for ${aggregateId}`, {
        version: snapshot.version,
      });
    }

    // Load events since snapshot
    const stream = await this.getEventStream(aggregateId, fromVersion);

    // Apply events
    for (const event of stream.events) {
      state = applyEvent(state, event);
    }

    return {
      state,
      version: stream.version,
    };
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<{
    totalAggregates: number;
    totalEvents: number;
    totalSnapshots: number;
  }> {
    const versionEntries = await this.kv.list<number>(['event_stream_version']);
    const totalAggregates = versionEntries.length;

    let totalEvents = 0;
    for (const { value } of versionEntries) {
      totalEvents += value;
    }

    const snapshotEntries = await this.kv.list(['snapshots_latest']);
    const totalSnapshots = snapshotEntries.length;

    return {
      totalAggregates,
      totalEvents,
      totalSnapshots,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _defaultEventStore: EventStore | null = null;

/**
 * Get the default event store instance (singleton)
 */
export async function getEventStore(): Promise<EventStore> {
  if (!_defaultEventStore) {
    _defaultEventStore = new EventStore();
    await _defaultEventStore.init();
  }
  return _defaultEventStore;
}

/**
 * Create a new event store instance
 */
export async function createEventStore(options?: EventStoreOptions): Promise<EventStore> {
  const store = new EventStore(options);
  await store.init();
  return store;
}
