/**
 * Event Bus
 *
 * Domain event bus implementation using framework's EventEmitter.
 * Provides pub/sub for domain events across bounded contexts.
 *
 * @module
 */

import { getEventEmitter, type EventHandler } from '@echelon/plugin/events.ts';
import { DomainEvent } from '../domain/domain_event.ts';

/**
 * Domain event handler type
 */
export type DomainEventHandler<T extends DomainEvent = DomainEvent> = (
  event: T
) => void | Promise<void>;

/**
 * Event bus for domain events
 */
export class EventBus {
  private emitter = getEventEmitter();
  private eventHandlers = new Map<string, Set<DomainEventHandler>>();

  /**
   * Subscribe to a domain event
   */
  subscribe<T extends DomainEvent>(
    eventType: string,
    handler: DomainEventHandler<T>
  ): void {
    // Store handler reference for unsubscribe
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler as DomainEventHandler);

    // Register with framework EventEmitter
    this.emitter.on(eventType, handler as EventHandler);
  }

  /**
   * Subscribe to a domain event (one-time handler)
   */
  subscribeOnce<T extends DomainEvent>(
    eventType: string,
    handler: DomainEventHandler<T>
  ): void {
    this.emitter.once(eventType, handler as EventHandler);
  }

  /**
   * Unsubscribe from a domain event
   */
  unsubscribe<T extends DomainEvent>(
    eventType: string,
    handler: DomainEventHandler<T>
  ): void {
    this.eventHandlers.get(eventType)?.delete(handler as DomainEventHandler);
    this.emitter.off(eventType, handler as EventHandler);
  }

  /**
   * Publish a single domain event
   */
  async publish(event: DomainEvent): Promise<void> {
    try {
      console.log(`[EventBus] Publishing ${event.eventType}`, {
        eventId: event.eventId,
        aggregateId: event.aggregateId,
        aggregateType: event.aggregateType,
      });

      await this.emitter.emit(event.eventType, event);

      console.log(`[EventBus] Published ${event.eventType}`, {
        eventId: event.eventId,
      });
    } catch (error) {
      console.error(`[EventBus] Failed to publish ${event.eventType}`, {
        eventId: event.eventId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Publish multiple domain events
   */
  async publishAll(events: DomainEvent[]): Promise<void> {
    if (events.length === 0) return;

    console.log(`[EventBus] Publishing ${events.length} events`);

    const results = await Promise.allSettled(
      events.map((event) => this.publish(event))
    );

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      console.error(`[EventBus] ${failed.length}/${events.length} events failed to publish`);
      throw new Error(
        `Failed to publish ${failed.length} events: ${
          failed
            .map((r) => (r as PromiseRejectedResult).reason)
            .join(', ')
        }`
      );
    }

    console.log(`[EventBus] Published ${events.length} events successfully`);
  }

  /**
   * Clear all handlers for an event type
   */
  clearHandlers(eventType: string): void {
    this.eventHandlers.delete(eventType);
    this.emitter.removeAllListeners(eventType);
  }

  /**
   * Clear all handlers
   */
  clearAllHandlers(): void {
    this.eventHandlers.clear();
    this.emitter.removeAllListeners();
  }

  /**
   * Get count of handlers for an event type
   */
  getHandlerCount(eventType: string): number {
    return this.emitter.listenerCount(eventType);
  }

  /**
   * Get all event types with handlers
   */
  getEventTypes(): string[] {
    return this.emitter.eventNames();
  }

  /**
   * Check if event type has handlers
   */
  hasHandlers(eventType: string): boolean {
    return this.getHandlerCount(eventType) > 0;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _defaultEventBus: EventBus | null = null;

/**
 * Get the default event bus instance (singleton)
 */
export function getEventBus(): EventBus {
  if (!_defaultEventBus) {
    _defaultEventBus = new EventBus();
  }
  return _defaultEventBus;
}

/**
 * Create a new event bus instance
 */
export function createEventBus(): EventBus {
  return new EventBus();
}

// ============================================================================
// Event Handler Decorators
// ============================================================================

/**
 * Decorator metadata for event handlers
 */
export interface EventHandlerMetadata {
  eventType: string;
  handler: DomainEventHandler;
  once?: boolean;
}

/**
 * Decorator to mark a method as an event handler
 */
export function EventHandler(eventType: string, once: boolean = false) {
  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    // Store metadata for auto-registration
    if (!descriptor.value._eventHandlerMetadata) {
      descriptor.value._eventHandlerMetadata = [];
    }
    descriptor.value._eventHandlerMetadata.push({
      eventType,
      handler: originalMethod,
      once,
    });

    return descriptor;
  };
}

/**
 * Register all decorated event handlers on a class instance
 */
export function registerEventHandlers(instance: unknown, eventBus: EventBus): void {
  const prototype = Object.getPrototypeOf(instance);
  const propertyNames = Object.getOwnPropertyNames(prototype);

  for (const propertyName of propertyNames) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, propertyName);
    if (descriptor && typeof descriptor.value === 'function') {
      const metadata = descriptor.value._eventHandlerMetadata as
        | EventHandlerMetadata[]
        | undefined;

      if (metadata) {
        for (const { eventType, once } of metadata) {
          const boundHandler = descriptor.value.bind(instance);
          if (once) {
            eventBus.subscribeOnce(eventType, boundHandler);
          } else {
            eventBus.subscribe(eventType, boundHandler);
          }
        }
      }
    }
  }
}
