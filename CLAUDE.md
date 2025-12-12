# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Echelon is a full-stack web application framework built entirely on Deno's native capabilities. It abstracts the web stack (servers, databases, authentication, rendering) into an 18-layer architecture, similar to how operating systems abstract hardware. WASM execution and generation are integrated as core features.

## Development Commands

```bash
# Development with hot reload
deno task dev

# Production start (minimal permissions)
deno task start

# Run all tests
deno task test

# Run a single test file
deno test --allow-all tests/framework/router_test.ts

# Type check
deno task check

# Lint and format
deno task lint
deno task fmt
```

## Architecture

### Layer-to-Directory Mapping

| Layer | Name | Directory | Key Files |
|-------|------|-----------|-----------|
| 0 | Runtime | `framework/runtime/` | runtime.ts, lifecycle.ts, permissions.ts, wasm_*.ts |
| 1 | HTTP/Server | `framework/http/` | server.ts, request.ts, response.ts, types.ts |
| 2 | Middleware | `framework/middleware/` | pipeline.ts, cors.ts, csrf.ts, ratelimit.ts, wasm.ts |
| 3 | Router | `framework/router/` | router.ts, patterns.ts, group.ts |
| 4 | Controller | `framework/controller/` | base.ts, resource.ts |
| 5 | ORM/Data | `framework/orm/` | model.ts, kv.ts, query.ts, validators.ts |
| 6 | Auth | `framework/auth/` | auth.ts, session.ts, rbac.ts, password.ts |
| 7 | Cache | `framework/cache/` | cache.ts, middleware.ts |
| 8 | View/Template | `framework/view/` | template.ts, html.ts |
| 9 | Jobs | `framework/jobs/` | queue.ts, scheduler.ts, worker.ts |
| 10 | Search | `framework/search/` | search.ts, index.ts |
| 11 | Admin | `framework/admin/` | admin.ts, health.ts |
| 12 | Plugin | `framework/plugin/` | plugin.ts, events.ts, wasm_generator.ts, wasm_compiler.ts |
| 13 | API | `framework/api/` | router.ts, response.ts, serializer.ts |
| 14 | Config | `framework/config/` | config.ts, features.ts |
| 15 | Debugger | `framework/debugger/` | debugger.ts, levels.ts, output.ts, breakpoint.ts, report.ts |
| 17 | Security | `framework/security/` | headers.ts, sanitize.ts |
| 18 | Telemetry | `framework/telemetry/` | metrics.ts, tracing.ts, logger.ts |

### Application Orchestration

The `Application` class (`framework/app.ts`) orchestrates all layers. Request lifecycle:

1. Request received by HTTP server (`Deno.serve()`)
2. Context created with request, URL, params, state
3. Route matched via URLPattern
4. Middleware pipeline executes (onion model - each wraps the next)
5. Route handler executes
6. Response returns through middleware in reverse order
7. Metrics recorded automatically

### Handler Types

Two handler signatures exist:
- **RouteHandler** (context-based): `(ctx: Context) => Response` - Used by Application methods
- **Handler** (legacy): `(req: EchelonRequest, res: EchelonResponse) => Response` - Used by Router directly

The Application wraps RouteHandler into Handler via `wrapHandler()`.

### WASM Integration (CRITICAL/REQUIRED)

WASM is a **foundational feature** of Echelon, providing near-native performance and secure sandboxing. The WASM subsystem is managed by the `Application` class and integrated at Layer 0 (Runtime).

**Key Components:**
- `WASMRuntimeCore` (`framework/runtime/wasm_runtime.ts`) - Orchestrates module loading, execution, sandboxing
- `WASMModuleLoader` (`framework/runtime/wasm_module_loader.ts`) - Multi-source loading with streaming compilation
- `WASMExecutor` (`framework/runtime/wasm_executor.ts`) - Execution engine with timeout handling
- `WASMMemoryManager` (`framework/runtime/wasm_memory.ts`) - Memory tracking and limits
- `WASMSandboxManager` (`framework/runtime/wasm_sandbox.ts`) - Capability-based sandboxing
- `WASMGeneratorCore` (`framework/plugin/wasm_generator.ts`) - Code generation from TypeScript/Rust
- `WASMCodegen` (`framework/plugin/wasm_codegen.ts`) - Binary format generation

