# Echelon

## Enhanced Architecture Outline v2

### With Comprehensive Runtime, Telemetry, RBAC, and Admin Methods

---

## Executive Summary

**Echelon** is a full-stack web application framework built entirely on Deno's native capabilities, minimizing external dependencies. Like traditional operating systems abstract hardware, Echelon abstracts the web stack—servers, databases, authentication, rendering—into reusable, type-safe components leveraging Deno's secure-by-default runtime.

### Core Design Principles

1. **Zero/Minimal External Dependencies** - Leverage Deno's built-in features
2. **TypeScript-First** - Full type safety throughout the entire stack
3. **Secure by Default** - Inherit Deno's permission system at the framework level
4. **Web Standards Compliant** - Use native Web APIs
5. **Convention over Configuration** - Sensible defaults with escape hatches
6. **Modular Architecture** - Each layer is independently usable and testable
7. **Observable by Default** - Every route includes telemetry, metrics, and tracing
8. **RBAC-First** - Role-based access control integrated at every level
9. **Admin-Ready** - Built-in administrative capabilities on every route

---

## Layer Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CROSS-CUTTING CONCERNS                                │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │   TELEMETRY      │  │      RBAC        │  │  ADMIN METHODS   │          │
│  │  (Every Route)   │  │  (Every Route)   │  │  (Every Route)   │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
├─────────────────────────────────────────────────────────────────────────────┤
│                      Layer 18: Telemetry/Observability Layer                 │
│           (Tracing, Metrics, Logging, APM - Cross-Cutting)                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                         Layer 17: Security Layer                             │
│                   (Defense in Depth - Cross-Cutting)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                              ... Layers 3-16 ...                             │
│                    (Routing, Controllers, ORM, Auth, etc.)                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                         Layer 2: Middleware Layer                            │
│                 (Pipeline, CORS, CSRF, Logging, Compression)                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                       Layer 1: HTTP/Server Layer                             │
│                   (Deno.serve, Request/Response Abstractions)                │
├─────────────────────────────────────────────────────────────────────────────┤
│    ╔═══════════════════════════════════════════════════════════════════╗    │
│    ║           LAYER 0: RUNTIME & EXECUTION ENVIRONMENT                ║    │
│    ║         (Deno Runtime, V8 Engine, Event Loop, Permissions)        ║    │
│    ╚═══════════════════════════════════════════════════════════════════╝    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# LAYER 0: RUNTIME & EXECUTION ENVIRONMENT

## Purpose

Layer 0 is the **foundational runtime** upon which the entire Echelon stack is built. It represents the actual compute environment—the bridge between the operating system's network stack and our application code. Unlike traditional frameworks that rely on external application servers (Gunicorn, Puma, PHP-FPM), Echelon uses Deno's **built-in runtime** which includes the HTTP server, making Layer 0 more tightly integrated.

This layer defines:

- **What executes our code** (Deno/V8, WebAssembly)
- **How code is loaded and run** (ES Modules, TypeScript compilation, WASM modules)
- **Memory and resource management** (V8 GC, isolates, WASM linear memory)
- **Concurrency model** (Event loop, async/await)
- **Security boundaries** (Permission system, WASM sandboxing)
- **Process lifecycle** (Startup, shutdown, signals)

---

## 0.1 Language Runtime: Deno + V8

### Runtime Stack

```
┌─────────────────────────────────────────────────────────┐
│                    Echelon Application                   │
├─────────────────────────────────────────────────────────┤
│                     Deno Runtime                         │
│  ┌─────────────────┐  ┌─────────────────────────────┐   │
│  │   TypeScript    │  │      Deno APIs              │   │
│  │   Compiler      │  │  (Deno.serve, Deno.openKv,  │   │
│  │   (swc)         │  │   Deno.env, Deno.cron...)   │   │
│  └─────────────────┘  └─────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│                     Rust Core (Tokio)                    │
│  ┌─────────────────┐  ┌─────────────────────────────┐   │
│  │   Event Loop    │  │      I/O Operations         │   │
│  │   (async)       │  │   (Network, File, etc.)     │   │
│  └─────────────────┘  └─────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│                    V8 JavaScript Engine                  │
│  ┌─────────────────┐  ┌─────────────────────────────┐   │
│  │   JIT Compiler  │  │    Garbage Collector        │   │
│  │   (TurboFan)    │  │    (Orinoco)                │   │
│  └─────────────────┘  └─────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│                   Operating System                       │
│           (Linux, macOS, Windows, Docker)                │
└─────────────────────────────────────────────────────────┘
```

