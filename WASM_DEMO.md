# Echelon WASM Demo

This document provides a comprehensive guide to the WebAssembly capabilities in Echelon framework.

## Overview

Echelon includes a **foundational WASM runtime** that provides:

1. **Module Loading** - From files, URLs, bytes, base64, and native imports
2. **Execution Engine** - High-performance execution with timeout handling
3. **Sandboxing** - Capability-based security with 17 capability types
4. **Memory Management** - Global and per-module limits with tracking
5. **Code Generation** - TypeScript/AssemblyScript and Rust compilation
6. **Metrics & Telemetry** - Automatic instrumentation for all operations

## Demo Routes

All demo routes are available at `/api/wasm/demo/*`:

### 1. Basic Execution
**GET** `/api/wasm/demo/basic`

Demonstrates loading a WASM module from file and executing a function.

```bash
curl http://localhost:9090/api/wasm/demo/basic
```

**Response:**
```json
{
  "success": true,
  "demo": "basic-execution",
  "operation": "add(42, 58)",
  "result": 100,
  "executionTime": "0.23ms",
  "memoryUsed": "65536 bytes",
  "moduleInfo": {
    "id": "simple-add",
    "source": "file",
    "loaded": "2024-01-15T10:30:00.000Z"
  }
}
```

### 2. Sandboxed Execution
**POST** `/api/wasm/demo/sandbox`

Demonstrates sandboxed execution with memory and time limits.

```bash
curl -X POST http://localhost:9090/api/wasm/demo/sandbox \
  -H "Content-Type: application/json" \
  -d '{
    "memoryLimit": 5242880,
    "timeLimit": 2000
  }'
```

**Response:**
```json
{
  "success": true,
  "demo": "sandboxed-execution",
  "sandbox": {
    "id": "sandbox-uuid",
    "memoryLimit": "5MB",
    "timeLimit": "2000ms",
    "capabilities": ["memory", "console"]
  },
  "execution": {
    "function": "fibonacci(20)",
    "result": 6765,
    "duration": "1.2ms",
    "memoryUsed": "131072 bytes",
    "withinLimits": true
  }
}
```

### 3. TypeScript/AssemblyScript Code Generation
**POST** `/api/wasm/demo/generate/typescript`

Generates WASM from TypeScript/AssemblyScript code on the fly.

```bash
curl -X POST http://localhost:9090/api/wasm/demo/generate/typescript \
  -H "Content-Type: application/json" \
  -d '{
    "code": "export function add(a: i32, b: i32): i32 { return a + b; }",
    "optimize": true
  }'
```

**Response:**
```json
{
  "success": true,
  "demo": "typescript-code-generation",
  "compilation": {
    "sourceLines": 7,
    "wasmSize": "1024 bytes",
    "optimized": true,
    "compilationTime": "45ms"
  },
  "tests": {
    "add(10, 20)": 30,
    "multiply(7, 8)": 56,
    "factorial(5)": 120
  }
}
```

### 4. Rust Code Generation
**POST** `/api/wasm/demo/generate/rust`

Generates WASM from Rust code.

```bash
curl -X POST http://localhost:9090/api/wasm/demo/generate/rust \
  -H "Content-Type: application/json" \
  -d '{
    "code": "#[no_mangle]\npub extern \"C\" fn add(a: i32, b: i32) -> i32 { a + b }",
    "optimize": true
  }'
```

**Response:**
```json
{
  "success": true,
  "demo": "rust-code-generation",
  "compilation": {
    "sourceLines": 9,
    "wasmSize": "2048 bytes",
    "optimized": true
  },
  "tests": {
    "add(15, 25)": 40,
    "multiply(9, 7)": 63,
    "is_even(42)": "true"
  }
}
```

### 5. Memory Management
**GET** `/api/wasm/demo/memory`

Demonstrates memory allocation and tracking.

```bash
curl http://localhost:9090/api/wasm/demo/memory
```

**Response:**
```json
{
  "success": true,
  "demo": "memory-management",
  "tests": [
    {
      "arraySize": 100,
      "result": 9900,
      "duration": "0.15ms",
      "memoryUsed": "65536 bytes",
      "memoryUsedKB": "64.00 KB"
    },
    {
      "arraySize": 1000,
      "result": 999000,
      "duration": "0.42ms",
      "memoryUsed": "131072 bytes",
      "memoryUsedKB": "128.00 KB"
    }
  ],
  "moduleMemory": {
    "pages": 2,
    "bytes": 131072
  }
}
```

### 6. Runtime Metrics
**GET** `/api/wasm/demo/metrics`

Shows WASM runtime statistics and per-module metrics.

```bash
curl http://localhost:9090/api/wasm/demo/metrics
```

**Response:**
```json
{
  "success": true,
  "demo": "runtime-metrics",
  "globalStats": {
    "modulesLoaded": 15,
    "totalExecutions": 342,
    "memoryAllocatedMB": "45.23 MB",
    "memoryUsedMB": "12.45 MB",
    "activeSandboxes": 2
  },
  "moduleStats": {
    "simple-add": {
      "executionCount": 45,
      "avgExecutionTime": "0.23ms",
      "totalExecutionTime": "10.35ms",
      "peakMemoryUsageMB": "0.06 MB"
    }
  }
}
```

### 7. Comprehensive Test
**POST** `/api/wasm/demo/comprehensive`

Runs all tests in sequence.

```bash
curl -X POST http://localhost:9090/api/wasm/demo/comprehensive
```

### 8. Documentation
**GET** `/api/wasm/demo`

Returns API documentation and available endpoints.

```bash
curl http://localhost:9090/api/wasm/demo
```

