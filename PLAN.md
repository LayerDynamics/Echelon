# OpenTelemetry Integration Plan for Echelon Framework

## Overview

Progressive integration of OpenTelemetry into Echelon's telemetry and debugging systems:
1. **Phase 1**: Enable Deno's built-in OTEL support with route attributes
2. **Phase 2**: Migrate MetricsRegistry to OpenTelemetry Meter API
3. **Phase 3**: Bridge Debugger timing entries to OTel child spans
4. **Phase 4**: Add custom instrumentation for ORM, Auth, Cache, Jobs

Target: Flexible OTLP export compatible with any observability backend (Grafana, Jaeger, Datadog, etc.)

---

## Phase 1: Deno Built-in OTEL Foundation

### 1.1 Update deno.json

Add OTEL-enabled tasks and OpenTelemetry API import:

```json
{
  "tasks": {
    "dev:otel": "OTEL_DENO=true OTEL_SERVICE_NAME=echelon deno run --watch -A main.ts",
    "start:otel": "OTEL_DENO=true OTEL_SERVICE_NAME=echelon deno run --allow-net --allow-read --allow-env main.ts"
  },
  "imports": {
    "@opentelemetry/api": "npm:@opentelemetry/api@1"
  }
}
```

### 1.2 Create OTEL Utilities Module

**New file**: `framework/telemetry/otel.ts`

Core utilities for working with Deno's built-in OTEL:
- `isOTELEnabled()` - Check if OTEL_DENO=true
- `getActiveSpan()` - Get current span from context
- `setRouteAttribute(pattern, method)` - Set http.route on active span
- `setSpanAttributes(attrs)` - Add custom attributes
- `recordSpanException(error)` - Record errors on span
- Re-export trace, metrics, context from @opentelemetry/api

### 1.3 Modify Application to Set Route Attributes

**Modify**: `framework/app.ts` (createHandler method, ~line 457)

After route matching succeeds:
```typescript
if (isOTELEnabled()) {
  setRouteAttribute(match.route.pattern.pathname, method);
}
```

In catch block:
```typescript
if (isOTELEnabled()) {
  recordSpanException(error as Error);
}
```

### 1.4 Add Trace Context to Logger

**Modify**: `framework/telemetry/logger.ts`

In log() method, add traceId/spanId to log entries when OTEL is enabled:
```typescript
const span = trace.getActiveSpan();
const traceContext = span ? {
  traceId: span.spanContext().traceId,
  spanId: span.spanContext().spanId,
} : {};
```

---

## Phase 2: Migrate to OpenTelemetry Metrics API

### 2.1 Create OTel Metrics Module

**New file**: `framework/telemetry/otel_metrics.ts`

Replace Prometheus-style metrics with OTel Meter API:

```typescript
export class OTelMetrics {
  private meter: Meter;

  // HTTP metrics
  private httpRequestsTotal: Counter;
  private httpRequestDuration: Histogram;
  private httpActiveRequests: UpDownCounter;

  // Cache metrics
  private cacheHits: Counter;
  private cacheMisses: Counter;

  // Database metrics
  private dbOperationDuration: Histogram;
  private dbOperationsTotal: Counter;

  // Job metrics
  private jobsProcessed: Counter;
  private jobsFailed: Counter;
  private jobDuration: Histogram;

  // Auth metrics
  private authAttempts: Counter;
  private authFailures: Counter;
}
```

### 2.2 Create Metrics Factory

**New file**: `framework/telemetry/otel_metrics_factory.ts`

Factory that returns either:
- Legacy MetricsRegistry (when OTEL disabled)
- OTelMetrics wrapper (when OTEL enabled)

Provides backwards-compatible API while using OTel internally.

### 2.3 Update Application to Use OTel Metrics

**Modify**: `framework/app.ts`

Replace MetricsRegistry usage with OTelMetrics:
- `setupMetrics()` creates OTel instruments
- Request handler uses `otelMetrics.recordHttpRequest()`
- Active request tracking via `incrementActiveRequests()`/`decrementActiveRequests()`

---

## Phase 3: Bridge Debugger Events to OTel Spans

### 3.1 Create Debugger-to-OTel Bridge

**New file**: `framework/debugger/otel_bridge.ts`

Implements DebugListener to convert events to spans:

```typescript
export class DebuggerOTelBridge implements DebugListener {
  private tracer: Tracer;
  private activeSpans: Map<string, Map<string, Span>>;

  handleEvent(event: DebugEvent): void {
    switch(event.type) {
      case 'middleware:enter': this.startSpan(requestId, `middleware.${name}`);
      case 'middleware:exit': this.endSpan(requestId, `middleware.${name}`);
      case 'controller:enter': this.startSpan(requestId, 'controller');
      case 'controller:exit': this.endSpan(requestId, 'controller');
      case 'cache:hit': this.addSpanEvent('cache.hit', attrs);
      case 'cache:miss': this.addSpanEvent('cache.miss', attrs);
      case 'error': this.recordException(event.data);
      // ... handle all 23+ event types
    }
  }

  convertTimingToSpan(timing: TimingEntry): Span;
}
```

### 3.2 Create Context Manager

**New file**: `framework/telemetry/otel_context.ts`

