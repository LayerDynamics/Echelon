/**
 * Domain Event
 *
 * Base class for all domain events in the system.
 * Domain events represent something that happened in the domain that domain experts care about.
 *
 * @module
 */

export interface DomainEventMetadata {
  eventId: string;
  occurredAt: Date;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  sequenceNumber?: number;
  userId?: string;
  workspaceId?: string;
  correlationId?: string;
  causationId?: string;
}

/**
 * Base class for domain events
 */
export abstract class DomainEvent {
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly eventType: string;
  readonly sequenceNumber?: number;
  readonly userId?: string;
  readonly workspaceId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(
    aggregateId: string,
    aggregateType: string,
    eventType: string,
    metadata?: Partial<DomainEventMetadata>
  ) {
    this.eventId = metadata?.eventId ?? crypto.randomUUID();
    this.occurredAt = metadata?.occurredAt ?? new Date();
    this.aggregateId = aggregateId;
    this.aggregateType = aggregateType;
    this.eventType = eventType;
    this.sequenceNumber = metadata?.sequenceNumber;
    this.userId = metadata?.userId;
    this.workspaceId = metadata?.workspaceId;
    this.correlationId = metadata?.correlationId;
    this.causationId = metadata?.causationId;
  }

  /**
   * Convert event to plain object for serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      eventId: this.eventId,
      occurredAt: this.occurredAt.toISOString(),
      aggregateId: this.aggregateId,
      aggregateType: this.aggregateType,
      eventType: this.eventType,
      sequenceNumber: this.sequenceNumber,
      userId: this.userId,
      workspaceId: this.workspaceId,
      correlationId: this.correlationId,
      causationId: this.causationId,
      ...this.getEventData(),
    };
  }

  /**
   * Get event-specific data for serialization
   * Override this in subclasses to include event-specific fields
   */
  protected abstract getEventData(): Record<string, unknown>;

  /**
   * Get metadata for event
   */
  getMetadata(): DomainEventMetadata {
    return {
      eventId: this.eventId,
      occurredAt: this.occurredAt,
      aggregateId: this.aggregateId,
      aggregateType: this.aggregateType,
      eventType: this.eventType,
      sequenceNumber: this.sequenceNumber,
      userId: this.userId,
      workspaceId: this.workspaceId,
      correlationId: this.correlationId,
      causationId: this.causationId,
    };
  }
}

/**
 * Type guard for DomainEvent
 */
export function isDomainEvent(obj: unknown): obj is DomainEvent {
  return obj instanceof DomainEvent;
}

/**
 * Helper to create domain event metadata from context
 */
export function createEventMetadata(
  aggregateId: string,
  aggregateType: string,
  userId?: string,
  workspaceId?: string,
  correlationId?: string,
  causationId?: string
): Partial<DomainEventMetadata> {
  return {
    eventId: crypto.randomUUID(),
    occurredAt: new Date(),
    aggregateId,
    aggregateType,
    userId,
    workspaceId,
    correlationId,
    causationId,
  };
}