### 0.1.1 V8 JavaScript Engine

```
Echelon.Runtime.V8
├── JavaScript Execution
│   ├── JIT Compilation (TurboFan)
│   │   └── Hot code optimization
│   ├── Interpreter (Ignition)
│   │   └── Initial bytecode execution
│   └── Inline Caching
│       └── Property access optimization
│
├── Memory Management
│   ├── Heap Allocation
│   │   ├── Young Generation (Scavenger GC)
│   │   ├── Old Generation (Mark-Sweep-Compact)
│   │   └── Large Object Space
│   ├── Garbage Collection (Orinoco)
│   │   ├── Incremental marking
│   │   ├── Concurrent sweeping
│   │   ├── Parallel compaction
│   │   └── Idle-time GC
│   └── Memory Limits
│       ├── Default: ~1.4GB (64-bit)
│       ├── Configurable via --v8-flags
│       └── Per-isolate limits
│
├── Isolates
│   ├── Isolated execution contexts
│   ├── Separate heap per isolate
│   └── Used for: Workers, Deno Deploy edge
│
├── WebAssembly Support
│   ├── Native WASM execution (TurboFan backend)
│   ├── Streaming compilation for large modules
│   ├── Memory: Linear memory model (separate from JS heap)
│   ├── Performance: Near-native execution speed
│   └── See: WASMIntegrationAsACoreFeature.md for details
│
└── Performance Characteristics
    ├── Startup time: ~50-100ms
    ├── JIT warm-up: First few requests slower
    ├── Memory baseline: ~30-50MB
    └── Optimized for: Long-running servers
```

### 0.1.2 TypeScript Compilation

```
Echelon.Runtime.TypeScript
├── Compilation Pipeline
│   ├── Source: .ts, .tsx, .mts files
│   ├── Type Checking: TypeScript compiler (tsc)
│   ├── Transpilation: SWC (Rust-based, fast)
│   └── Output: JavaScript (cached)
│
├── Compilation Cache
│   ├── Location: DENO_DIR (~/.cache/deno)
│   ├── Key: Source file hash + compiler options
│   ├── Invalidation: Source change, Deno upgrade
│   └── Sharing: Per-user, not per-project
│
├── Type System Integration
│   ├── Strict mode by default
│   ├── No implicit any
│   ├── Strict null checks
│   └── Full inference
│
└── Configuration (deno.json)
    └── {
          "compilerOptions": {
            "strict": true,
            "lib": ["deno.window", "deno.unstable"],
            "jsx": "react-jsx",
            "jsxImportSource": "preact"
          }
        }
```

### 0.1.3 Module System

```
Echelon.Runtime.Modules
├── ES Modules (Native)
│   ├── import/export syntax
│   ├── Top-level await
│   ├── Dynamic import()
│   └── No CommonJS (require)
│
├── Module Resolution
│   ├── URL-based imports
│   │   └── import { serve } from "https://deno.land/std/http/server.ts"
│   ├── Import Maps (deno.json)
│   │   └── {
│   │         "imports": {
│   │           "@/": "./src/",
│   │           "std/": "https://deno.land/std@0.220.0/"
│   │         }
│   │       }
│   ├── npm: specifier
│   │   └── import express from "npm:express@4"
│   └── jsr: specifier (Deno's registry)
│       └── import { Hono } from "jsr:@hono/hono"
│
├── Module Loading
│   ├── Remote modules: Downloaded once, cached
│   ├── Lock file: deno.lock (integrity verification)
│   ├── Vendoring: deno vendor (offline support)
│   ├── Permissions: Checked at load time
│   └── WASM modules: Dynamic import of .wasm files (Deno 2.1+)
│
├── Module Graph
│   ├── Static analysis of imports
│   ├── Tree-shaking (via bundler)
│   └── Circular dependency handling
│
└── WebAssembly Module Support
    ├── Native import: import wasm from "./module.wasm"
    ├── Streaming compilation for URL sources
    ├── Multiple source types: file, url, bytes, base64
    └── See: framework/runtime/wasm_module_loader.ts
```

---