## Building WASM Modules

### Quick Start (Deno)

```bash
cd wasm_modules
deno run --allow-write build_with_deno.ts
```

This creates a simple WASM module that the demos can use.

### AssemblyScript (Full Build)

```bash
cd wasm_modules

# Install dependencies
npm install

# Build fibonacci.wasm
npm run build

# Build debug version
npm run build:asc:debug
```

**Prerequisites:**
```bash
npm install -g assemblyscript
```

### Rust (Full Build)

```bash
cd wasm_modules/rust_module

# Option 1: Using wasm-pack (recommended)
wasm-pack build --target web --release

# Option 2: Using cargo
cargo build --target wasm32-unknown-unknown --release

# Option 3: Use the build script
chmod +x build.sh
./build.sh
```

**Prerequisites:**
```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add WASM target
rustup target add wasm32-unknown-unknown

# Install wasm-pack (optional but recommended)
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
```

## WASM Modules

### fibonacci.wasm (AssemblyScript)
Mathematical computation module:
- `fibonacci(n: i32): i32` - Calculate nth Fibonacci number
- `fibonacciSum(count: i32): i32` - Sum of first n Fibonacci numbers
- `factorial(n: i32): i32` - Calculate factorial
- `add(a: i32, b: i32): i32` - Add two numbers
- `multiply(a: i32, b: i32): i32` - Multiply two numbers
- `memoryTest(size: i32): i32` - Memory allocation test

### string_utils.wasm (Rust)
String processing module:
- `count_vowels(s: &str): usize` - Count vowels in string
- `reverse_string(s: &str): String` - Reverse a string
- `is_palindrome(s: &str): bool` - Check if palindrome
- `hash_string(s: &str): u32` - Simple string hash
- `longest_word_length(s: &str): usize` - Find longest word
- `word_count(s: &str): usize` - Count words
- `caesar_encrypt(s: &str, shift: u8): String` - Caesar cipher
- `memory_intensive(size: usize): i32` - Memory test

## Using WASM in Your App

### 1. Basic Execution

```typescript
// Load WASM module
const module = await app.wasm.loadModule({
  type: 'file',
  value: './my_module.wasm',
  moduleId: 'my-module'
});

// Instantiate
await app.wasm.instantiate(module.id);

// Execute function
const result = await app.wasm.execute<number>(
  module.id,
  'myFunction',
  [arg1, arg2]
);

console.log(result.value);
console.log(`Execution time: ${result.duration}ms`);
```

### 2. Sandboxed Execution

```typescript
// Create sandbox with limits
const sandbox = app.wasm.createSandbox({
  memoryLimit: 10 * 1024 * 1024,  // 10MB
  timeLimit: 3000,                 // 3 seconds
  capabilities: ['memory', 'console']
});

// Load untrusted code
const plugin = await app.wasm.loadModule({
  type: 'bytes',
  value: userProvidedBytes,
  moduleId: 'user-plugin'
});

// Instantiate in sandbox
await app.wasm.instantiate(plugin.id, {
  sandboxId: sandbox.id
});

// Execute safely
const result = await app.wasm.execute(plugin.id, 'process', [data]);
```

### 3. Code Generation

```typescript
// Generate from TypeScript
const tsResult = await app.wasm.generator.compile({
  type: 'typescript',
  code: 'export function add(a: i32, b: i32): i32 { return a + b; }',
  options: {
    optimize: true,
    optimizationLevel: 'speed'
  }
});

if (tsResult.success) {
  const module = await app.wasm.loadModule({
    type: 'bytes',
    value: tsResult.wasm!,
    moduleId: 'generated'
  });
}

// Generate from Rust
const rustResult = await app.wasm.generator.compile({
  type: 'rust',
  code: '#[no_mangle]\npub extern "C" fn add(a: i32, b: i32) -> i32 { a + b }',
  options: {
    optimize: true,
    optimizationLevel: 'size'
  }
});
```

### 4. Route Handler with WASM

```typescript
app.get('/compute/:n', async (ctx) => {
  const n = parseInt(ctx.params.n || '10');

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

## Configuration

Configure WASM in your Application:

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

## Performance Tips

1. **Use Streaming Compilation** - Enable `preferStreamingCompilation` for 40% faster module loading
2. **Optimize WASM** - Always compile with optimization flags for production
3. **Reuse Modules** - Load modules once and execute multiple times
4. **Monitor Memory** - Use metrics to track memory usage and avoid leaks
5. **Sandbox Untrusted Code** - Always use sandboxing for user-provided WASM

## Documentation

- Architecture: `docs/planning/WASMIntegrationAsACoreFeature.md`
- Runtime Layer: `docs/planning/RuntimeLayer.md`
- Type Definitions: `framework/runtime/wasm_types.ts`
- Demo Routes: `src/routes/wasm_demo.ts`

## Testing

```bash
# Start the server
deno task dev

# Test basic execution
curl http://localhost:9090/api/wasm/demo/basic

# Test sandbox
curl -X POST http://localhost:9090/api/wasm/demo/sandbox \
  -H "Content-Type: application/json" \
  -d '{"memoryLimit": 5242880, "timeLimit": 2000}'

# Get metrics
curl http://localhost:9090/api/wasm/demo/metrics

# Run comprehensive test
curl -X POST http://localhost:9090/api/wasm/demo/comprehensive
```

## Next Steps

1. Build the full fibonacci.wasm module (see "Building WASM Modules" above)
2. Build the Rust string_utils.wasm module
3. Try the code generation endpoints
4. Create your own WASM modules
5. Integrate WASM into your application routes

Enjoy the power of WebAssembly in Echelon! 🚀
