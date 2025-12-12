/**
 * WASM Demo Routes
 *
 * Comprehensive demonstration of Echelon's WASM capabilities:
 * - Module loading from multiple sources
 * - Basic execution
 * - Sandboxed execution with capability restrictions
 * - Code generation from TypeScript and Rust
 * - Memory management and limits
 * - Metrics and monitoring
 *
 * @module
 */

import type { Context } from '@echelon/http/types.ts';
import type { Application } from '@echelon/app.ts';

/**
 * Helper to create JSON responses
 */
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function setupWasmDemoRoutes(app: Application) {
  // ==========================================================================
  // Basic WASM Execution
  // ==========================================================================

  /**
   * GET /api/wasm/demo/basic
   * Demonstrates basic WASM module loading and execution
   */
  app.get('/api/wasm/demo/basic', async (_ctx: Context) => {
    try {
      // Load and instantiate the simple add module
      const module = await app.wasm.loadAndInstantiate({
        type: 'file',
        value: './wasm_modules/simple_add.wasm',
        moduleId: 'simple-add',
      });

      // Execute the add function
      const result = await app.wasm.execute<number>(
        module.id,
        'add',
        [42, 58]
      );

      return json({
        success: true,
        demo: 'basic-execution',
        operation: 'add(42, 58)',
        result: result.value,
        executionTime: `${result.duration}ms`,
        memoryUsed: `${result.memoryUsed} bytes`,
        moduleInfo: module.info,
      });
    } catch (error) {
      return json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        note: 'Run: cd wasm_modules && deno run --allow-write build_with_deno.ts',
      }, 500);
    }
  });

  // ==========================================================================
  // Sandboxed Execution
  // ==========================================================================

  /**
   * POST /api/wasm/demo/sandbox
   * Demonstrates sandboxed WASM execution with memory and time limits
   *
   * Body: { memoryLimit: number, timeLimit: number, operation: string }
   */
  app.post('/api/wasm/demo/sandbox', async (ctx: Context) => {
    try {
      const body = await ctx.request.json();
      const memoryLimit = body.memoryLimit || 5 * 1024 * 1024; // 5MB default
      const timeLimit = body.timeLimit || 2000; // 2 seconds default

      // Create a restricted sandbox
      const sandbox = app.wasm.createSandbox({
        memoryLimit,
        timeLimit,
        capabilities: ['memory', 'console'],
        allowedHostFunctions: ['env.log'],
      });

      // Generate a WASM module on the fly (fibonacci calculator)
      const tsCode = `
        export function fibonacci(n: i32): i32 {
          if (n <= 1) return n;
          let a: i32 = 0;
          let b: i32 = 1;
          for (let i: i32 = 2; i <= n; i++) {
            const temp: i32 = a + b;
            a = b;
            b = temp;
          }
          return b;
        }

        export function memoryTest(size: i32): i32 {
          const arr = new Array<i32>(size);
          for (let i: i32 = 0; i < size; i++) {
            arr[i] = i;
          }
          return arr.length;
        }
      `;

      const compiled = await app.generator.generate({
        type: 'typescript',
        code: tsCode,
        options: {
          optimize: true,
          optimizationLevel: 'speed',
        },
      });

      if (!compiled.success) {
        return json({
          success: false,
          error: 'Code generation failed',
          details: compiled.errors,
        }, 400);
      }

      // Load the generated module into sandbox
      const module = await app.wasm.loadModule({
        type: 'bytes',
        value: compiled.wasm!,
        moduleId: `sandbox-${crypto.randomUUID()}`,
      });

      // Instantiate in sandbox
      await app.wasm.instantiateModule(module.id, {
        sandboxId: sandbox.id,
        imports: {
          env: {
            log: (_ptr: number, _len: number) => {
              console.log(`[Sandboxed WASM] Message from module`);
            },
          },
        },
      });

      // Execute fibonacci in sandbox
      const fibResult = await app.wasm.execute<number>(
        module.id,
        'fibonacci',
        [20]
      );

      return json({
        success: true,
        demo: 'sandboxed-execution',
        sandbox: {
          id: sandbox.id,
          memoryLimit: `${memoryLimit / 1024 / 1024}MB`,
          timeLimit: `${timeLimit}ms`,
          capabilities: sandbox.config.capabilities,
        },
        execution: {
          function: 'fibonacci(20)',
          result: fibResult.value,
          duration: `${fibResult.duration}ms`,
          memoryUsed: `${fibResult.memoryUsed} bytes`,
          withinLimits: fibResult.duration < timeLimit && fibResult.memoryUsed < memoryLimit,
        },
      });
    } catch (error) {
      return json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        type: error instanceof Error ? error.constructor.name : 'unknown',
      }, 500);
    }
  });

  // ==========================================================================
  // Code Generation - TypeScript/AssemblyScript
  // ==========================================================================

  /**
   * POST /api/wasm/demo/generate/typescript
   * Generates WASM from TypeScript/AssemblyScript code
   *
   * Body: { code: string, optimize: boolean }
   */
  app.post('/api/wasm/demo/generate/typescript', async (ctx: Context) => {
    try {
      const body = await ctx.request.json();
      const code = body.code || `
        export function add(a: i32, b: i32): i32 {
          return a + b;
        }

        export function multiply(a: i32, b: i32): i32 {
          return a * b;
        }

        export function factorial(n: i32): i32 {
          if (n <= 1) return 1;
          return n * factorial(n - 1);
        }
      `;

      const optimize = body.optimize !== false;

      // Generate WASM from TypeScript
      const result = await app.generator.generate({
        type: 'typescript',
        code,
        options: {
          optimize,
          optimizationLevel: optimize ? 'speed' : undefined,
        },
      });

      if (!result.success) {
        return json({
          success: false,
          error: 'Compilation failed',
          details: result.errors,
        }, 400);
      }

      // Load and instantiate the generated module
      const module = await app.wasm.loadAndInstantiate({
        type: 'bytes',
        value: result.wasm!,
        moduleId: `generated-ts-${crypto.randomUUID()}`,
      });

      // Test the generated functions
      const addResult = await app.wasm.execute<number>(module.id, 'add', [10, 20]);
      const mulResult = await app.wasm.execute<number>(module.id, 'multiply', [7, 8]);
      const factResult = await app.wasm.execute<number>(module.id, 'factorial', [5]);

      return json({
        success: true,
        demo: 'typescript-code-generation',
        compilation: {
          sourceLines: code.split('\n').length,
          wasmSize: `${result.wasm!.length} bytes`,
          optimized: optimize,
        },
        tests: {
          'add(10, 20)': addResult.value,
          'multiply(7, 8)': mulResult.value,
          'factorial(5)': factResult.value,
        },
        moduleInfo: module.info,
      });
    } catch (error) {
      return json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 500);
    }
  });

  // ==========================================================================
  // Code Generation - Rust
  // ==========================================================================

  /**
   * POST /api/wasm/demo/generate/rust
   * Generates WASM from Rust code
   *
   * Body: { code: string, optimize: boolean }
   */
  app.post('/api/wasm/demo/generate/rust', async (ctx: Context) => {
    try {
      const body = await ctx.request.json();
      const code = body.code || `
        #[no_mangle]
        pub extern "C" fn add(a: i32, b: i32) -> i32 {
          a + b
        }

        #[no_mangle]
        pub extern "C" fn multiply(a: i32, b: i32) -> i32 {
          a * b
        }

        #[no_mangle]
        pub extern "C" fn is_even(n: i32) -> i32 {
          if n % 2 == 0 { 1 } else { 0 }
        }
      `;

      const optimize = body.optimize !== false;

      // Generate WASM from Rust
      const result = await app.generator.generate({
        type: 'rust',
        code,
        options: {
          optimize,
          optimizationLevel: optimize ? 'size' : undefined,
        },
      });

      if (!result.success) {
        return json({
          success: false,
          error: 'Compilation failed',
          details: result.errors,
          note: 'Rust compilation requires rustc with wasm32-unknown-unknown target',
        }, 400);
      }

      // Load and instantiate the generated module
      const module = await app.wasm.loadAndInstantiate({
        type: 'bytes',
        value: result.wasm!,
        moduleId: `generated-rust-${crypto.randomUUID()}`,
      });

      // Test the generated functions
      const addResult = await app.wasm.execute<number>(module.id, 'add', [15, 25]);
      const mulResult = await app.wasm.execute<number>(module.id, 'multiply', [9, 7]);
      const evenResult = await app.wasm.execute<number>(module.id, 'is_even', [42]);

      return json({
        success: true,
        demo: 'rust-code-generation',
        compilation: {
          sourceLines: code.split('\n').length,
          wasmSize: `${result.wasm!.length} bytes`,
          optimized: optimize,
        },
        tests: {
          'add(15, 25)': addResult.value,
          'multiply(9, 7)': mulResult.value,
          'is_even(42)': evenResult.value === 1 ? 'true' : 'false',
        },
        moduleInfo: module.info,
      });
    } catch (error) {
      return json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 500);
    }
  });

  // ==========================================================================
  // Memory Management
  // ==========================================================================

  /**
   * GET /api/wasm/demo/memory
   * Demonstrates memory management and limits
   */
  app.get('/api/wasm/demo/memory', async (_ctx: Context) => {
    try {
      // Create a module that allocates memory
      const tsCode = `
        export function allocateArray(size: i32): i32 {
          const arr = new Array<i32>(size);
          for (let i: i32 = 0; i < size; i++) {
            arr[i] = i * 2;
          }
          let sum: i32 = 0;
          for (let i: i32 = 0; i < size; i++) {
            sum += arr[i];
          }
          return sum;
        }
      `;

      const compiled = await app.generator.generate({
        type: 'typescript',
        code: tsCode,
        options: { optimize: true },
      });

      if (!compiled.success) {
        throw new Error('Compilation failed');
      }

      const module = await app.wasm.loadAndInstantiate({
        type: 'bytes',
        value: compiled.wasm!,
        moduleId: `memory-demo-${crypto.randomUUID()}`,
      });

      // Test with different sizes
      const tests = [100, 1000, 10000];
      const results = [];

      for (const size of tests) {
        const result = await app.wasm.execute<number>(
          module.id,
          'allocateArray',
          [size]
        );

        results.push({
          arraySize: size,
          result: result.value,
          duration: `${result.duration}ms`,
          memoryUsed: `${result.memoryUsed} bytes`,
          memoryUsedKB: `${(result.memoryUsed / 1024).toFixed(2)} KB`,
        });
      }

      return json({
        success: true,
        demo: 'memory-management',
        tests: results,
        moduleMemory: module.memory ? {
          pages: module.memory.buffer.byteLength / (64 * 1024),
          bytes: module.memory.buffer.byteLength,
        } : null,
      });
    } catch (error) {
      return json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 500);
    }
  });

  // ==========================================================================
  // Metrics and Monitoring
  // ==========================================================================

  /**
   * GET /api/wasm/demo/metrics
   * Shows WASM runtime statistics and metrics
   */
  app.get('/api/wasm/demo/metrics', (_ctx: Context) => {
    try {
      const stats = app.wasm.getStats();

      return json({
        success: true,
        demo: 'runtime-metrics',
        globalStats: {
          state: stats.state,
          loadedModules: stats.loadedModules,
          activeExecutions: stats.activeExecutions,
          totalMemory: `${stats.totalMemory} bytes`,
          totalMemoryMB: `${(stats.totalMemory / 1024 / 1024).toFixed(2)} MB`,
          sandboxes: stats.sandboxes,
          cacheSize: stats.cacheSize,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 500);
    }
  });

  // ==========================================================================
  // Comprehensive Demo (All Features)
  // ==========================================================================

  /**
   * POST /api/wasm/demo/comprehensive
   * Runs a comprehensive test of all WASM features
   */
  app.post('/api/wasm/demo/comprehensive', async (_ctx: Context) => {
    try {
      const results: Record<string, unknown> = {};

      // 1. Basic execution test
      results.basicExecution = {
        status: 'testing...',
      };

      const addModule = await app.wasm.loadAndInstantiate({
        type: 'file',
        value: './wasm_modules/simple_add.wasm',
        moduleId: `comprehensive-add-${crypto.randomUUID()}`,
      });

      const addResult = await app.wasm.execute<number>(addModule.id, 'add', [100, 200]);

      results.basicExecution = {
        status: 'success',
        operation: 'add(100, 200)',
        result: addResult.value,
        duration: `${addResult.duration}ms`,
      };

      // 2. Code generation test
      results.codeGeneration = {
        status: 'testing...',
      };

      const fibCode = `
        export function fibonacci(n: i32): i32 {
          if (n <= 1) return n;
          return fibonacci(n - 1) + fibonacci(n - 2);
        }
      `;

      const fibCompiled = await app.generator.generate({
        type: 'typescript',
        code: fibCode,
        options: { optimize: true },
      });

      if (fibCompiled.success) {
        const fibModule = await app.wasm.loadAndInstantiate({
          type: 'bytes',
          value: fibCompiled.wasm!,
          moduleId: `comprehensive-fib-${crypto.randomUUID()}`,
        });

        const fibResult = await app.wasm.execute<number>(fibModule.id, 'fibonacci', [10]);

        results.codeGeneration = {
          status: 'success',
          operation: 'fibonacci(10)',
          result: fibResult.value,
          wasmSize: fibCompiled.wasm!.length,
        };
      } else {
        results.codeGeneration = {
          status: 'failed',
          errors: fibCompiled.errors,
        };
      }

      // 3. Sandboxed execution test
      results.sandboxedExecution = {
        status: 'testing...',
      };

      const sandbox = app.wasm.createSandbox({
        memoryLimit: 10 * 1024 * 1024,
        timeLimit: 1000,
        capabilities: ['memory'],
      });

      results.sandboxedExecution = {
        status: 'success',
        sandboxId: sandbox.id,
        memoryLimit: '10MB',
        timeLimit: '1000ms',
      };

      // 4. Get final metrics
      const finalStats = app.wasm.getStats();

      return json({
        success: true,
        demo: 'comprehensive-test',
        results,
        finalMetrics: {
          loadedModules: finalStats.loadedModules,
          activeExecutions: finalStats.activeExecutions,
          totalMemoryMB: (finalStats.totalMemory / 1024 / 1024).toFixed(2),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      }, 500);
    }
  });

  // ==========================================================================
  // Index / Documentation
  // ==========================================================================

  /**
   * GET /api/wasm/demo
   * Returns available demo endpoints
   */
  app.get('/api/wasm/demo', (_ctx: Context) => {
    return json({
      title: 'Echelon WASM Demo API',
      description: 'Comprehensive demonstration of WebAssembly capabilities in Echelon',
      endpoints: [
        {
          path: 'GET /api/wasm/demo',
          description: 'This documentation',
        },
        {
          path: 'GET /api/wasm/demo/basic',
          description: 'Basic WASM module loading and execution',
        },
        {
          path: 'POST /api/wasm/demo/sandbox',
          description: 'Sandboxed execution with memory and time limits',
          body: { memoryLimit: 'number (bytes)', timeLimit: 'number (ms)' },
        },
        {
          path: 'POST /api/wasm/demo/generate/typescript',
          description: 'Generate WASM from TypeScript/AssemblyScript',
          body: { code: 'string', optimize: 'boolean' },
        },
        {
          path: 'POST /api/wasm/demo/generate/rust',
          description: 'Generate WASM from Rust code',
          body: { code: 'string', optimize: 'boolean' },
        },
        {
          path: 'GET /api/wasm/demo/memory',
          description: 'Memory management demonstration',
        },
        {
          path: 'GET /api/wasm/demo/metrics',
          description: 'Runtime statistics and metrics',
        },
        {
          path: 'POST /api/wasm/demo/comprehensive',
          description: 'Run all tests in sequence',
        },
      ],
      examples: {
        basic: 'curl http://localhost:9090/api/wasm/demo/basic',
        sandbox: 'curl -X POST http://localhost:9090/api/wasm/demo/sandbox -H "Content-Type: application/json" -d \'{"memoryLimit": 5242880, "timeLimit": 2000}\'',
        typescript: 'curl -X POST http://localhost:9090/api/wasm/demo/generate/typescript -H "Content-Type: application/json" -d \'{"code": "export function add(a: i32, b: i32): i32 { return a + b; }"}\'',
      },
    });
  });
}