## 0.2 Concurrency Model: Event Loop & Async

### 0.2.1 Event Loop Architecture

```
Echelon.Runtime.EventLoop
├── Tokio Runtime (Rust)
│   ├── Multi-threaded async executor
│   ├── Work-stealing scheduler
│   └── Efficient I/O polling (epoll/kqueue/IOCP)
│
├── Event Loop Phases
│   │
│   │  ┌─────────────────────────────────────┐
│   │  │        Poll Phase                   │
│   │  │  (I/O events, network, timers)      │
│   │  └─────────────────────────────────────┘
│   │                    │
│   │                    ▼
│   │  ┌─────────────────────────────────────┐
│   │  │        Check Phase                  │
│   │  │  (setImmediate, queueMicrotask)     │
│   │  └─────────────────────────────────────┘
│   │                    │
│   │                    ▼
│   │  ┌─────────────────────────────────────┐
│   │  │        Close Callbacks              │
│   │  │  (cleanup, connection close)        │
│   │  └─────────────────────────────────────┘
│   │                    │
│   │                    ▼
│   │  ┌─────────────────────────────────────┐
│   │  │        Timers Phase                 │
│   │  │  (setTimeout, setInterval)          │
│   │  └─────────────────────────────────────┘
│   │                    │
│   │                    ▼
│   │  ┌─────────────────────────────────────┐
│   │  │        Microtasks                   │
│   │  │  (Promise callbacks, async/await)   │
│   │  └─────────────────────────────────────┘
│   │                    │
│   └────────────────────┘ (loop)
│
├── Task Scheduling
│   ├── Macrotasks: setTimeout, setInterval, I/O
│   ├── Microtasks: Promise.then, queueMicrotask
│   └── Priority: Microtasks always before next macrotask
│
└── Non-Blocking Guarantees
    ├── All I/O is async by default
    ├── No synchronous file reads in hot paths
    └── Worker threads for CPU-intensive tasks
```

### 0.2.2 Async Primitives

```
Echelon.Runtime.Async
├── Promises (Native)
│   ├── Promise.all() - Parallel execution
│   ├── Promise.race() - First to complete
│   ├── Promise.allSettled() - All results
│   └── Promise.any() - First success
│
├── Async/Await
│   ├── async functions return Promise
│   ├── await pauses until Promise resolves
│   ├── Top-level await in modules
│   └── Error handling with try/catch
│
├── Async Iterators
│   ├── for await...of loops
│   ├── AsyncIterable protocol
│   └── Used by: Streams, DB cursors, file reading
│
├── Streams (Web Streams API)
│   ├── ReadableStream
│   │   └── Request body, file reading
│   ├── WritableStream
│   │   └── Response body, file writing
│   ├── TransformStream
│   │   └── Compression, encryption
│   └── Piping: readable.pipeTo(writable)
│
└── AbortController / AbortSignal
    ├── Cancellation mechanism
    ├── Timeout handling
    └── Used by: fetch, Deno.serve, etc.
```

### 0.2.3 Web Workers

```
Echelon.Runtime.Workers
├── Worker Types
│   ├── Web Workers (new Worker())
│   │   └── Separate V8 isolate
│   │   └── Message passing via postMessage
│   └── Deno.Worker (enhanced)
│       └── Deno API access (with permissions)
│
├── Worker Communication
│   ├── Structured Clone Algorithm
│   │   └── Deep copy of data
│   ├── Transferable Objects
│   │   └── ArrayBuffer, MessagePort (zero-copy)
│   └── SharedArrayBuffer
│       └── Shared memory (with Atomics)
│
├── Worker Pool Pattern
│   └── class WorkerPool {
│         workers: Worker[]
│         queue: Task[]
│         execute(task): Promise<Result>
│       }
│
└── Use Cases in Echelon
    ├── CPU-intensive: Image processing, crypto
    ├── Isolation: Untrusted code execution (including WASM)
    ├── Parallelism: Batch processing
    └── WASM Execution: High-performance plugins in isolated workers
```

---

## 0.3 Permission System: Security Boundaries

### 0.3.1 Permission Architecture