**Configuration:**
```typescript
const app = new Application({
  enableWasm: true,  // Default: true
  wasm: {
    globalMemoryLimit: 256 * 1024 * 1024,      // 256MB global
    defaultModuleMemoryLimit: 16 * 1024 * 1024, // 16MB per module
    defaultTimeout: 5000,                       // 5 seconds
    maxConcurrentExecutions: 100,
    enableSandboxing: true,
    enableMetrics: true,
    preferStreamingCompilation: true,  // Deno 2.1+ (40% faster)
    enableNativeImports: false,        // Use native dynamic imports
  }
});
```

**Core Capabilities:**
1. **Module Loading** - File, URL, bytes, base64, native import sources
2. **Streaming Compilation** - Compile while downloading (Deno 2.1+)
3. **Sandboxing** - Capability-based security with 17 capability types
4. **Memory Management** - Global and per-module limits with tracking
5. **Code Generation** - TypeScript/AssemblyScript and Rust toolchains
6. **WASI Support** - WebAssembly System Interface (designed, not yet implemented)
7. **Metrics & Telemetry** - Automatic instrumentation for all WASM operations

**Documentation:**
- Architecture: `docs/planning/WASMIntegrationAsACoreFeature.md` (2,344 lines)
- Runtime Layer: `docs/planning/RuntimeLayer.md` (Section 0.4.1, 0.9)
- Type Definitions: `framework/runtime/wasm_types.ts` (623 lines)

### WASM Usage Examples

**Basic Module Loading and Execution:**
```typescript
// Load WASM module from file
const module = await app.wasm.loadModule({
  type: 'file',
  value: './computation.wasm',
  moduleId: 'my-module'
});

// Instantiate with default sandbox
await app.wasm.instantiate(module.id);

// Execute exported function
const result = await app.wasm.execute<number>(
  module.id,
  'calculateSum',
  [10, 20]
);

console.log(result.value); // 30
console.log(`Execution time: ${result.duration}ms`);
console.log(`Memory used: ${result.memoryUsed} bytes`);
```

**Sandboxed Plugin Execution:**
```typescript
// Create strict sandbox for untrusted code
const sandbox = app.wasm.createSandbox({
  memoryLimit: 10 * 1024 * 1024,  // 10MB
  timeLimit: 3000,                 // 3 seconds
  capabilities: ['memory', 'console'],
  allowedHostFunctions: ['env.log']
});

// Load user-provided plugin
const plugin = await app.wasm.loadModule({
  type: 'bytes',
  value: userUploadedBytes,
  moduleId: `plugin-${crypto.randomUUID()}`
});

// Instantiate in sandbox
await app.wasm.instantiate(plugin.id, {
  sandboxId: sandbox.id,
  imports: {
    env: {
      log: (ptr: number, len: number) => {
        const memory = plugin.memory!;
        const bytes = new Uint8Array(memory.buffer, ptr, len);
        const text = new TextDecoder().decode(bytes);
        console.log(`[Plugin ${plugin.id}] ${text}`);
      }
    }
  }
});

// Execute plugin function
const result = await app.wasm.execute(plugin.id, 'process', [inputData]);
```

**Code Generation (TypeScript):**
```typescript
// Generate WASM from TypeScript/AssemblyScript
const tsCode = `
  export function fibonacci(n: i32): i32 {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
  }
`;

const result = await app.wasm.generator.compile({
  type: 'typescript',
  code: tsCode,
  options: {
    optimize: true,
    optimizationLevel: 'speed'
  }
});

if (result.success) {
  // Load generated WASM
  const module = await app.wasm.loadModule({
    type: 'bytes',
    value: result.wasm!,
    moduleId: 'fibonacci'
  });
}
```

**Code Generation (Rust):**
```typescript
// Generate WASM from Rust
const rustCode = `
  #[no_mangle]
  pub extern "C" fn add(a: i32, b: i32) -> i32 {
    a + b
  }
`;

const result = await app.wasm.generator.compile({
  type: 'rust',
  code: rustCode,
  options: {
    optimize: true,
    optimizationLevel: 'size'
  }
});
```

