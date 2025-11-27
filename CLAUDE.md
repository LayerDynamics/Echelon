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

### WASM Integration

WASM runtime and generation are core features managed by `Application`:
- `WASMRuntimeCore` (`framework/runtime/wasm_runtime.ts`) - Module loading, execution, sandboxing
- `WASMGeneratorCore` (`framework/plugin/wasm_generator.ts`) - Code generation from TypeScript/Rust
- Enabled by default; disable with `enableWasm: false` in ApplicationOptions

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

## Implementation Notes

- If something is called but missing, it should be implemented, not removed
- Commands must be provided explicitly (not running on production server)
- If there are unused variables, methods, or imports, always use them appropriately as intended