```
Echelon.Runtime.Permissions
├── Permission Types
│   ├── --allow-read[=<paths>]
│   │   └── File system read access
│   ├── --allow-write[=<paths>]
│   │   └── File system write access
│   ├── --allow-net[=<hosts>]
│   │   └── Network access (specific hosts/ports)
│   ├── --allow-env[=<vars>]
│   │   └── Environment variable access
│   ├── --allow-run[=<programs>]
│   │   └── Subprocess execution
│   ├── --allow-ffi
│   │   └── Foreign function interface
│   ├── --allow-hrtime
│   │   └── High-resolution time
│   └── --allow-all (-A)
│       └── All permissions (development only!)
│
├── Permission Granularity
│   ├── Global: --allow-net
│   ├── Scoped: --allow-net=api.example.com
│   ├── Multiple: --allow-net=api.example.com,db.internal
│   └── Deny: --deny-net=evil.com (blocklist)
│
├── Runtime Permission API
│   ├── Deno.permissions.query({ name: "read", path: "/tmp" })
│   │   └── Returns: { state: "granted" | "denied" | "prompt" }
│   ├── Deno.permissions.request({ name: "net", host: "api.com" })
│   │   └── Prompts user if not pre-granted
│   └── Deno.permissions.revoke({ name: "env" })
│       └── Revoke previously granted permission
│
└── Permission Enforcement
    ├── Checked at runtime, not compile time
    ├── Throws PermissionDenied error
    ├── Cannot escalate in child workers
    ├── Immutable after process start (mostly)
    └── WASM Sandboxing: Complementary isolation layer
        └── See: WASMIntegrationAsACoreFeature.md (Security Model)
```

### 0.3.2 Echelon Permission Strategy

```
Echelon.Permissions.Strategy
├── Development Mode
│   └── deno run -A main.ts
│       └── All permissions for convenience
│
├── Production Mode (Minimal)
│   └── deno run \
│         --allow-net=0.0.0.0:8000,api.stripe.com \
│         --allow-read=./public,./views \
│         --allow-write=./logs,./uploads \
│         --allow-env=DATABASE_URL,SECRET_KEY \
│         main.ts
│
├── Permission Documentation
│   └── PERMISSIONS.md
│       ├── List all required permissions
│       ├── Explain why each is needed
│       └── Security implications
│
└── Runtime Permission Checks
    └── Echelon checks permissions on startup:
        async function checkRequiredPermissions() {
          const required = [
            { name: "net", host: "0.0.0.0:8000" },
            { name: "read", path: "./config" },
            { name: "env", variable: "DATABASE_URL" },
          ];
          for (const perm of required) {
            const status = await Deno.permissions.query(perm);
            if (status.state !== "granted") {
              throw new Error(`Missing permission: ${perm.name}`);
            }
          }
        }
```

---

## 0.4 Built-in APIs: Deno Namespace

### 0.4.1 Core Deno APIs Used by Echelon

```
Echelon.Runtime.APIs
├── HTTP Server
│   └── Deno.serve(handler, options)
│       ├── High-performance HTTP server
│       ├── HTTP/1.1 and HTTP/2 support
│       ├── Automatic request/response handling
│       └── Graceful shutdown support
│
├── Key-Value Store
│   └── Deno.openKv(path?)
│       ├── Persistent key-value database
│       ├── ACID transactions
│       ├── Watch for changes
│       ├── Queue system (enqueue/listenQueue)
│       └── Atomic operations
│
├── File System
│   ├── Deno.readTextFile(path)
│   ├── Deno.writeTextFile(path, data)
│   ├── Deno.readDir(path)
│   ├── Deno.stat(path)
│   ├── Deno.mkdir(path, options)
│   └── Deno.remove(path, options)
│
├── Environment
│   ├── Deno.env.get(key)
│   ├── Deno.env.set(key, value)
│   └── Deno.env.toObject()
│
├── Subprocesses
│   ├── Deno.Command(program, options)
│   └── command.output() / command.spawn()
│
├── Scheduling
│   └── Deno.cron(name, schedule, handler)
│       └── Cron jobs (Deno Deploy)
│
├── System Info
│   ├── Deno.hostname()
│   ├── Deno.osRelease()
│   ├── Deno.memoryUsage()
│   └── Deno.pid
│
├── Signals
│   └── Deno.addSignalListener(signal, handler)
│       ├── SIGINT, SIGTERM handling
│       └── Graceful shutdown
│
└── WebAssembly (CRITICAL/REQUIRED)
    ├── WebAssembly.compile(bytes)
    │   └── Compile WASM module (async)
    ├── WebAssembly.compileStreaming(source)
    │   └── Streaming compilation (Deno 2.1+, 40% faster)
    ├── WebAssembly.instantiate(module, imports)
    │   └── Create module instance
    ├── WebAssembly.Module
    │   └── Compiled WASM module
    ├── WebAssembly.Instance
    │   └── Instantiated module with exports
    ├── WebAssembly.Memory
    │   └── Linear memory buffer
    └── WebAssembly.Table
        └── Function reference table

    Echelon WASM Runtime:
    └── framework/runtime/wasm_runtime.ts
        ├── WASMRuntimeCore: Orchestration
        ├── Module loading, caching, execution
        ├── Sandbox manager with capability-based security
        └── See: WASMIntegrationAsACoreFeature.md
```

