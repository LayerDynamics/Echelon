# OpenTelemetry Tests

Comprehensive test suite for the OpenTelemetry integration in the Echelon framework.

## Test Structure

```
tests/
├── framework/                    # Unit tests
│   ├── otel_test.ts             # Core OTEL utilities
│   ├── otel_metrics_test.ts     # OTEL Meter API
│   ├── otel_context_test.ts     # Context propagation
│   ├── otel_bridge_test.ts      # Debugger bridge
│   └── run_otel_tests.sh        # Test runner script
├── integration/                  # Integration tests
│   └── otel_integration_test.ts # End-to-end tests
└── OTEL_TESTS.md                # This file
```

## Running Tests

### Run All OTEL Tests

```bash
# Using the test runner script
./tests/framework/run_otel_tests.sh

# Or manually with deno
deno task test
```

### Run Individual Test Files

```bash
# Unit tests
deno test --allow-all tests/framework/otel_test.ts
deno test --allow-all tests/framework/otel_metrics_test.ts
deno test --allow-all tests/framework/otel_context_test.ts
deno test --allow-all tests/framework/otel_bridge_test.ts

# Integration tests
deno test --allow-all tests/integration/otel_integration_test.ts
```

### Run Specific Test

```bash
# Run a specific test by name
deno test --allow-all --filter "isOTELEnabled" tests/framework/otel_test.ts
```

### Run with OTEL Enabled

```bash
# Enable OTEL during testing
OTEL_DENO=true deno test --allow-all tests/framework/otel_test.ts
```

## Test Coverage

### Unit Tests

#### otel_test.ts (Core Utilities)
- ✅ Environment detection (`isOTELEnabled`, `getOTELConfig`)
- ✅ Span manipulation (set attributes, record exceptions, add events)
- ✅ Span execution wrappers (`withSpan`, `withDbSpan`, `withHttpClientSpan`)
- ✅ Error propagation
- ✅ Tracer and Meter access
- ✅ OTEL disabled behavior (no-ops)

**Test Count: 20+ tests**

#### otel_metrics_test.ts (Metrics)
- ✅ Metrics initialization
- ✅ HTTP metrics (requests, active connections, body size)
- ✅ Cache metrics (hit, miss, operations)
- ✅ Database metrics (operations, connections)
- ✅ Job metrics (processed, failed, queued)
- ✅ Auth metrics (attempts, failures)
- ✅ Middleware metrics
- ✅ Factory functions (singleton, create)
- ✅ OTEL disabled behavior

**Test Count: 25+ tests**

#### otel_context_test.ts (Context Propagation)
- ✅ Context extraction from headers (W3C traceparent)
- ✅ Context injection into headers
- ✅ Request context management (set, get, clear)
- ✅ Request span management
- ✅ Context-aware execution (`runWithContext`, `runWithSpan`)
- ✅ Child span creation and execution
- ✅ HTTP server span lifecycle
- ✅ Trace utilities (trace ID, span ID, sampling)
- ✅ Span links
- ✅ OTEL disabled behavior

**Test Count: 20+ tests**

#### otel_bridge_test.ts (Debugger Bridge)
- ✅ Bridge creation and configuration
- ✅ Middleware event handling (enter/exit)
- ✅ Controller event handling (enter/exit)
- ✅ Cache event handling (hit/miss)
- ✅ Auth event handling (success/failure)
- ✅ Error event handling
- ✅ Configuration options (minLevel, ignoreEvents, createChildSpans)
- ✅ Span cleanup
- ✅ Statistics tracking
- ✅ Factory functions
- ✅ Integration with Debugger
- ✅ Full event lifecycle

**Test Count: 20+ tests**

### Integration Tests

#### otel_integration_test.ts (End-to-End)
- ✅ Application initialization with OTEL
- ✅ HTTP request with spans
- ✅ KV operations with spans
- ✅ Cache operations with spans
- ✅ Auth operations with spans
- ✅ Job queue with spans
- ✅ Debugger bridge events
- ✅ Full request lifecycle (HTTP → Cache → DB → Response)
- ✅ Error handling with spans
- ✅ Context propagation across async boundaries
- ✅ Metrics collection across components

**Test Count: 10+ tests**

## Total Test Coverage

- **Unit Tests**: 85+ tests
- **Integration Tests**: 10+ tests
- **Total**: 95+ tests

## Test Patterns

