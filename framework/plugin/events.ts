/**
 * Event Emitter
 *
 * Provides hook/event system for plugin communication.
 */

export type EventHandler<T = unknown> = (data: T) => void | Promise<void>;

/**
 * Event emitter for plugin hooks
 */
export class EventEmitter {
  private handlers = new Map<string, Set<EventHandler>>();

  /**
   * Register an event handler
   */
  on<T = unknown>(event: string, handler: EventHandler<T>): this {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as EventHandler);
    return this;
  }

  /**
   * Register a one-time event handler
   */
  once<T = unknown>(event: string, handler: EventHandler<T>): this {
    const wrapper: EventHandler<T> = async (data) => {
      this.off(event, wrapper);
      await handler(data);
    };
    return this.on(event, wrapper);
  }

  /**
   * Remove an event handler
   */
  off<T = unknown>(event: string, handler: EventHandler<T>): this {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.delete(handler as EventHandler);
    }
    return this;
  }

  /**
   * Remove all handlers for an event
   */
  removeAllListeners(event?: string): this {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
    return this;
  }

  /**
   * Emit an event
   */
  async emit<T = unknown>(event: string, data?: T): Promise<void> {
    const handlers = this.handlers.get(event);
    if (!handlers) return;

    for (const handler of handlers) {
      await handler(data);
    }
  }

  /**
   * Emit an event synchronously
   */
  emitSync<T = unknown>(event: string, data?: T): void {
    const handlers = this.handlers.get(event);
    if (!handlers) return;

    for (const handler of handlers) {
      handler(data);
    }
  }

  /**
   * Get the number of handlers for an event
   */
  listenerCount(event: string): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  /**
   * Get all event names with handlers
   */
  eventNames(): string[] {
    return Array.from(this.handlers.keys());
  }
}

// Default event emitter instance
let defaultEmitter: EventEmitter | null = null;

/**
 * Get the default event emitter
 */
export function getEventEmitter(): EventEmitter {
  if (!defaultEmitter) {
    defaultEmitter = new EventEmitter();
  }
  return defaultEmitter;
}

// Common events
export const Events = {
  // Application lifecycle
  APP_START: 'app:start',
  APP_READY: 'app:ready',
  APP_SHUTDOWN: 'app:shutdown',

  // Request lifecycle
  REQUEST_START: 'request:start',
  REQUEST_END: 'request:end',
  REQUEST_ERROR: 'request:error',

  // Auth events
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_FAILED: 'auth:failed',

  // Data events
  MODEL_CREATED: 'model:created',
  MODEL_UPDATED: 'model:updated',
  MODEL_DELETED: 'model:deleted',

  // Job events
  JOB_QUEUED: 'job:queued',
  JOB_STARTED: 'job:started',
  JOB_COMPLETED: 'job:completed',
  JOB_FAILED: 'job:failed',
};