### 0.4.2 Web Standard APIs

```
Echelon.Runtime.WebAPIs
├── Fetch API
│   ├── fetch(url, options)
│   ├── Request / Response objects
│   ├── Headers object
│   └── AbortController for cancellation
│
├── URL API
│   ├── URL class
│   ├── URLSearchParams
│   └── URLPattern (route matching)
│
├── Crypto API
│   ├── crypto.randomUUID()
│   ├── crypto.getRandomValues()
│   └── crypto.subtle
│       ├── encrypt/decrypt
│       ├── sign/verify
│       ├── digest (SHA-256, etc.)
│       ├── deriveKey (PBKDF2, HKDF)
│       └── generateKey
│
├── Streams API
│   ├── ReadableStream
│   ├── WritableStream
│   ├── TransformStream
│   └── CompressionStream / DecompressionStream
│
├── Encoding API
│   ├── TextEncoder / TextDecoder
│   └── atob / btoa (Base64)
│
├── Timers
│   ├── setTimeout / clearTimeout
│   ├── setInterval / clearInterval
│   └── queueMicrotask
│
├── Performance API
│   ├── performance.now()
│   ├── performance.mark()
│   └── performance.measure()
│
└── Console API
    └── console.log/error/warn/debug/table/time/timeEnd
```

---

## 0.5 Process Lifecycle

### 0.5.1 Application Startup

```
Echelon.Runtime.Startup
├── Process Initialization
│   ├── 1. Deno runtime initializes V8
│   ├── 2. Parse command-line arguments
│   ├── 3. Load permissions
│   ├── 4. Initialize TypeScript compiler
│   └── 5. Begin module loading
│
├── Module Loading Sequence
│   ├── 1. Load entry point (main.ts)
│   ├── 2. Resolve imports (build module graph)
│   ├── 3. Download remote modules (if needed)
│   ├── 4. Type-check (if enabled)
│   ├── 5. Transpile TypeScript to JavaScript
│   ├── 6. Execute modules (top-level code)
│   └── 7. Execute main function
│
├── Echelon Boot Sequence
│   └── main.ts:
│       // 1. Load configuration
│       const config = await loadConfig();
│
│       // 2. Check permissions
│       await checkPermissions();
│
│       // 3. Initialize telemetry
│       const telemetry = await initTelemetry(config);
│
│       // 4. Open database
│       const kv = await Deno.openKv();
│
│       // 5. Initialize WASM runtime (if enabled)
│       const wasmRuntime = config.enableWasm
│         ? await initWasmRuntime(config.wasm)
│         : undefined;
│
│       // 6. Initialize services
│       const services = await initServices(config, kv);
│
│       // 7. Build application
│       const app = createApplication(config, services, wasmRuntime);
│
│       // 8. Register routes
│       registerRoutes(app);
│
│       // 9. Start server
│       await app.serve();
│
└── Startup Metrics
    ├── startup_duration_ms
    ├── module_load_duration_ms
    ├── typecheck_duration_ms
    └── first_request_ready_ms
```

### 0.5.2 Graceful Shutdown

