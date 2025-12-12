/**
 * Debugger to OpenTelemetry Bridge
 *
 * Converts Echelon Debugger events into OpenTelemetry spans and events.
 * This bridge allows the rich debugging information to be exported via OTLP
 * while maintaining the existing debugger functionality.
 *
 * @module
 */

import {
  SpanKind,
  SpanStatusCode,
  type Span,
  type Attributes,
} from '@opentelemetry/api';
import type { DebugEvent, DebugEventType, DebugListener } from './debugger.ts';
import { DebugLevel } from './levels.ts';
import {
  isOTELEnabled,
  getOTELTracer,
} from '../telemetry/otel.ts';
import {
  getRequestContext,
  createChildSpan,
} from '../telemetry/otel_context.ts';

// ============================================================================
// Bridge Configuration
// ============================================================================

export interface DebuggerOTelBridgeOptions {
  /** Convert debug events to span events (default: true) */
  convertEventsToSpanEvents?: boolean;
  /** Create child spans for middleware/controller events (default: true) */
  createChildSpans?: boolean;
  /** Minimum debug level to bridge (default: DEBUG) */
  minLevel?: DebugLevel;
  /** Event types to ignore (won't be bridged) */
  ignoreEvents?: DebugEventType[];
}

const DEFAULT_OPTIONS: Required<DebuggerOTelBridgeOptions> = {
  convertEventsToSpanEvents: true,
  createChildSpans: true,
  minLevel: DebugLevel.DEBUG,
  ignoreEvents: [],
};

// ============================================================================
// Event to Span Name Mapping
// ============================================================================

const EVENT_TO_SPAN_NAME: Partial<Record<DebugEventType, string>> = {
  'middleware:enter': 'middleware',
  'controller:enter': 'controller',
  'orm:query': 'db.query',
  'auth:check': 'auth.check',
  'cache:get': 'cache.get',
  'cache:set': 'cache.set',
  'view:render': 'view.render',
  'job:start': 'job.process',
  'search:query': 'search.query',
  'api:request': 'http.client',
};

// ============================================================================
// Debugger to OpenTelemetry Bridge
// ============================================================================

export class DebuggerOTelBridge {
  private options: Required<DebuggerOTelBridgeOptions>;
  private activeSpans: Map<string, Map<string, Span>> = new Map();
  private enabled: boolean;

  constructor(options: DebuggerOTelBridgeOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.enabled = isOTELEnabled();
  }

  /**
   * Create the debug listener function.
   * This is the main entry point for bridging debug events to OTel.
   */
  createListener(): DebugListener {
    return (event: DebugEvent) => {
      if (!this.enabled) return;
      if (this.shouldIgnoreEvent(event)) return;

      this.handleEvent(event);
    };
  }

  /**
   * Check if an event should be ignored based on configuration
   */
  private shouldIgnoreEvent(event: DebugEvent): boolean {
    // Check minimum level
    if (event.level < this.options.minLevel) return true;

    // Check ignore list
    if (this.options.ignoreEvents.includes(event.type)) return true;

    return false;
  }

  /**
   * Main event handler - routes events to appropriate handlers
   */
  private handleEvent(event: DebugEvent): void {
    switch (event.type) {
      // Middleware events - create child spans
      case 'middleware:enter':
        if (this.options.createChildSpans) {
          this.handleMiddlewareEnter(event);
        }
        break;
      case 'middleware:exit':
        if (this.options.createChildSpans) {
          this.handleMiddlewareExit(event);
        }
        break;

      // Controller events - create child spans
      case 'controller:enter':
        if (this.options.createChildSpans) {
          this.handleControllerEnter(event);
        }
        break;
      case 'controller:exit':
        if (this.options.createChildSpans) {
          this.handleControllerExit(event);
        }
        break;

      // Cache events - add as span events
      case 'cache:hit':
      case 'cache:miss':
        this.addEventToActiveSpan(event, 'cache.' + event.type.split(':')[1]);
        break;

      // Auth events
      case 'auth:success':
      case 'auth:failure':
        this.addEventToActiveSpan(event, 'auth.' + event.type.split(':')[1]);
        break;

      // Error events - record exception
      case 'error':
        this.handleError(event);
        break;

      // All other events - add as span events if enabled
      default:
        if (this.options.convertEventsToSpanEvents) {
          this.addEventToActiveSpan(event, event.type);
        }
        break;
    }
  }

  // ============================================================================
  // Middleware Span Handling
  // ============================================================================

  private handleMiddlewareEnter(event: DebugEvent): void {
    if (!event.requestId) return;

    const middlewareName = (event.data as { name?: string })?.name ?? 'unknown';
    const spanKey = `middleware:${middlewareName}`;

    const span = createChildSpan(
      `middleware.${middlewareName}`,
      event.requestId,
      SpanKind.INTERNAL,
    );

    span.setAttribute('middleware.name', middlewareName);
    if (event.data) {
      const data = event.data as Record<string, unknown>;
      if (data.index !== undefined) {
        span.setAttribute('middleware.index', data.index as number);
      }
    }

    this.setActiveSpan(event.requestId, spanKey, span);
  }