**Route Handler with WASM:**
```typescript
app.get('/compute/:n', async (ctx) => {
  const n = parseInt(ctx.params.n || '10');

  // Execute WASM computation
  const result = await app.wasm.execute<number>(
    'fibonacci',
    'fibonacci',
    [n]
  );

  if (!result.success) {
    return ctx.json({ error: result.error?.message }, 500);
  }

  return ctx.json({
    input: n,
    result: result.value,
    executionTime: result.duration,
    memoryUsed: result.memoryUsed
  });
});
```

**WASM Metrics and Monitoring:**
```typescript
// Get runtime statistics
const stats = app.wasm.getStats();

console.log(`Modules loaded: ${stats.modulesLoaded}`);
console.log(`Total executions: ${stats.totalExecutions}`);
console.log(`Memory allocated: ${stats.memoryAllocated} bytes`);
console.log(`Memory used: ${stats.memoryUsed} bytes`);
console.log(`Active sandboxes: ${stats.activeSandboxes}`);

// Access per-module statistics
for (const [moduleId, moduleStats] of stats.moduleStats) {
  console.log(`Module ${moduleId}:`);
  console.log(`  Executions: ${moduleStats.executionCount}`);
  console.log(`  Avg duration: ${moduleStats.avgExecutionTime}ms`);
  console.log(`  Memory peak: ${moduleStats.peakMemoryUsage} bytes`);
}
```

### Debugger System

Comprehensive debugging at `framework/debugger/`:
- Per-module debug levels (HTTP, Router, Middleware, ORM, etc.)
- Rich colored console output with icons
- Conditional breakpoints
- Request lifecycle reports with timing

### Cross-Cutting Concerns

Every route includes:

- **Telemetry**: Automatic metrics, tracing, and logging
- **RBAC**: Role-based access control at every level
- **Debugging**: Request tracking with per-module levels

### Core Design Principles

1. Zero/minimal external dependencies - leverage Deno built-ins
2. TypeScript-first with full type safety
3. Secure by default - inherit Deno's permission system
4. Web standards compliant - use native Web APIs
5. Observable by default - telemetry on every route

## Key Deno APIs Used

- `Deno.serve()` - HTTP server
- `Deno.openKv()` - Key-value database with ACID transactions (unstable)
- `Deno.cron()` - Scheduled jobs (unstable, Deno Deploy)
- `WebAssembly` - WASM execution
- Web Crypto API for security operations
- Web Streams API for data handling
- `URLPattern` - Route matching

## Import Aliases

```text
@/        → ./src/           (application code)
@echelon/ → ./framework/     (framework code)
std/      → deno.land/std    (standard library)
```

## Testing

Tests are in `tests/framework/` and use Deno's native test framework with `jsr:@std/assert`. Run individual test files with `deno test --allow-all <path>`.

**WASM Testing:**
```typescript
// Test WASM module loading
Deno.test("WASM: Load module from file", async () => {
  const module = await app.wasm.loadModule({
    type: 'file',
    value: './test_module.wasm',
    moduleId: 'test-module'
  });

  assertEquals(module.info.source, 'file');
  assert(module.compiledModule instanceof WebAssembly.Module);
});

// Test sandboxed execution
Deno.test("WASM: Sandbox memory limit enforcement", async () => {
  const sandbox = app.wasm.createSandbox({
    memoryLimit: 1024 * 1024,  // 1MB
    capabilities: ['memory']
  });

  const module = await app.wasm.loadModule({
    type: 'bytes',
    value: memoryHeavyWasmBytes,
    moduleId: 'memory-test'
  });

  await app.wasm.instantiate(module.id, { sandboxId: sandbox.id });

  // Should throw on memory limit violation
  await assertRejects(
    () => app.wasm.execute(module.id, 'allocateHuge', []),
    Error,
    'Memory limit exceeded'
  );
});

// Test code generation
Deno.test("WASM: Generate from TypeScript", async () => {
  const result = await app.wasm.generator.compile({
    type: 'typescript',
    code: 'export function add(a: i32, b: i32): i32 { return a + b; }'
  });

  assert(result.success);
  assert(result.wasm instanceof Uint8Array);
});
```

## Implementation Notes

- If something is called but missing, it should be implemented, not removed
- Commands must be provided explicitly (not running on production server)
- If there are unused variables, methods, or imports, always use them appropriately as intended
- this is a fucking deno app