```
Echelon.Runtime.Shutdown
├── Signal Handling
│   └── // Register shutdown handlers
│       const controller = new AbortController();
│       
│       Deno.addSignalListener("SIGINT", () => {
│         console.log("Received SIGINT, shutting down...");
│         controller.abort();
│       });
│       
│       Deno.addSignalListener("SIGTERM", () => {
│         console.log("Received SIGTERM, shutting down...");
│         controller.abort();
│       });
│
├── Shutdown Sequence
│   ├── 1. Stop accepting new connections
│   ├── 2. Wait for in-flight requests (timeout)
│   ├── 3. Close database connections
│   ├── 4. Flush telemetry/logs
│   ├── 5. Stop background workers
│   └── 6. Exit process
│
├── Echelon Shutdown Handler
│   └── class Application {
│         async shutdown(): Promise<void> {
│           // 1. Stop server
│           await this.server.shutdown();
│
│           // 2. Stop job workers
│           await this.jobWorker.stop();
│
│           // 3. Shutdown WASM runtime
│           if (this.wasm) {
│             await this.wasm.shutdown();
│           }
│
│           // 4. Flush telemetry
│           await this.telemetry.flush();
│
│           // 5. Close KV
│           this.kv.close();
│
│           // 6. Run custom shutdown hooks
│           for (const hook of this.shutdownHooks) {
│             await hook();
│           }
│
│           console.log("Shutdown complete");
│         }
│       }
│
└── Shutdown Timeout
    ├── Default: 30 seconds
    ├── Force kill after timeout
    └── Configurable per deployment
```

### 0.5.3 Process Signals

```
Echelon.Runtime.Signals
├── Handled Signals
│   ├── SIGINT (Ctrl+C)
│   │   └── Graceful shutdown
│   ├── SIGTERM (kill)
│   │   └── Graceful shutdown
│   ├── SIGHUP (reload)
│   │   └── Configuration reload (optional)
│   └── SIGUSR1 (custom)
│       └── Debug dump, metrics export
│
├── Signal Registration
│   └── Deno.addSignalListener("SIGINT", handler)
│   └── Deno.addSignalListener("SIGTERM", handler)
│
└── Unhandled Signals
    └── Default OS behavior (terminate)
```

---

## 0.6 Runtime Configuration

### 0.6.1 deno.json Configuration

```json
{
  "name": "echelon-app",
  "version": "1.0.0",
  
  "tasks": {
    "dev": "deno run --watch -A main.ts",
    "start": "deno run --allow-net --allow-read --allow-env main.ts",
    "test": "deno test --allow-all",
    "check": "deno check main.ts",
    "lint": "deno lint",
    "fmt": "deno fmt"
  },
  
  "imports": {
    "@/": "./src/",
    "@aos/": "./framework/",
    "std/": "https://deno.land/std@0.220.0/"
  },
  
  "compilerOptions": {
    "strict": true,
    "lib": ["deno.window", "deno.unstable"],
    "jsx": "react-jsx",
    "jsxImportSource": "preact"
  },
  
  "lint": {
    "rules": {
      "tags": ["recommended"],
      "include": ["no-explicit-any"]
    }
  },
  
  "fmt": {
    "lineWidth": 100,
    "indentWidth": 2,
    "singleQuote": true
  },
  
  "lock": true,
  "nodeModulesDir": false,
  
  "unstable": ["kv", "cron"]
}
```

### 0.6.2 Runtime Flags

```
Echelon.Runtime.Flags
├── Performance Flags
│   ├── --v8-flags=--max-old-space-size=4096
│   │   └── Increase memory limit
│   ├── --v8-flags=--expose-gc
│   │   └── Manual GC control
│   └── --cached-only
│       └── Fail if remote modules not cached
│
├── Security Flags
│   ├── --allow-* / --deny-*
│   │   └── Permission flags
│   └── --no-prompt
│       └── Fail instead of prompting for permissions
│
├── Development Flags
│   ├── --watch
│   │   └── Auto-restart on file changes
│   ├── --inspect / --inspect-brk
│   │   └── Chrome DevTools debugging
│   └── --check
│       └── Type-check only (no execution)
│
└── Production Flags
    ├── --no-check
    │   └── Skip type-checking (faster startup)
    └── --quiet
        └── Suppress diagnostic output
```

---

## 0.7 Runtime Telemetry

### 0.7.1 Runtime Metrics