  private handleMiddlewareExit(event: DebugEvent): void {
    if (!event.requestId) return;

    const middlewareName = (event.data as { name?: string })?.name ?? 'unknown';
    const spanKey = `middleware:${middlewareName}`;

    const span = this.getActiveSpan(event.requestId, spanKey);
    if (span) {
      if (event.duration !== undefined) {
        span.setAttribute('middleware.duration_ms', event.duration);
      }
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      this.removeActiveSpan(event.requestId, spanKey);
    }
  }

  // ============================================================================
  // Controller Span Handling
  // ============================================================================

  private handleControllerEnter(event: DebugEvent): void {
    if (!event.requestId) return;

    const span = createChildSpan(
      'controller',
      event.requestId,
      SpanKind.INTERNAL,
    );

    this.setActiveSpan(event.requestId, 'controller', span);
  }

  private handleControllerExit(event: DebugEvent): void {
    if (!event.requestId) return;

    const span = this.getActiveSpan(event.requestId, 'controller');
    if (span) {
      if (event.duration !== undefined) {
        span.setAttribute('controller.duration_ms', event.duration);
      }
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      this.removeActiveSpan(event.requestId, 'controller');
    }
  }

  // ============================================================================
  // Error Handling
  // ============================================================================

  private handleError(event: DebugEvent): void {
    if (!event.requestId) return;

    // Try to find any active span for this request
    const requestSpans = this.activeSpans.get(event.requestId);
    if (requestSpans && requestSpans.size > 0) {
      // Record exception on all active spans
      const error = event.data instanceof Error
        ? event.data
        : new Error(event.message);

      for (const span of requestSpans.values()) {
        span.recordException(error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: event.message,
        });
      }
    }
  }

  // ============================================================================
  // Span Event Handling
  // ============================================================================

  private addEventToActiveSpan(event: DebugEvent, eventName: string): void {
    if (!event.requestId) return;

    // Get any active span for this request
    const requestSpans = this.activeSpans.get(event.requestId);
    if (!requestSpans || requestSpans.size === 0) {
      // No active child spans, try to add to root span if available
      const ctx = getRequestContext(event.requestId);
      if (!ctx) return;

      // Can't easily get the span from context without trace.getActiveSpan()
      // which requires the context to be active. Skip for now.
      return;
    }

    // Add event to the most recently created span
    const spans = Array.from(requestSpans.values());
    const latestSpan = spans[spans.length - 1];

    const attributes: Attributes = {
      'debug.level': event.level,
      'debug.module': event.module,
    };

    if (event.data && typeof event.data === 'object') {
      const data = event.data as Record<string, unknown>;
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          attributes[`event.${key}`] = value;
        }
      }
    }

    latestSpan.addEvent(eventName, attributes);
  }

  // ============================================================================
  // Span Storage Management
  // ============================================================================

  private getSpanMap(requestId: string): Map<string, Span> {
    let map = this.activeSpans.get(requestId);
    if (!map) {
      map = new Map();
      this.activeSpans.set(requestId, map);
    }
    return map;
  }

  private setActiveSpan(requestId: string, key: string, span: Span): void {
    const map = this.getSpanMap(requestId);
    map.set(key, span);
  }

  private getActiveSpan(requestId: string, key: string): Span | undefined {
    return this.getSpanMap(requestId).get(key);
  }

  private removeActiveSpan(requestId: string, key: string): void {
    const map = this.activeSpans.get(requestId);
    if (map) {
      map.delete(key);
      if (map.size === 0) {
        this.activeSpans.delete(requestId);
      }
    }
  }

  /**
   * Clean up all spans for a request (e.g., when request ends)
   */
  cleanupRequest(requestId: string): void {
    const map = this.activeSpans.get(requestId);
    if (map) {
      // End all remaining spans
      for (const span of map.values()) {
        span.end();
      }
      this.activeSpans.delete(requestId);
    }
  }

  /**
   * Get statistics about active spans
   */
  getStats(): {
    activeRequests: number;
    totalActiveSpans: number;
  } {
    let totalSpans = 0;
    for (const map of this.activeSpans.values()) {
      totalSpans += map.size;
    }
    return {
      activeRequests: this.activeSpans.size,
      totalActiveSpans: totalSpans,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

let _defaultBridge: DebuggerOTelBridge | null = null;

/**
 * Get the default bridge instance (singleton)
 */
export function getDebuggerOTelBridge(): DebuggerOTelBridge {
  if (!_defaultBridge) {
    _defaultBridge = new DebuggerOTelBridge();
  }
  return _defaultBridge;
}

/**
 * Create a new bridge instance with custom options
 */
export function createDebuggerOTelBridge(
  options?: DebuggerOTelBridgeOptions,
): DebuggerOTelBridge {
  return new DebuggerOTelBridge(options);
}

/**
 * Convenience function to create and attach a bridge to a debugger
 */
export function attachOTelBridge(
  debuggerInstance: { addListener: (listener: DebugListener) => void },
  options?: DebuggerOTelBridgeOptions,
): DebuggerOTelBridge {
  const bridge = new DebuggerOTelBridge(options);
  debuggerInstance.addListener(bridge.createListener());
  return bridge;
}