Manages OTel context propagation:
- `extractFromHeaders(headers)` - Extract trace context from incoming request
- `injectIntoHeaders(headers)` - Inject trace context for outgoing requests
- `setRequestContext(requestId, ctx)` - Store context per request
- `getRequestContext(requestId)` - Retrieve context for request
- `withSpan(span, fn)` - Run function with span as active

### 3.3 Integrate Bridge with Application

**Modify**: `framework/app.ts`

In constructor, register bridge as debugger listener:
```typescript
if (isOTELEnabled()) {
  const bridge = new DebuggerOTelBridge(trace.getTracer('echelon'));
  this.debugger.addListener((event) => bridge.handleEvent(event));
}
```

---

## Phase 4: Custom Instrumentation for Framework Layers

### 4.1 ORM/KV Instrumentation

**Modify**: `framework/orm/kv.ts`

Add spans for database operations:
```typescript
async get<T>(key: Deno.KvKey): Promise<T | null> {
  return withDbSpan('kv.get', key, async (span) => {
    const result = await this.kv.get<T>(key);
    span.setAttribute('db.result.found', result.value !== null);
    return result.value;
  });
}
```

### 4.2 Auth Instrumentation

**Modify**: `framework/auth/auth.ts`

Add spans for auth operations:
- `auth.authenticate` - Full authentication flow
- `auth.checkRole` - Role verification
- `auth.checkPermission` - Permission verification
- Attributes: `auth.success`, `auth.user_id`, `auth.roles`

### 4.3 Cache Instrumentation

**Modify**: `framework/cache/cache.ts`

Add spans (in addition to existing debugger events):
- `cache.get` with `cache.hit` attribute
- `cache.set` with `cache.ttl` attribute
- Attributes: `cache.key`, `cache.source` (memory/kv)

### 4.4 Jobs Instrumentation

**Modify**: `framework/jobs/queue.ts` and `framework/jobs/worker.ts`

Add spans for job lifecycle:
- `job.enqueue` (producer span)
- `job.process` (consumer span)
- `job.complete` or `job.fail`
- Span links between enqueue and process spans
- Attributes: `job.name`, `job.id`, `job.attempt`

---

## File Changes Summary

### New Files to Create

| File | Purpose |
|------|---------|
| `framework/telemetry/otel.ts` | Core OTEL utilities and re-exports |
| `framework/telemetry/otel_metrics.ts` | OTel Meter-based metrics |
| `framework/telemetry/otel_context.ts` | Context propagation manager |
| `framework/debugger/otel_bridge.ts` | Debugger event to span converter |

### Files to Modify

| File | Changes |
|------|---------|
| `deno.json` | Add OTEL tasks, @opentelemetry/api import |
| `framework/app.ts` | Initialize OTEL, set route attributes, use OTel metrics |
| `framework/telemetry/mod.ts` | Export new OTEL modules |
| `framework/telemetry/logger.ts` | Add trace context to logs |
| `framework/debugger/mod.ts` | Export OTel bridge |
| `framework/orm/kv.ts` | Add database spans |
| `framework/auth/auth.ts` | Add auth spans |
| `framework/cache/cache.ts` | Add cache spans |
| `framework/jobs/queue.ts` | Add job spans |
| `framework/jobs/worker.ts` | Add worker spans |

---

## Implementation Order

1. **Phase 1.1**: Update deno.json with OTEL tasks and import
2. **Phase 1.2**: Create `framework/telemetry/otel.ts` utilities
3. **Phase 1.3**: Modify `framework/app.ts` to set route attributes
4. **Phase 1.4**: Update `framework/telemetry/logger.ts` with trace context
5. **Phase 1.5**: Update `framework/telemetry/mod.ts` exports
6. **Phase 2.1**: Create `framework/telemetry/otel_metrics.ts`
7. **Phase 2.2**: Update `framework/app.ts` to use OTel metrics
8. **Phase 3.1**: Create `framework/telemetry/otel_context.ts`
9. **Phase 3.2**: Create `framework/debugger/otel_bridge.ts`
10. **Phase 3.3**: Update `framework/debugger/mod.ts` exports
11. **Phase 3.4**: Integrate bridge in `framework/app.ts`
12. **Phase 4.1**: Instrument `framework/orm/kv.ts`
13. **Phase 4.2**: Instrument `framework/auth/auth.ts`
14. **Phase 4.3**: Instrument `framework/cache/cache.ts`
15. **Phase 4.4**: Instrument `framework/jobs/queue.ts` and `worker.ts`

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OTEL_DENO` | `false` | Enable Deno's built-in OTEL |
| `OTEL_SERVICE_NAME` | `echelon` | Service name for traces |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `localhost:4318` | OTLP collector endpoint |
| `OTEL_EXPORTER_OTLP_HEADERS` | - | Auth headers |
| `OTEL_DENO_CONSOLE` | `capture` | Console log capture mode |
| `OTEL_METRIC_EXPORT_INTERVAL` | `60000` | Metric export interval (ms) |

---

## Testing Strategy

1. Run local LGTM stack (Grafana/Tempo/Prometheus/Loki) in Docker
2. Enable OTEL with `deno task dev:otel`
3. Verify traces appear in Tempo
4. Verify metrics appear in Prometheus
5. Verify logs appear in Loki with trace correlation
6. Test context propagation across async boundaries