```
Echelon.Runtime.Metrics
├── Memory Metrics
│   ├── v8_heap_used_bytes: Gauge
│   ├── v8_heap_total_bytes: Gauge
│   ├── v8_external_bytes: Gauge
│   ├── process_memory_rss_bytes: Gauge
│   ├── wasm_memory_allocated_bytes: Gauge
│   ├── wasm_memory_used_bytes: Gauge
│   └── wasm_modules_loaded: Gauge
│
├── Event Loop Metrics
│   ├── event_loop_lag_ms: Histogram
│   ├── event_loop_utilization: Gauge
│   └── async_operations_pending: Gauge
│
├── GC Metrics
│   ├── gc_duration_ms: Histogram
│   ├── gc_pause_count: Counter
│   └── gc_type: Counter{type="major|minor"}
│
├── Module Metrics
│   ├── modules_loaded: Gauge
│   ├── module_load_duration_ms: Histogram
│   └── typescript_compile_duration_ms: Histogram
│
└── Collection
    └── Echelon collects via:
        - Deno.memoryUsage()
        - performance.now() for timing
        - Custom instrumentation
```

### 0.7.2 Runtime Events

```
Echelon.Runtime.Events
├── Lifecycle Events
│   ├── runtime.start
│   ├── runtime.ready
│   ├── runtime.shutdown
│   └── runtime.error
│
├── Performance Events
│   ├── gc.start / gc.end
│   ├── module.load
│   └── permission.check
│
├── WASM Events
│   ├── wasm.runtime.init
│   ├── wasm.module.loaded
│   ├── wasm.exec.start / wasm.exec.complete
│   ├── wasm.sandbox.created
│   └── wasm.sandbox.violation
│
└── Event Emission
    └── runtime.emit('ready', {
          startupDuration: 150,
          modulesLoaded: 47,
          memoryUsed: 52428800,
          wasmEnabled: true
        })
```

---

## 0.8 Runtime Environment Types

### 0.8.1 Deployment Environments

```
Echelon.Runtime.Environments
├── Development
│   ├── Mode: deno run --watch -A
│   ├── Features: Hot reload, verbose errors, debug tools
│   └── KV: Local file-based
│
├── Production (Self-Hosted)
│   ├── Mode: deno run --allow-net --allow-read...
│   ├── Features: Optimized, minimal logging
│   └── KV: Local file or remote KV
│
├── Deno Deploy (Edge)
│   ├── Mode: Automatic deployment
│   ├── Features: Global edge, auto-scaling
│   ├── KV: Deno KV (managed, replicated)
│   ├── Cron: Deno.cron (native)
│   └── Limits: 
│       ├── CPU time: 50ms per request (soft)
│       ├── Memory: 512MB
│       └── Request size: 100MB
│
└── Docker Container
    ├── Image: denoland/deno:latest
    ├── Features: Reproducible, scalable
    └── KV: Volume-mounted or remote
```

### 0.8.2 Environment Detection

```typescript
Echelon.Runtime.Environment
├── Detection Methods
│   └── const environment = {
│         isDenoDeploy: Deno.env.get("DENO_DEPLOYMENT_ID") !== undefined,
│         isDocker: Deno.env.get("DOCKER") === "true",
│         isDevelopment: Deno.env.get("DENO_ENV") === "development",
│         isProduction: Deno.env.get("DENO_ENV") === "production",
│         isTest: Deno.env.get("DENO_ENV") === "test",
│       }
│
├── Runtime Info
│   └── const runtimeInfo = {
│         denoVersion: Deno.version.deno,
│         v8Version: Deno.version.v8,
│         typescriptVersion: Deno.version.typescript,
│         os: Deno.build.os,
│         arch: Deno.build.arch,
│       }
│
└── Feature Detection
    └── const features = {
          hasKV: typeof Deno.openKv === "function",
          hasCron: typeof Deno.cron === "function",
          hasFFI: typeof Deno.dlopen === "function",
        }
```

---

## 0.9 Runtime Interface Definition

### Complete Runtime Type Definition