### Testing with OTEL Enabled

```typescript
Deno.test('Test name', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.set('OTEL_DENO', 'true');

  // Test code here

  // Restore original value
  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  } else {
    Deno.env.delete('OTEL_DENO');
  }
});
```

### Testing with OTEL Disabled

```typescript
Deno.test('Test name', () => {
  const originalValue = Deno.env.get('OTEL_DENO');
  Deno.env.delete('OTEL_DENO');

  // Test code here - should not throw

  // Restore
  if (originalValue) {
    Deno.env.set('OTEL_DENO', originalValue);
  }
});
```

### Testing Async Operations

```typescript
Deno.test('Test name', async () => {
  const cleanup = setupOTEL(); // Helper function

  try {
    // Async test code
    await someAsyncOperation();
  } finally {
    cleanup();
  }
});
```

## Key Test Scenarios

### 1. Progressive Enhancement
Tests verify that all OTEL functionality:
- Works correctly when `OTEL_DENO=true`
- Gracefully degrades when `OTEL_DENO` is not set
- Does not throw errors in either mode

### 2. Span Lifecycle
Tests verify proper span management:
- Span creation with correct attributes
- Parent-child span relationships
- Span ending with status codes
- Error recording on spans

### 3. Context Propagation
Tests verify trace context flows correctly:
- W3C traceparent header extraction/injection
- Request-scoped context storage
- Async boundary preservation
- Child span creation from parent context

### 4. Metrics Collection
Tests verify metrics are recorded for:
- HTTP requests (method, route, status, duration)
- Cache operations (hits, misses, source)
- Database operations (operation type, table, duration)
- Job processing (name, status, retries)
- Authentication (method, success/failure)
- Middleware execution (name, duration)

### 5. Bridge Integration
Tests verify debugger events convert to spans:
- Middleware enter/exit → child spans
- Controller enter/exit → child spans
- Cache hit/miss → span events
- Auth success/failure → span events
- Errors → exception recording

### 6. End-to-End Flows
Integration tests verify complete request flows:
```
HTTP Request
  → Server Span Created
  → Route Attribute Set
  → Middleware Spans
  → Controller Span
    → Cache Check (miss)
    → Database Query
    → Cache Set
  → Metrics Recorded
  → Span Ended
```

## Common Assertions

```typescript
// Existence
assertExists(span);
assertExists(context);

// Type checks
assertEquals(typeof traceId, 'string');
assertEquals(typeof metrics.isInitialized(), 'boolean');

// Values
assertEquals(isOTELEnabled(), true);
assertEquals(span.name, 'test.operation');

// No-ops don't throw
setRouteAttribute('/test', 'GET'); // Should not throw
```

## Debugging Tests

### Enable Verbose Output

```bash
deno test --allow-all --trace-ops tests/framework/otel_test.ts
```

### Run with Coverage

```bash
deno test --allow-all --coverage=cov tests/framework/
deno coverage cov
```

### Watch Mode

```bash
deno test --allow-all --watch tests/framework/otel_test.ts
```

## Test Maintenance

### Adding New Tests

1. Follow existing test patterns
2. Clean up resources in `finally` blocks
3. Restore environment variables
4. Use descriptive test names
5. Test both OTEL enabled and disabled modes

### Test Categories

- **Unit Tests**: Test individual functions/classes in isolation
- **Integration Tests**: Test multiple components working together
- **End-to-End Tests**: Test complete request flows

## CI/CD Integration

These tests are designed to run in CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run OTEL Tests
  run: |
    deno test --allow-all tests/framework/otel_test.ts
    deno test --allow-all tests/framework/otel_metrics_test.ts
    deno test --allow-all tests/framework/otel_context_test.ts
    deno test --allow-all tests/framework/otel_bridge_test.ts
    deno test --allow-all tests/integration/otel_integration_test.ts
```

## Performance Considerations

- Tests use `sanitizeResources: false` and `sanitizeOps: false` where necessary
- Cleanup functions ensure no resource leaks
- Tests are designed to run quickly (< 5 seconds each)

## Future Enhancements

- [ ] Add performance benchmarks
- [ ] Add snapshot testing for span structure
- [ ] Add tests for OTLP export
- [ ] Add tests with real OTEL backend (Jaeger, Tempo)
- [ ] Add load testing for concurrent requests
- [ ] Add tests for custom instrumentation
