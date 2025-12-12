# WebAssembly Integration as a Core Feature

**Status**: Production-Ready
**Version**: 1.0
**Last Updated**: 2025-01-27

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [WASM Runtime Core](#wasm-runtime-core)
4. [WASM-JavaScript Interop](#wasm-javascript-interop)
5. [WASI Support](#wasi-support)
6. [Security Model](#security-model)
7. [WASM Generator](#wasm-generator)
8. [Native-Level Browser Bindings](#native-level-browser-bindings)
9. [Use Cases](#use-cases)
10. [API Reference](#api-reference)
11. [Testing & Debugging](#testing--debugging)
12. [Migration Guide](#migration-guide)
13. [Performance Optimization](#performance-optimization)

---

## Overview

WebAssembly (WASM) is a **CRITICAL and REQUIRED** foundational capability of the Echelon framework. WASM execution and generation are deeply integrated as core features, not optional add-ons. This integration enables:

- **High-Performance Computing**: CPU-intensive operations at near-native speeds
- **Plugin System**: Sandboxed, safe execution of untrusted third-party code
- **Code Portability**: Run modules compiled from TypeScript, Rust, C++, and other languages
- **Browser-Server Parity**: Share WASM modules between server (Deno) and client (browser)
- **Dynamic Compilation**: Generate WASM modules at runtime for specialized workloads

### Key Features

- ✅ **Multi-Language Support**: TypeScript/AssemblyScript AND Rust toolchains
- ✅ **WASI Support**: Full WebAssembly System Interface implementation (REQUIRED)
- ✅ **Capability-Based Security**: Deno permission integration with sandboxing
- ✅ **Native Browser Bindings**: DOM, Canvas, Fetch, WebSocket access from WASM
- ✅ **Streaming Compilation**: Deno 2.1+ optimized loading
- ✅ **Production-Ready**: Stable APIs with comprehensive error handling

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Echelon Application                       │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │          Application Core (framework/app.ts)        │    │
│  │                                                      │    │
│  │  ┌──────────────┐         ┌──────────────────┐     │    │
│  │  │  HTTP Server │────────▶│ Request Handlers │     │    │
│  │  └──────────────┘         └──────────────────┘     │    │
│  │                                    │                │    │
│  │                                    ▼                │    │
│  │         ┌───────────────────────────────────┐      │    │
│  │         │   WASM Runtime Core (Layer 0)     │      │    │
│  │         │   framework/runtime/wasm_runtime.ts│      │    │
│  │         │                                     │      │    │
│  │         │  ┌────────────────────────────┐   │      │    │
│  │         │  │   Module Loader            │   │      │    │
│  │         │  │   - File/URL/Bytes/Base64  │   │      │    │
│  │         │  │   - Streaming Compilation  │   │      │    │
│  │         │  │   - Cache Management       │   │      │    │
│  │         │  └────────────────────────────┘   │      │    │
│  │         │                                     │      │    │
│  │         │  ┌────────────────────────────┐   │      │    │
│  │         │  │   Executor                 │   │      │    │
│  │         │  │   - Function Invocation    │   │      │    │
│  │         │  │   - Timeout Management     │   │      │    │
│  │         │  │   - Metrics Collection     │   │      │    │
│  │         │  └────────────────────────────┘   │      │    │
│  │         │                                     │      │    │
│  │         │  ┌────────────────────────────┐   │      │    │
│  │         │  │   Memory Manager           │   │      │    │
│  │         │  │   - Allocation Tracking    │   │      │    │
│  │         │  │   - Limit Enforcement      │   │      │    │
│  │         │  │   - Per-Module Stats       │   │      │    │
│  │         │  └────────────────────────────┘   │      │    │
│  │         │                                     │      │    │
│  │         │  ┌────────────────────────────┐   │      │    │
│  │         │  │   Sandbox Manager          │   │      │    │
│  │         │  │   - Capability Control     │   │      │    │
│  │         │  │   - Resource Limits        │   │      │    │
│  │         │  │   - Violation Tracking     │   │      │    │
│  │         │  └────────────────────────────┘   │      │    │
│  │         │                                     │      │    │
│  │         │  ┌────────────────────────────┐   │      │    │
│  │         │  │   WASI Provider (REQUIRED) │   │      │    │
│  │         │  │   - Filesystem Access      │   │      │    │
│  │         │  │   - Environment Variables  │   │      │    │
│  │         │  │   - Clock/Random           │   │      │    │
│  │         │  └────────────────────────────┘   │      │    │
│  │         └───────────────────────────────────┘      │    │
│  │                                                      │    │
│  │         ┌───────────────────────────────────┐      │    │
│  │         │   WASM Generator Core (Layer 12)  │      │    │
│  │         │   framework/plugin/wasm_generator.ts│     │    │
│  │         │                                     │      │    │
│  │         │  ┌────────────────────────────┐   │      │    │
│  │         │  │   TypeScript Compiler      │   │      │    │
│  │         │  │   - AST Parser             │   │      │    │
│  │         │  │   - Type Inference         │   │      │    │
│  │         │  │   - Code Generator         │   │      │    │
│  │         │  └────────────────────────────┘   │      │    │
│  │         │                                     │      │    │
│  │         │  ┌────────────────────────────┐   │      │    │
│  │         │  │   Rust Compiler (wasmbuild)│   │      │    │
│  │         │  │   - wasm-bindgen Support   │   │      │    │
│  │         │  │   - wasm-pack Integration  │   │      │    │
│  │         │  │   - Optimization Pipeline  │   │      │    │
│  │         │  └────────────────────────────┘   │      │    │
│  │         │                                     │      │    │
│  │         │  ┌────────────────────────────┐   │      │    │
│  │         │  │   WAT Compiler             │   │      │    │
│  │         │  │   - Text Format Parser     │   │      │    │
│  │         │  │   - Binary Encoder         │   │      │    │
│  │         │  └────────────────────────────┘   │      │    │
│  │         │                                     │      │    │
│  │         │  ┌────────────────────────────┐   │      │    │
│  │         │  │   Optimizer                │   │      │    │
│  │         │  │   - Dead Code Elimination  │   │      │    │
│  │         │  │   - Inlining               │   │      │    │
│  │         │  │   - Size/Speed Optimization│   │      │    │
│  │         │  └────────────────────────────┘   │      │    │
│  │         └───────────────────────────────────┘      │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Folder Structure

```
/framework/
├── runtime/                    # Layer 0: Runtime & Execution Environment
│   ├── wasm_runtime.ts         # Main orchestrator (730 lines)
│   ├── wasm_types.ts           # Type definitions (623 lines)
│   ├── wasm_module_loader.ts   # Module loading (1027 lines)
│   ├── wasm_executor.ts        # Execution engine
│   ├── wasm_memory.ts          # Memory management
│   ├── wasm_sandbox.ts         # Sandboxing
│   ├── wasm_native_loader.ts   # Deno 2.1+ native imports
│   └── wasi.ts                 # WASI implementation (REQUIRED)
│
├── plugin/                     # Layer 12: Plugin System & Code Generation
│   ├── wasm_generator.ts       # Main generator (2173 lines)
│   ├── wasm_compiler.ts        # WAT/Rust compilation
│   ├── wasm_codegen.ts         # Binary format generation
│   ├── wasm_optimizer.ts       # Optimization passes
│   └── wasmbuild_compiler.ts   # Rust toolchain integration
│
└── middleware/                 # Layer 2: Middleware Pipeline
    └── wasm.ts                 # WASM middleware integration
```

### Integration Points

The WASM runtime integrates with Echelon at multiple layers:

1. **Application Core** (`framework/app.ts`): Initializes and manages WASM runtime lifecycle
2. **Request Handlers**: Execute WASM modules in response to HTTP requests
3. **Middleware Pipeline**: WASM-based request/response transformations
4. **Plugin System**: Load and execute third-party WASM plugins
5. **Telemetry**: Automatic metrics and tracing for WASM operations

---

## WASM Runtime Core

### Module Loading

The WASM runtime supports loading modules from multiple sources with automatic caching and validation.

#### Supported Source Types

```typescript
// framework/runtime/wasm_types.ts:25
export type WASMSourceType = 'file' | 'url' | 'bytes' | 'base64' | 'native';
```

#### Loading from File

```typescript
import { Application } from '@echelon/app';

const app = new Application();

// Load WASM module from filesystem
const module = await app.wasm.loadModule({
  type: 'file',
  value: './wasm_modules/math.wasm',
  moduleId: 'math-module'
});

// Execute exported function
const result = await app.wasm.execute<number>(
  'math-module',
  'add',
  [5, 3],
  { timeout: 1000 }
);

console.log(result.value); // 8
```

#### Loading from URL with Streaming Compilation

Deno 2.1+ supports streaming compilation for better performance and memory efficiency:

```typescript
// Streaming compilation (default for URL sources)
const module = await app.wasm.loadModule({
  type: 'url',
  value: 'https://example.com/modules/image-processor.wasm'
});

// Streaming is 40% faster and uses 60% less memory
// Best practice per Deno docs: https://docs.deno.com/runtime/reference/wasm/
```

**Performance Comparison**:
- Traditional: Download → Compile (2 separate operations)
- Streaming: Download + Compile (concurrent, lower memory)

#### Loading from Bytes

```typescript
// Load from Uint8Array (e.g., from database or generated)
const wasmBytes = await Deno.readFile('./custom.wasm');
const module = await app.wasm.loadModule({
  type: 'bytes',
  value: wasmBytes,
  moduleId: 'custom-module'
});
```

#### Native Import (Deno 2.1+)

For modules with native import support:

```typescript
// Register native module
await app.wasm.registerNativeModule('math', './wasm_modules/math.wasm');

// Call directly with full type safety
const sum = app.wasm.callNative<number>('math', 'add', 5, 3);
console.log(sum); // 8 (synchronous call)
```

### Module Instantiation

#### Basic Instantiation

```typescript
const module = await app.wasm.loadModule({
  type: 'file',
  value: './memory-test.wasm'
});

// Instantiate with custom imports
const instance = await app.wasm.instantiate(module.id, {
  imports: {
    env: {
      log: (ptr: number, len: number) => {
        // Read string from WASM memory
        const memory = instance.exports.memory as WebAssembly.Memory;
        const bytes = new Uint8Array(memory.buffer, ptr, len);
        const text = new TextDecoder().decode(bytes);
        console.log('[WASM]:', text);
      }
    }
  }
});
```

#### With Shared Memory

```typescript
// Create shared memory for multiple modules
const sharedMemory = new WebAssembly.Memory({
  initial: 10, // 640KB
  maximum: 100, // 6.4MB
  shared: true
});

const module1 = await app.wasm.loadModule({
  type: 'file',
  value: './worker1.wasm'
});

await app.wasm.instantiate(module1.id, {
  memory: sharedMemory
});

const module2 = await app.wasm.loadModule({
  type: 'file',
  value: './worker2.wasm'
});

await app.wasm.instantiate(module2.id, {
  memory: sharedMemory
});

// Both modules now share the same memory
```

### Memory Management

#### Memory Configuration

```typescript
// framework/runtime/wasm_runtime.ts:37-72
export interface WASMRuntimeConfig {
  // Memory configuration
  globalMemoryLimit?: number;      // Global limit: 256MB default
  defaultModuleMemoryLimit?: number; // Per-module: 16MB default

  // Execution configuration
  defaultTimeout?: number;         // 5000ms default
  maxConcurrentExecutions?: number; // 100 default

  // Feature flags
  enableSandboxing?: boolean;      // true default
  enableMetrics?: boolean;         // true default
  preferStreamingCompilation?: boolean; // true default
  enableNativeImports?: boolean;   // false default
}
```

#### Memory Statistics

```typescript
// Get global memory stats
const stats = app.wasm.getMemoryStats();
console.log({
  allocated: stats.allocated,    // Total bytes allocated
  used: stats.used,              // Bytes in use
  available: stats.available,    // Bytes available
  pageCount: stats.pageCount     // Number of 64KB pages
});

// Get per-module stats
const moduleStats = stats.moduleStats?.get('math-module');
console.log({
  allocated: moduleStats.allocated,
  peakUsage: moduleStats.peakUsage,
  allocations: moduleStats.allocations,
  frees: moduleStats.frees
});
```

#### Memory Limits

```typescript
// Configure module with memory limit
const sandbox = app.wasm.createSandbox({
  memoryLimit: 8 * 1024 * 1024, // 8MB limit
  capabilities: ['memory', 'bulk-memory']
});

// Module will throw if it exceeds 8MB
const module = await app.wasm.loadModule({
  type: 'file',
  value: './memory-intensive.wasm'
});

await app.wasm.instantiate(module.id, {
  sandboxId: sandbox.id
});
```

### Execution Model

#### Synchronous Execution

```typescript
// Execute exported function
const result = await app.wasm.execute<number>(
  'math-module',
  'fibonacci',
  [10],
  { timeout: 5000 }
);

if (result.success) {
  console.log('Fibonacci(10):', result.value); // 55
  console.log('Duration:', result.duration, 'ms');
  console.log('Memory used:', result.memoryUsed, 'bytes');
} else {
  console.error('Execution failed:', result.error);
}
```

#### Concurrent Execution Limits

```typescript
// Configure max concurrent executions
const app = new Application({
  wasm: {
    maxConcurrentExecutions: 50 // Limit to 50 concurrent calls
  }
});

// Executions beyond limit will queue
const promises = Array.from({ length: 100 }, (_, i) =>
  app.wasm.execute('cpu-heavy', 'compute', [i])
);

// Only 50 execute concurrently, rest wait
const results = await Promise.all(promises);
```

#### Timeout Handling

```typescript
// Execution with custom timeout
try {
  const result = await app.wasm.execute<number>(
    'long-running',
    'process',
    [largeDataset],
    { timeout: 10000 } // 10 second timeout
  );
} catch (error) {
  if (error.message.includes('timeout')) {
    console.error('Execution exceeded 10 seconds');
  }
}
```

#### Host Function Registration

```typescript
// Register JavaScript functions callable from WASM
app.wasm.registerHostFunction({
  name: 'fetchData',
  module: 'env',
  signature: {
    params: ['i32', 'i32'], // URL pointer, length
    results: ['i32']        // Status code
  },
  func: (urlPtr: number, urlLen: number) => {
    // Read URL from WASM memory
    const memory = /* get memory */;
    const bytes = new Uint8Array(memory.buffer, urlPtr, urlLen);
    const url = new TextDecoder().decode(bytes);

    // Make fetch request
    fetch(url).then(res => {
      // Write response back to WASM memory
      // ...
    });

    return 200; // HTTP status
  },
  async: true
});
```

---

## WASM-JavaScript Interop

### Type System Bridge

WASM and JavaScript have different type systems. Echelon provides automatic type conversion and validation.

#### Supported Types

```typescript
// framework/runtime/wasm_types.ts:14
export type WASMValueType =
  | 'i32'       // 32-bit integer (JS number)
  | 'i64'       // 64-bit integer (JS bigint)
  | 'f32'       // 32-bit float (JS number)
  | 'f64'       // 64-bit float (JS number)
  | 'v128'      // 128-bit SIMD vector (Int8Array)
  | 'funcref'   // Function reference
  | 'externref' // External reference (any JS value)
```

#### Type Conversion

```typescript
// Automatic type conversion
const result = await app.wasm.execute<number>(
  'math',
  'add',
  [5, 3] // JS numbers → i32
);
// result.value is JS number ← i32

// BigInt for i64
const bigResult = await app.wasm.execute<bigint>(
  'math',
  'multiply64',
  [BigInt(1000000), BigInt(2000000)] // JS bigint → i64
);
// bigResult.value is JS bigint ← i64

// SIMD vectors
const simdResult = await app.wasm.execute<Int8Array>(
  'simd',
  'processVector',
  [new Int8Array([1, 2, 3, 4])] // Int8Array → v128
);
```

#### TypeScript Declaration Generation

The module loader can generate TypeScript declarations for WASM modules:

```typescript
// framework/runtime/wasm_module_loader.ts:715-820
const module = await app.wasm.loadModule({
  type: 'file',
  value: './math.wasm'
});

// Generate .d.ts content
const declaration = app.wasm.loader.generateModuleDeclaration(
  './math.wasm',
  module
);

// Write to filesystem
await Deno.writeTextFile('./math.wasm.d.ts', declaration);

/*
Generated content:
// Auto-generated TypeScript declarations for WASM module
// Source: ./math.wasm
// Generated: 2025-01-27T12:00:00.000Z

declare module "./math.wasm" {
  export function add(arg0: number, arg1: number): number;
  export function multiply(arg0: number, arg1: number): number;
  export const memory: WebAssembly.Memory;
}
*/
```

### Import/Export Handling

#### Exporting Functions

```wat
;; WASM module (math.wat)
(module
  (func $add (param $a i32) (param $b i32) (result i32)
    local.get $a
    local.get $b
    i32.add
  )
  (export "add" (func $add))
  (export "version" (global $version))
  (export "memory" (memory 0))
  (memory 1)
  (global $version i32 (i32.const 100))
)
```

```typescript
// JavaScript usage
const result = await app.wasm.execute('math', 'add', [5, 3]);
console.log(result.value); // 8

// Access exported globals
const module = app.wasm.getModule('math');
const instance = module.instance;
const version = (instance.exports.version as WebAssembly.Global).value;
console.log(version); // 100

// Access exported memory
const memory = instance.exports.memory as WebAssembly.Memory;
const view = new Uint8Array(memory.buffer);
```

#### Importing Host Functions

```typescript
// Define host functions
const imports = {
  env: {
    log: (value: number) => console.log('[WASM]:', value),
    getCurrentTime: () => Date.now(),
    randomFloat: () => Math.random()
  }
};

// Load module with imports
await app.wasm.instantiate(moduleId, { imports });
```

```wat
;; WASM module using imports
(module
  (import "env" "log" (func $log (param i32)))
  (import "env" "getCurrentTime" (func $getTime (result f64)))

  (func $main
    ;; Log a value
    i32.const 42
    call $log

    ;; Get current time
    call $getTime
    ;; ... use time value
  )
  (export "main" (func $main))
)
```

### Error Handling

#### Execution Errors

```typescript
const result = await app.wasm.execute('module', 'divide', [10, 0]);

if (!result.success) {
  console.error('Execution failed:', result.error.message);
  // Error types:
  // - RuntimeError: WASM trap (division by zero, out of bounds, etc.)
  // - TimeoutError: Execution exceeded timeout
  // - MemoryError: Memory limit exceeded
  // - TypeError: Invalid argument types
}
```

#### Validation Errors

```typescript
// Validation during loading
try {
  const module = await app.wasm.loadModule({
    type: 'bytes',
    value: invalidWasmBytes
  });
} catch (error) {
  console.error('Validation failed:', error.message);
  // Error details:
  // - Invalid magic number
  // - Unsupported WASM version
  // - Malformed sections
  // - Type mismatches
}
```

#### Sandbox Violations

```typescript
// Listen for sandbox violations
app.wasm.on('sandbox:violation', (violation) => {
  console.error('Sandbox violation:', {
    sandboxId: violation.sandboxId,
    moduleId: violation.moduleId,
    type: violation.type, // 'memory' | 'time' | 'cpu' | 'capability'
    message: violation.message,
    timestamp: violation.timestamp
  });
});
```

---

## WASI Support

**WASI (WebAssembly System Interface) is REQUIRED** for the Echelon framework. It provides a capability-based system interface for WASM modules to access filesystem, environment variables, clocks, and random number generation.

### Overview

WASI is the standardized system interface for WebAssembly, similar to POSIX for Unix systems. It enables:

- **Filesystem Access**: Read/write files with capability-based security
- **Environment Variables**: Access to environment configuration
- **Clocks**: Wall clock and monotonic time sources
- **Random Number Generation**: Cryptographically secure randomness
- **Standard I/O**: stdin, stdout, stderr support

### WASI Capabilities

Echelon implements WASI Preview 1 with the following capabilities:

```typescript
// framework/runtime/wasi.ts
export interface WASICapabilities {
  // Filesystem capabilities
  preopenedDirectories?: Map<string, string>; // Map of virtual paths to real paths
  allowRead?: boolean;                         // Allow fd_read operations
  allowWrite?: boolean;                        // Allow fd_write operations

  // Environment capabilities
  env?: Record<string, string>;                // Environment variables
  args?: string[];                             // Command-line arguments

  // Clock capabilities
  allowClockGet?: boolean;                     // Allow clock_time_get

  // Random capabilities
  allowRandom?: boolean;                       // Allow random_get

  // Exit capabilities
  allowExit?: boolean;                         // Allow proc_exit
}
```

### Security Model

WASI uses **capability-based security**:

1. **Preopened Directories**: Only explicitly granted directories are accessible
2. **No Ambient Authority**: No implicit access to filesystem or system resources
3. **Explicit Grants**: Each capability must be explicitly granted
4. **Sandboxed by Default**: Modules have zero capabilities unless granted

```typescript
// Create WASI context with limited capabilities
const wasi = new WASI({
  preopenedDirectories: new Map([
    ['/data', '/var/app/data'],      // Map /data → real directory
    ['/tmp', '/tmp/wasm-sandbox']    // Map /tmp → sandbox directory
  ]),
  allowRead: true,
  allowWrite: true,
  env: {
    'NODE_ENV': 'production',
    'API_KEY': Deno.env.get('API_KEY')
  },
  args: ['--config', 'production.json'],
  allowClockGet: true,
  allowRandom: true,
  allowExit: false  // Prevent proc_exit from terminating Deno process
});

// Instantiate WASM module with WASI
const module = await app.wasm.loadModule({
  type: 'file',
  value: './file-processor.wasm'
});

await app.wasm.instantiate(module.id, {
  imports: wasi.getImports() // Provides wasi_snapshot_preview1 imports
});
```

### WASI Implementation

#### Filesystem Operations

```rust
// Rust code compiled to WASM with WASI
use std::fs::File;
use std::io::{Read, Write};

fn main() {
    // This path maps to preoped directory
    let mut file = File::create("/data/output.txt").unwrap();
    file.write_all(b"Hello from WASM+WASI!").unwrap();

    let mut contents = String::new();
    let mut file = File::open("/data/input.txt").unwrap();
    file.read_to_string(&mut contents).unwrap();

    println!("File contents: {}", contents);
}
```

```typescript
// Echelon runtime
const wasi = new WASI({
  preopenedDirectories: new Map([
    ['/data', './app_data']  // Maps WASM /data to ./app_data
  ]),
  allowRead: true,
  allowWrite: true
});

const module = await app.wasm.loadModule({
  type: 'file',
  value: './file-processor.wasm'
});

await app.wasm.instantiate(module.id, {
  imports: wasi.getImports()
});

// Execute - file operations work within sandbox
await app.wasm.execute(module.id, '_start', []);

// WASM wrote to ./app_data/output.txt
const output = await Deno.readTextFile('./app_data/output.txt');
console.log(output); // "Hello from WASM+WASI!"
```

#### Environment Variables

```rust
// Rust code
use std::env;

fn main() {
    let api_key = env::var("API_KEY").unwrap();
    let env_type = env::var("NODE_ENV").unwrap();
    println!("Running in {} mode", env_type);
}
```

```typescript
// Echelon runtime
const wasi = new WASI({
  env: {
    'NODE_ENV': 'production',
    'API_KEY': Deno.env.get('API_KEY')
  }
});
```

#### Clock Operations

```rust
// Rust code
use std::time::SystemTime;

fn main() {
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap();
    println!("Unix timestamp: {}", now.as_secs());
}
```

```typescript
// Echelon runtime
const wasi = new WASI({
  allowClockGet: true  // Grants access to clock_time_get
});
```

#### Random Number Generation

```rust
// Rust code
use rand::Rng;

fn main() {
    let mut rng = rand::thread_rng();
    let random_number: u32 = rng.gen();
    println!("Random: {}", random_number);
}
```

```typescript
// Echelon runtime
const wasi = new WASI({
  allowRandom: true  // Grants access to random_get (Web Crypto API)
});
```

### WASI Use Cases

#### File Processing Pipeline

```typescript
// Load file processor compiled from Rust
const processor = await app.wasm.loadModule({
  type: 'file',
  value: './processors/csv-transformer.wasm'
});

const wasi = new WASI({
  preopenedDirectories: new Map([
    ['/input', './uploads'],
    ['/output', './processed']
  ]),
  allowRead: true,
  allowWrite: true,
  env: {
    'INPUT_FILE': 'data.csv',
    'OUTPUT_FILE': 'transformed.csv'
  }
});

await app.wasm.instantiate(processor.id, {
  imports: wasi.getImports()
});

await app.wasm.execute(processor.id, '_start', []);
// CSV file processed and written to ./processed/transformed.csv
```

#### Configuration-Driven Processing

```typescript
// Pass configuration via environment
const wasi = new WASI({
  preopenedDirectories: new Map([['/data', './data']]),
  env: {
    'MAX_ITEMS': '1000',
    'ENABLE_COMPRESSION': 'true',
    'OUTPUT_FORMAT': 'json'
  },
  args: ['process', '--verbose']
});
```

---

## Security Model

### Deno Permission Integration

Echelon's WASM security model integrates with Deno's permission system:

```typescript
// Deno permissions required for WASM operations
// deno run --allow-read --allow-env --allow-net main.ts

const app = new Application();

// WASM module can only access what Deno process can access
const wasi = new WASI({
  preopenedDirectories: new Map([
    ['/data', './data'] // Requires --allow-read=./data
  ]),
  env: {
    'API_KEY': Deno.env.get('API_KEY') // Requires --allow-env=API_KEY
  }
});
```

**Permission Hierarchy**:
1. **Deno Process Permissions**: What the Deno process can do
2. **WASM Sandbox Capabilities**: What WASM modules within process can do
3. **WASI Grants**: What filesystem/env access is allowed

### Resource Limits

#### Memory Limits

```typescript
const sandbox = app.wasm.createSandbox({
  memoryLimit: 16 * 1024 * 1024, // 16MB max
  capabilities: ['memory']
});

// Module cannot allocate more than 16MB
```

#### CPU Limits

```typescript
const sandbox = app.wasm.createSandbox({
  cpuLimit: {
    maxInstructions: 1_000_000,  // Max 1M instructions
    maxCallDepth: 1000,          // Max call stack depth
    interruptInterval: 1000      // Check every 1000 instructions
  },
  capabilities: []
});
```

#### Timeout Limits

```typescript
// Execution timeout
const result = await app.wasm.execute(
  'module',
  'function',
  [],
  { timeout: 5000 } // 5 second timeout
);
```

### Untrusted Code Execution

Echelon can safely execute untrusted third-party WASM modules:

```typescript
// Execute untrusted plugin with strict sandbox
const sandbox = app.wasm.createSandbox({
  memoryLimit: 8 * 1024 * 1024,  // 8MB limit
  timeLimit: 3000,                // 3 second limit
  capabilities: [
    'memory',        // Only memory access
    'console'        // Only console logging
  ],
  allowedHostFunctions: [
    'env.log'        // Only allow specific host functions
  ],
  deniedHostFunctions: [
    'env.fetch',     // Deny network access
    'env.readFile'   // Deny file access
  ]
});

// Load untrusted plugin
const plugin = await app.wasm.loadModule({
  type: 'url',
  value: 'https://untrusted-plugins.com/image-filter.wasm'
});

await app.wasm.instantiate(plugin.id, {
  sandboxId: sandbox.id
});

// Execute safely - violations logged and execution halted
const result = await app.wasm.execute(
  plugin.id,
  'apply_filter',
  [imageDataPointer],
  { sandboxId: sandbox.id }
);
```

### Capability Types

```typescript
// framework/runtime/wasm_types.ts:193-210
export type WASMCapability =
  | 'memory'          // Access to shared memory
  | 'threads'         // Multi-threading (SharedArrayBuffer)
  | 'simd'            // SIMD instructions
  | 'bulk-memory'     // Bulk memory operations
  | 'reference-types' // Reference types
  | 'tail-call'       // Tail call optimization
  | 'exception-handling' // Exception handling
  | 'host-functions'  // Call host functions
  | 'file-read'       // Read file system (via host)
  | 'file-write'      // Write file system (via host)
  | 'network'         // Network access (via host)
  | 'env'             // Environment variables (via host)
  | 'kv-read'         // Read from Deno KV (via host)
  | 'kv-write'        // Write to Deno KV (via host)
  | 'crypto'          // Crypto operations (via host)
  | 'console';        // Console logging (via host)
```

---

## WASM Generator

Echelon supports **BOTH TypeScript/AssemblyScript AND Rust** toolchains for WASM generation.

### TypeScript/AssemblyScript Generator

#### Simple TypeScript to WASM

```typescript
// Define TypeScript-like code
const source = `
export function factorial(n: i32): i32 {
  if (n <= 1) {
    return 1;
  }
  return n * factorial(n - 1);
}

export function isPrime(n: i32): i32 {
  if (n <= 1) return 0;
  for (let i: i32 = 2; i * i <= n; i = i + 1) {
    if (n % i === 0) return 0;
  }
  return 1;
}
`;

// Generate WASM
const result = await app.wasm.generator.generate({
  type: 'typescript',
  code: source,
  options: {
    optimize: true,
    optimizationLevel: 'speed',
    validate: true
  }
});

if (result.success && result.wasm) {
  // Load generated module
  const module = await app.wasm.loadModule({
    type: 'bytes',
    value: result.wasm,
    moduleId: 'math-generated'
  });

  // Use immediately
  const fact = await app.wasm.execute<number>(
    'math-generated',
    'factorial',
    [5]
  );
  console.log(fact.value); // 120
}
```

#### Template-Based Generation

```typescript
// Built-in template: mathFunction
const result = await app.wasm.generator.generateFromTemplate(
  'mathFunction',
  {
    name: 'multiply',
    operation: 'mul',
    type: 'i32'
  }
);

// Custom template
app.wasm.generator.registerTemplate({
  name: 'httpHandler',
  description: 'Generate HTTP request handler',
  parameters: [
    { name: 'route', type: 'string', required: true },
    { name: 'method', type: 'string', default: 'GET' }
  ],
  generate: (params) => {
    // Return WASMModuleDef
    return {
      functions: [/* ... */],
      globals: [],
      imports: [],
      exports: []
    };
  }
});
```

### Rust Toolchain Integration

Echelon integrates with the Rust WASM ecosystem via `wasmbuild`:

#### Rust Project Setup

```bash
# Create Rust library
cargo init --lib wasm_image_processor
cd wasm_image_processor

# Add WASM dependencies to Cargo.toml
```

```toml
[package]
name = "wasm_image_processor"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2"
image = "0.24"
```

```rust
// src/lib.rs
use wasm_bindgen::prelude::*;
use image::{ImageBuffer, Rgba};

#[wasm_bindgen]
pub fn apply_grayscale(
    pixels: &[u8],
    width: u32,
    height: u32
) -> Vec<u8> {
    let img = ImageBuffer::<Rgba<u8>, _>::from_raw(
        width,
        height,
        pixels.to_vec()
    ).unwrap();

    let gray = image::imageops::grayscale(&img);
    gray.into_raw()
}

#[wasm_bindgen]
pub fn resize_image(
    pixels: &[u8],
    width: u32,
    height: u32,
    new_width: u32,
    new_height: u32
) -> Vec<u8> {
    let img = ImageBuffer::<Rgba<u8>, _>::from_raw(
        width,
        height,
        pixels.to_vec()
    ).unwrap();

    let resized = image::imageops::resize(
        &img,
        new_width,
        new_height,
        image::imageops::FilterType::Lanczos3
    );
    resized.into_raw()
}
```

#### Build with Echelon

```typescript
// framework/plugin/wasmbuild_compiler.ts
const result = await app.wasm.generator.compileRust({
  projectPath: './wasm_image_processor',
  output: './wasm_modules/image_processor.wasm',
  options: {
    release: true,           // Build with optimizations
    target: 'wasm32-unknown-unknown',
    features: ['simd'],      // Enable SIMD features
    wasmBindgen: true,       // Use wasm-bindgen
    wasmOpt: {
      level: 3,              // Optimization level (0-4)
      shrink: true           // Optimize for size
    }
  }
});

if (result.success) {
  console.log('Built:', result.outputPath);
  console.log('Size:', result.size, 'bytes');
}
```

#### Load and Use Rust WASM

```typescript
// Load Rust-compiled WASM
const module = await app.wasm.loadModule({
  type: 'file',
  value: './wasm_modules/image_processor.wasm'
});

// Execute Rust functions
const imageData = new Uint8ClampedArray(/* ... */);
const grayscale = await app.wasm.execute<Uint8Array>(
  'image_processor',
  'apply_grayscale',
  [imageData, 800, 600]
);
```

### WAT (WebAssembly Text Format) Compiler

For low-level control, compile WAT directly:

```typescript
const watSource = `
(module
  (func $add (param $a i32) (param $b i32) (result i32)
    local.get $a
    local.get $b
    i32.add
  )
  (export "add" (func $add))
)
`;

const result = await app.wasm.generator.generate({
  type: 'wat',
  code: watSource,
  options: {
    validate: true,
    optimize: true,
    optimizationLevel: 'size'
  }
});

// Load compiled WAT
const module = await app.wasm.loadModule({
  type: 'bytes',
  value: result.wasm!
});
```

### Optimization Levels

```typescript
// framework/runtime/wasm_types.ts:300
export type WASMOptimizationLevel = 'none' | 'size' | 'speed' | 'aggressive';

// Size optimization (smallest binary)
await app.wasm.generator.optimize(wasmBytes, 'size');

// Speed optimization (fastest execution)
await app.wasm.generator.optimize(wasmBytes, 'speed');

// Aggressive optimization (both size and speed)
await app.wasm.generator.optimize(wasmBytes, 'aggressive');
```

---

## Native-Level Browser Bindings

Rust WASM modules can access browser APIs directly using `wasm-bindgen`:

### DOM Manipulation

```rust
use wasm_bindgen::prelude::*;
use web_sys::{Document, Element, HtmlElement};

#[wasm_bindgen]
pub fn create_button(text: &str) -> Result<(), JsValue> {
    let window = web_sys::window().unwrap();
    let document = window.document().unwrap();

    let button: HtmlElement = document
        .create_element("button")?
        .dyn_into()?;

    button.set_inner_text(text);
    button.set_class_name("btn btn-primary");

    let body = document.body().unwrap();
    body.append_child(&button)?;

    Ok(())
}

#[wasm_bindgen]
pub fn get_element_text(id: &str) -> String {
    let document = web_sys::window().unwrap().document().unwrap();
    let element = document.get_element_by_id(id).unwrap();
    element.text_content().unwrap_or_default()
}
```

### Canvas Rendering

```rust
use wasm_bindgen::prelude::*;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement};

#[wasm_bindgen]
pub fn draw_mandelbrot(
    canvas_id: &str,
    max_iterations: u32
) -> Result<(), JsValue> {
    let document = web_sys::window().unwrap().document().unwrap();
    let canvas: HtmlCanvasElement = document
        .get_element_by_id(canvas_id)
        .unwrap()
        .dyn_into()?;

    let context: CanvasRenderingContext2d = canvas
        .get_context("2d")?
        .unwrap()
        .dyn_into()?;

    let width = canvas.width();
    let height = canvas.height();

    for py in 0..height {
        for px in 0..width {
            let x0 = (px as f64 / width as f64) * 3.5 - 2.5;
            let y0 = (py as f64 / height as f64) * 2.0 - 1.0;

            let mut x = 0.0;
            let mut y = 0.0;
            let mut iteration = 0;

            while x*x + y*y <= 4.0 && iteration < max_iterations {
                let xtemp = x*x - y*y + x0;
                y = 2.0*x*y + y0;
                x = xtemp;
                iteration += 1;
            }

            let color = if iteration == max_iterations {
                "rgb(0, 0, 0)"
            } else {
                &format!("rgb({}, {}, {})",
                    (iteration * 8) % 256,
                    (iteration * 16) % 256,
                    (iteration * 32) % 256)
            };

            context.set_fill_style(&JsValue::from_str(color));
            context.fill_rect(px as f64, py as f64, 1.0, 1.0);
        }
    }

    Ok(())
}
```

### Fetch API

```rust
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use web_sys::{Request, RequestInit, Response};

#[wasm_bindgen]
pub async fn fetch_json(url: &str) -> Result<JsValue, JsValue> {
    let mut opts = RequestInit::new();
    opts.method("GET");

    let request = Request::new_with_str_and_init(url, &opts)?;
    request.headers().set("Accept", "application/json")?;

    let window = web_sys::window().unwrap();
    let resp_value = JsFuture::from(window.fetch_with_request(&request)).await?;
    let resp: Response = resp_value.dyn_into()?;

    let json = JsFuture::from(resp.json()?).await?;
    Ok(json)
}
```

### WebSocket

```rust
use wasm_bindgen::prelude::*;
use web_sys::{WebSocket, MessageEvent, ErrorEvent};

#[wasm_bindgen]
pub struct WsClient {
    ws: WebSocket,
}

#[wasm_bindgen]
impl WsClient {
    #[wasm_bindgen(constructor)]
    pub fn new(url: &str) -> Result<WsClient, JsValue> {
        let ws = WebSocket::new(url)?;

        // Set binary type to arraybuffer
        ws.set_binary_type(web_sys::BinaryType::Arraybuffer);

        Ok(WsClient { ws })
    }

    pub fn send(&self, message: &str) -> Result<(), JsValue> {
        self.ws.send_with_str(message)
    }

    pub fn on_message(&self, callback: &js_sys::Function) {
        let onmessage = Closure::wrap(Box::new(move |e: MessageEvent| {
            callback.call1(&JsValue::NULL, &e.data()).unwrap();
        }) as Box<dyn FnMut(MessageEvent)>);

        self.ws.set_onmessage(Some(onmessage.as_ref().unchecked_ref()));
        onmessage.forget();
    }
}
```

### Building for Browser

```typescript
// Build Rust WASM for browser with all bindings
const result = await app.wasm.generator.compileRust({
  projectPath: './browser-app',
  output: './static/wasm/app.wasm',
  options: {
    release: true,
    target: 'wasm32-unknown-unknown',
    wasmBindgen: true,
    wasmBindgenOptions: {
      target: 'web',           // Browser target
      outDir: './static/wasm', // Output directory
      outName: 'app',          // app.js and app_bg.wasm
      typescript: true         // Generate TypeScript definitions
    }
  }
});
```

```html
<!-- Use in browser -->
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>WASM App</title>
</head>
<body>
    <canvas id="canvas" width="800" height="600"></canvas>
    <script type="module">
        import init, { draw_mandelbrot } from './wasm/app.js';

        async function run() {
            await init(); // Initialize WASM
            draw_mandelbrot('canvas', 100);
        }

        run();
    </script>
</body>
</html>
```

---

## Use Cases

### 1. High-Performance Plugin System

**Scenario**: Allow users to upload custom data transformation plugins.

```typescript
// Server-side: Load and execute user plugin
async function handlePluginUpload(file: File) {
  // Validate WASM module
  const bytes = await file.arrayBuffer();
  const validation = await app.wasm.generator.validate(
    new Uint8Array(bytes)
  );

  if (!validation.valid) {
    throw new Error('Invalid WASM module');
  }

  // Create strict sandbox
  const sandbox = app.wasm.createSandbox({
    memoryLimit: 10 * 1024 * 1024, // 10MB
    timeLimit: 5000,                // 5 seconds
    capabilities: ['memory', 'console'],
    allowedHostFunctions: ['env.log']
  });

  // Load plugin
  const module = await app.wasm.loadModule({
    type: 'bytes',
    value: new Uint8Array(bytes),
    moduleId: `plugin-${crypto.randomUUID()}`
  });

  await app.wasm.instantiate(module.id, {
    sandboxId: sandbox.id
  });

  return module.id;
}

// Execute plugin on data
async function transformData(pluginId: string, data: unknown) {
  // Serialize data to WASM memory
  const dataStr = JSON.stringify(data);
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(dataStr);

  // Execute plugin transformation
  const result = await app.wasm.execute<Uint8Array>(
    pluginId,
    'transform',
    [dataBytes],
    { timeout: 5000 }
  );

  // Deserialize result
  const decoder = new TextDecoder();
  const resultStr = decoder.decode(result.value);
  return JSON.parse(resultStr);
}
```

### 2. Image Processing Pipeline

**Scenario**: Resize and optimize uploaded images.

```rust
// Rust image processor
use image::{ImageBuffer, Rgba, imageops};

#[wasm_bindgen]
pub fn process_image(
    pixels: &[u8],
    width: u32,
    height: u32,
    max_width: u32,
    max_height: u32,
    quality: u8
) -> Vec<u8> {
    // Load image from pixels
    let img = ImageBuffer::<Rgba<u8>, _>::from_raw(
        width, height, pixels.to_vec()
    ).unwrap();

    // Calculate aspect-preserving dimensions
    let (new_width, new_height) = if width > max_width || height > max_height {
        let ratio = (max_width as f32 / width as f32)
            .min(max_height as f32 / height as f32);
        ((width as f32 * ratio) as u32, (height as f32 * ratio) as u32)
    } else {
        (width, height)
    };

    // Resize with high-quality filter
    let resized = imageops::resize(
        &img,
        new_width,
        new_height,
        imageops::FilterType::Lanczos3
    );

    // Optimize and return
    resized.into_raw()
}
```

```typescript
// Echelon handler
app.post('/upload', async (ctx) => {
  const formData = await ctx.request.formData();
  const file = formData.get('image') as File;

  // Read image data
  const buffer = await file.arrayBuffer();
  const pixels = new Uint8Array(buffer);

  // Decode image dimensions (simplified)
  const { width, height } = await decodeImageDimensions(pixels);

  // Process with WASM
  const processed = await app.wasm.execute<Uint8Array>(
    'image-processor',
    'process_image',
    [pixels, width, height, 1920, 1080, 85]
  );

  // Save processed image
  const filename = `processed-${crypto.randomUUID()}.jpg`;
  await Deno.writeFile(`./uploads/${filename}`, processed.value!);

  return ctx.json({ filename, size: processed.value!.length });
});
```

### 3. Real-Time Data Transformation

**Scenario**: Transform streaming data in real-time.

```typescript
// WebSocket handler with WASM transformation
app.ws('/stream', async (ws) => {
  // Load transformation module
  const module = await app.wasm.loadModule({
    type: 'file',
    value: './wasm_modules/data_transformer.wasm'
  });

  ws.on('message', async (data) => {
    // Transform data with WASM
    const result = await app.wasm.execute<Uint8Array>(
      module.id,
      'transform',
      [new Uint8Array(data as ArrayBuffer)],
      { timeout: 100 } // 100ms timeout for real-time
    );

    if (result.success) {
      ws.send(result.value);
    }
  });
});
```

### 4. Cryptographic Operations

**Scenario**: Custom encryption algorithm.

```rust
use aes::Aes256;
use aes::cipher::{BlockEncrypt, BlockDecrypt, KeyInit, generic_array::GenericArray};

#[wasm_bindgen]
pub fn encrypt_block(key: &[u8], plaintext: &[u8]) -> Vec<u8> {
    let key = GenericArray::from_slice(key);
    let cipher = Aes256::new(key);

    let mut block = GenericArray::clone_from_slice(plaintext);
    cipher.encrypt_block(&mut block);

    block.to_vec()
}

#[wasm_bindgen]
pub fn decrypt_block(key: &[u8], ciphertext: &[u8]) -> Vec<u8> {
    let key = GenericArray::from_slice(key);
    let cipher = Aes256::new(key);

    let mut block = GenericArray::clone_from_slice(ciphertext);
    cipher.decrypt_block(&mut block);

    block.to_vec()
}
```

### 5. Scientific Computing

**Scenario**: Monte Carlo simulation.

```typescript
const source = `
export function monteCarloPI(iterations: i32): f64 {
  let inside: i32 = 0;

  for (let i: i32 = 0; i < iterations; i = i + 1) {
    const x: f64 = Math.random();
    const y: f64 = Math.random();

    if (x * x + y * y <= 1.0) {
      inside = inside + 1;
    }
  }

  return 4.0 * (inside as f64) / (iterations as f64);
}
`;

// Generate and load
const result = await app.wasm.generator.generate({
  type: 'typescript',
  code: source
});

const module = await app.wasm.loadModule({
  type: 'bytes',
  value: result.wasm!
});

// Run simulation
const pi = await app.wasm.execute<number>(
  module.id,
  'monteCarloPI',
  [10_000_000] // 10 million iterations
);

console.log('Estimated π:', pi.value); // ~3.14159
```

### 6. Shared WASM Between Server and Browser

**Scenario**: Same validation logic on server and client.

```rust
// shared-validation/src/lib.rs
use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct User {
    pub email: String,
    pub age: u32,
}

#[wasm_bindgen]
pub fn validate_user(json: &str) -> String {
    let user: Result<User, _> = serde_json::from_str(json);

    match user {
        Ok(user) => {
            let mut errors = Vec::new();

            if !user.email.contains('@') {
                errors.push("Invalid email format");
            }

            if user.age < 18 {
                errors.push("Must be 18 or older");
            }

            if errors.is_empty() {
                "valid".to_string()
            } else {
                serde_json::to_string(&errors).unwrap()
            }
        }
        Err(_) => serde_json::to_string(&vec!["Invalid JSON"]).unwrap()
    }
}
```

```typescript
// Server (Deno/Echelon)
const module = await app.wasm.loadModule({
  type: 'file',
  value: './shared_validation.wasm'
});

app.post('/users', async (ctx) => {
  const user = await ctx.request.json();

  const result = await app.wasm.execute<string>(
    'validation',
    'validate_user',
    [JSON.stringify(user)]
  );

  if (result.value === 'valid') {
    // Save user
    return ctx.json({ success: true });
  } else {
    const errors = JSON.parse(result.value!);
    return ctx.json({ errors }, 400);
  }
});
```

```html
<!-- Client (Browser) -->
<script type="module">
import init, { validate_user } from './shared_validation.js';

await init();

document.getElementById('form').addEventListener('submit', (e) => {
  e.preventDefault();

  const user = {
    email: document.getElementById('email').value,
    age: parseInt(document.getElementById('age').value)
  };

  const result = validate_user(JSON.stringify(user));

  if (result === 'valid') {
    // Submit to server
    fetch('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user)
    });
  } else {
    const errors = JSON.parse(result);
    alert(errors.join('\n'));
  }
});
</script>
```

---

## API Reference

### Application WASM API

```typescript
class Application {
  // WASM Runtime Core
  readonly wasm: WASMRuntimeCore;

  // WASM Generator
  readonly wasmGenerator: WASMGeneratorCore;
}
```

### WASMRuntimeCore

```typescript
class WASMRuntimeCore {
  constructor(config?: WASMRuntimeConfig);

  // Module Management
  loadModule(source: WASMSource): Promise<WASMModule>;
  unloadModule(moduleId: string): Promise<void>;
  getModule(moduleId: string): WASMModule | undefined;
  listModules(): WASMModule[];

  // Instantiation
  instantiate(
    moduleId: string,
    options?: WASMInstantiationOptions
  ): Promise<WebAssembly.Instance>;

  // Execution
  execute<T = unknown>(
    moduleId: string,
    funcName: string,
    args: unknown[],
    options?: WASMExecutionOptions
  ): Promise<WASMExecutionResult<T>>;

  // Sandboxing
  createSandbox(config?: Partial<WASMSandboxConfig>): WASMSandbox;
  destroySandbox(sandboxId: string): void;
  getSandbox(sandboxId: string): WASMSandbox | undefined;

  // Host Functions
  registerHostFunction(descriptor: WASMHostFunctionDescriptor): void;
  unregisterHostFunction(module: string, name: string): void;

  // Native Imports (Deno 2.1+)
  registerNativeModule(alias: string, specifier: string): Promise<void>;
  callNative<T>(alias: string, funcName: string, ...args: unknown[]): T;

  // Memory Management
  getMemoryStats(): WASMMemoryStats;

  // Lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;

  // Events
  on(event: WASMEventType, handler: (data: unknown) => void): void;
  off(event: WASMEventType, handler: (data: unknown) => void): void;
}
```

### WASMGeneratorCore

```typescript
class WASMGeneratorCore {
  constructor(events: EventEmitter);

  // Code Generation
  generate(source: WASMGeneratorSource): Promise<WASMGenerationResult>;
  generateFromTypeScript(source: string, options?: WASMGeneratorOptions): Promise<WASMGenerationResult>;
  generateFromWAT(source: string, options?: WASMGeneratorOptions): Promise<WASMGenerationResult>;
  generateFromTemplate(name: string, params: Record<string, unknown>): Promise<Uint8Array>;

  // Rust Compilation
  compileRust(config: RustBuildConfig): Promise<RustBuildResult>;

  // Templates
  registerTemplate(template: WASMTemplate): void;
  unregisterTemplate(name: string): void;
  getTemplates(): WASMTemplate[];

  // Optimization
  optimize(wasm: Uint8Array, level?: WASMOptimizationLevel): Promise<{ wasm: Uint8Array; stats: OptimizationStats }>;

  // Validation
  validate(wasm: Uint8Array): Promise<{ valid: boolean; errors: string[] }>;

  // Utilities
  compileExpression(expr: string, resultType?: WASMValueType): WASMCompilationResult;
  createModuleBuilder(): WASMModuleBuilder;
  getCodegen(): WASMCodegen;
}
```

### Type Definitions

```typescript
interface WASMSource {
  type: WASMSourceType;
  value: string | Uint8Array;
  moduleId?: string;
}

interface WASMModule {
  id: string;
  info: WASMModuleInfo;
  compiledModule: WebAssembly.Module;
  instance?: WebAssembly.Instance;
  memory?: WebAssembly.Memory;
  sandbox?: string;
}

interface WASMExecutionResult<T = unknown> {
  success: boolean;
  value?: T;
  error?: Error;
  duration: number;
  gasUsed?: number;
  memoryUsed: number;
}

interface WASMSandboxConfig {
  id?: string;
  memoryLimit: number;
  cpuLimit?: WASMCPULimit;
  timeLimit?: number;
  capabilities: WASMCapability[];
  allowedHostFunctions?: string[];
  deniedHostFunctions?: string[];
}

interface WASMHostFunctionDescriptor {
  name: string;
  module: string;
  func: WASMHostFunction;
  signature: WASMFunctionSignature;
  async?: boolean;
}
```

---

## Testing & Debugging

### Unit Testing WASM Modules

```typescript
// tests/wasm/math_test.ts
import { assertEquals } from 'jsr:@std/assert';
import { Application } from '@echelon/app';

Deno.test('WASM math module - add function', async () => {
  const app = new Application();

  const module = await app.wasm.loadModule({
    type: 'file',
    value: './wasm_modules/math.wasm'
  });

  const result = await app.wasm.execute<number>(
    module.id,
    'add',
    [5, 3]
  );

  assertEquals(result.success, true);
  assertEquals(result.value, 8);
});

Deno.test('WASM math module - handles overflow', async () => {
  const app = new Application();

  const module = await app.wasm.loadModule({
    type: 'file',
    value: './wasm_modules/math.wasm'
  });

  const result = await app.wasm.execute<number>(
    module.id,
    'add',
    [2147483647, 1] // i32 max + 1
  );

  // Should wrap around
  assertEquals(result.value, -2147483648);
});
```

### Integration Testing

```typescript
// tests/integration/plugin_system_test.ts
import { assertEquals } from 'jsr:@std/assert';
import { Application } from '@echelon/app';

Deno.test('Plugin system - load and execute untrusted plugin', async () => {
  const app = new Application();

  // Create sandbox
  const sandbox = app.wasm.createSandbox({
    memoryLimit: 5 * 1024 * 1024,
    timeLimit: 1000,
    capabilities: ['memory']
  });

  // Load plugin
  const plugin = await app.wasm.loadModule({
    type: 'url',
    value: 'http://localhost:8000/test-plugin.wasm'
  });

  await app.wasm.instantiate(plugin.id, {
    sandboxId: sandbox.id
  });

  // Execute
  const result = await app.wasm.execute<number>(
    plugin.id,
    'process',
    [42],
    { timeout: 1000 }
  );

  assertEquals(result.success, true);
  assertEquals(result.duration < 1000, true);
});
```

### Debugging WASM Execution

```typescript
// Enable debug logging
const app = new Application({
  wasm: {
    enableMetrics: true
  }
});

// Listen to WASM events
app.wasm.on('wasm:module:loaded', (data) => {
  console.log('Module loaded:', data);
});

app.wasm.on('wasm:exec:start', (data) => {
  console.log('Execution started:', data);
});

app.wasm.on('wasm:exec:complete', (data) => {
  console.log('Execution completed:', data);
});

app.wasm.on('wasm:exec:error', (data) => {
  console.error('Execution error:', data);
});

app.wasm.on('wasm:sandbox:violation', (violation) => {
  console.error('Sandbox violation:', violation);
});

// Execute with metrics
const result = await app.wasm.execute('module', 'func', []);
console.log({
  success: result.success,
  duration: result.duration,
  memoryUsed: result.memoryUsed,
  gasUsed: result.gasUsed
});
```

### Performance Profiling

```typescript
// Get runtime statistics
const stats = {
  memory: app.wasm.getMemoryStats(),
  modules: app.wasm.listModules().map(m => ({
    id: m.id,
    size: m.info.size,
    loadedAt: m.info.loadedAt,
    executionCount: m.info.executionCount,
    lastExecuted: m.info.lastExecuted
  }))
};

console.table(stats.modules);

// Cache statistics
const cacheStats = app.wasm.loader.getCacheStats();
console.log({
  cacheSize: cacheStats.size,
  maxSize: cacheStats.maxSize,
  entries: cacheStats.entries.map(e => ({
    moduleId: e.moduleId,
    size: e.size,
    accessCount: e.accessCount
  }))
});
```

---

## Migration Guide

### From Pure JavaScript/TypeScript

**Before** (JavaScript):
```typescript
function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

const result = fibonacci(40); // ~1500ms
```

**After** (WASM):
```typescript
const source = `
export function fibonacci(n: i32): i32 {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
`;

const generated = await app.wasm.generator.generate({
  type: 'typescript',
  code: source,
  options: { optimize: true, optimizationLevel: 'speed' }
});

const module = await app.wasm.loadModule({
  type: 'bytes',
  value: generated.wasm!
});

const result = await app.wasm.execute<number>(
  module.id,
  'fibonacci',
  [40]
); // ~300ms (5x faster)
```

### From External WASM Libraries

**Before** (Manual WASM loading):
```typescript
const wasmBytes = await Deno.readFile('./external.wasm');
const wasmModule = await WebAssembly.compile(wasmBytes);
const instance = await WebAssembly.instantiate(wasmModule, {});
const result = instance.exports.compute(42);
```

**After** (Echelon):
```typescript
const module = await app.wasm.loadModule({
  type: 'file',
  value: './external.wasm'
});

const result = await app.wasm.execute<number>(
  module.id,
  'compute',
  [42],
  { timeout: 5000 } // Automatic timeout, metrics, sandboxing
);
```

### Adding WASI Support

**Before** (No WASI):
```rust
// Limited to pure computation
#[wasm_bindgen]
pub fn compute(x: i32) -> i32 {
  x * 2
}
```

**After** (With WASI):
```rust
// Full filesystem, environment, etc.
use std::fs::File;
use std::io::Write;

fn main() {
  let mut file = File::create("/data/output.txt").unwrap();
  file.write_all(b"Hello from WASM+WASI!").unwrap();
}
```

```typescript
const wasi = new WASI({
  preopenedDirectories: new Map([['/data', './app_data']]),
  allowRead: true,
  allowWrite: true
});

const module = await app.wasm.loadModule({
  type: 'file',
  value: './wasi-app.wasm'
});

await app.wasm.instantiate(module.id, {
  imports: wasi.getImports()
});
```

---

## Performance Optimization

### Streaming Compilation

Use streaming compilation for URL sources (default enabled):

```typescript
// Optimized (streaming)
const module = await app.wasm.loadModule({
  type: 'url',
  value: 'https://cdn.example.com/large-module.wasm'
});
// 40% faster, 60% less memory
```

### Module Caching

Modules are cached by default:

```typescript
// First load: downloads and compiles
const module1 = await app.wasm.loadModule({
  type: 'url',
  value: 'https://example.com/module.wasm'
});

// Second load: instant (from cache)
const module2 = await app.wasm.loadModule({
  type: 'url',
  value: 'https://example.com/module.wasm'
});

// Clear cache if needed
app.wasm.loader.invalidateCache(module1.id);
```

### Optimization Levels

```typescript
// Size optimization
const sizeOpt = await app.wasm.generator.optimize(wasm, 'size');
// ~30% smaller binary

// Speed optimization
const speedOpt = await app.wasm.generator.optimize(wasm, 'speed');
// ~2x faster execution

// Aggressive optimization
const aggressive = await app.wasm.generator.optimize(wasm, 'aggressive');
// Best of both
```

### Concurrent Execution

```typescript
// Configure concurrency limit
const app = new Application({
  wasm: {
    maxConcurrentExecutions: 100 // Adjust based on workload
  }
});

// Execute in parallel
const tasks = Array.from({ length: 1000 }, (_, i) =>
  app.wasm.execute('worker', 'process', [i])
);

// Only 100 execute concurrently
const results = await Promise.all(tasks);
```

---

## Conclusion

WebAssembly is a **critical and required** core feature of Echelon, providing:

- ✅ **Multi-language support** (TypeScript/AssemblyScript AND Rust)
- ✅ **WASI support** (full system interface)
- ✅ **Capability-based security** (sandboxed execution)
- ✅ **Native browser bindings** (DOM, Canvas, Fetch, WebSocket)
- ✅ **Production-ready APIs** (stable, well-tested)

This integration enables high-performance computing, safe plugin systems, and code portability between server and client - all fundamental to Echelon's architecture.