```typescript
/**
 * Echelon Runtime Interface
 * Layer 0: Defines the execution environment contract
 */
interface EchelonRuntime {
  // Version Info
  readonly version: {
    deno: string;
    v8: string;
    typescript: string;
    denoAOS: string;
  };
  
  // Environment
  readonly environment: {
    mode: 'development' | 'production' | 'test';
    isDenoDeploy: boolean;
    isDocker: boolean;
    hostname: string;
    pid: number;
  };
  
  // Permissions
  readonly permissions: {
    check(permission: PermissionDescriptor): Promise<PermissionStatus>;
    request(permission: PermissionDescriptor): Promise<PermissionStatus>;
    required: PermissionDescriptor[];
  };
  
  // Resources
  readonly resources: {
    kv: Deno.Kv;
    memoryUsage(): MemoryUsage;
    cpuUsage(): CpuUsage;
  };

  // WASM Runtime (CRITICAL/REQUIRED)
  readonly wasm?: {
    loadModule(source: WASMSource): Promise<WASMModule>;
    instantiate(moduleId: string, options?: WASMInstantiationOptions): Promise<void>;
    execute<T>(moduleId: string, functionName: string, args: unknown[]): Promise<WASMExecutionResult<T>>;
    createSandbox(config: WASMSandboxConfig): WASMSandbox;
    generator: WASMGenerator;
    getStats(): WASMRuntimeStats;
  };

  // Lifecycle
  onStart(handler: () => Promise<void>): void;
  onReady(handler: () => void): void;
  onShutdown(handler: () => Promise<void>): void;
  onError(handler: (error: Error) => void): void;
  
  // Telemetry
  readonly telemetry: {
    metrics: MetricsRegistry;
    tracing: TracingContext;
    logging: Logger;
  };
  
  // Control
  shutdown(reason?: string): Promise<void>;
  restart(): Promise<void>;
  
  // Workers
  createWorker(script: string, options?: WorkerOptions): Worker;
  
  // Feature Flags
  hasFeature(feature: RuntimeFeature): boolean;
}

// Make runtime globally available
declare const runtime: EchelonRuntime;
```

---

## 0.10 Layer 0 Summary

### Responsibilities Matrix

| Responsibility | Deno Component | Echelon Abstraction |
|---------------|----------------|---------------------|
| Code Execution | V8 Engine | Transparent |
| TypeScript | SWC Compiler | deno.json config |
| Module Loading | ES Modules + Import Maps | Import map aliases |
| Async/Concurrency | Tokio Event Loop | Promise-based APIs |
| Security | Permission System | Permission strategy |
| HTTP Server | Deno.serve | Layer 1 wrapper |
| Database | Deno.openKv | Layer 5 ORM |
| Scheduling | Deno.cron | Layer 9 Jobs |
| Process Lifecycle | Signals, startup | Lifecycle hooks |
| Memory Management | V8 GC | Monitoring only |
| Workers | Web Workers | Worker pool abstraction |
| WebAssembly Execution | WebAssembly APIs | WASMRuntimeCore (Layer 0) |
| WASM Module Loading | Native imports (Deno 2.1+) | Multi-source loader + caching |
| WASM Sandboxing | Linear memory isolation | Capability-based sandbox manager |
| WASM Code Generation | External toolchains | Built-in generator (TS/Rust) |

### Key Differences from Traditional Frameworks

| Aspect | Traditional (Python/Ruby) | Echelon (Deno) |
|--------|--------------------------|----------------|
| Runtime | Python/Ruby interpreter | V8 + Deno |
| App Server | Gunicorn/Puma (separate) | Deno.serve (built-in) |
| Package Manager | pip/bundler (separate) | Built into Deno |
| Type System | Optional (mypy/Sorbet) | Native TypeScript |
| Security | OS-level | Fine-grained permissions |
| Module Format | CommonJS/various | ES Modules only |
| Database | PostgreSQL/MySQL | Deno KV (built-in) |
| Async Model | Threads/GIL | Event loop + Workers |
| WebAssembly | External runtime (WASI-SDK) | Native V8 support + Runtime |

---

The Runtime layer (Layer 0) is **implicit** in traditional frameworks—you install Python + Gunicorn, or Ruby + Puma. With Deno, the runtime is **unified**—one binary that includes the language, compiler, HTTP server, and package manager. Echelon leverages this tight integration for superior developer experience and performance.

**WebAssembly is a CRITICAL/REQUIRED component of Layer 0**, providing near-native performance for computationally intensive tasks, secure sandboxing for untrusted code execution, and the ability to run code compiled from multiple languages (TypeScript, Rust, C/C++, Go, etc.). The WASM runtime is deeply integrated with Echelon's architecture—see `WASMIntegrationAsACoreFeature.md` for comprehensive details on implementation, use cases, and best practices.

**Layers 1-18 build upon this runtime foundation, with Layer 1 (HTTP/Server) being the first framework-specific abstraction layer.**
