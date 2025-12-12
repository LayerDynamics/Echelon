/**
 * Simple WASM Demo Routes
 *
 * Basic demonstration of Echelon's WASM capabilities using the actual API.
 * This shows module loading, stats, and sandboxing.
 *
 * @module
 */

import type { Context } from '@echelon/http/types.ts';
import type { Application } from '@echelon/app.ts';

/**
 * Helper to create JSON responses from Context
 */
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function setupWasmSimpleDemoRoutes(app: Application) {
  /**
   * GET /api/wasm/demo
   * API documentation
   */
  app.get('/api/wasm/demo', (_ctx: Context) => {
    return jsonResponse({
      title: 'Echelon WASM Demo API',
      description: 'Simple demonstration of WebAssembly capabilities in Echelon',
      endpoints: [
        {
          path: 'GET /api/wasm/demo',
          description: 'This documentation',
        },
        {
          path: 'GET /api/wasm/demo/stats',
          description: 'Get WASM runtime statistics',
        },
        {
          path: 'POST /api/wasm/demo/load',
          description: 'Load a WASM module from file',
          body: { moduleId: 'string', filePath: 'string' },
        },
        {
          path: 'GET /api/wasm/demo/modules',
          description: 'List all loaded modules',
        },
        {
          path: 'POST /api/wasm/demo/sandbox/create',
          description: 'Create a sandbox',
          body: { memoryLimit: 'number (optional)', timeLimit: 'number (optional)' },
        },
      ],
      examples: {
        stats: 'curl http://localhost:9090/api/wasm/demo/stats',
        modules: 'curl http://localhost:9090/api/wasm/demo/modules',
      },
      note: 'Full WASM API is available via app.wasm and includes: loadModule(), createSandbox(), getStats(), listModules()',
    });
  });

  /**
   * GET /api/wasm/demo/stats
   * Get runtime statistics
   */
  app.get('/api/wasm/demo/stats', (_ctx: Context) => {
    try {
      const stats = app.wasm.getStats();

      return jsonResponse({
        success: true,
        demo: 'wasm-runtime-stats',
        stats: {
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
      return jsonResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 500);
    }
  });

  /**
   * POST /api/wasm/demo/load
   * Load a WASM module
   */
  app.post('/api/wasm/demo/load', async (ctx: Context) => {
    try {
      const body = await ctx.request.json();
      const moduleId = body.moduleId || 'simple-add';
      const filePath = body.filePath || './wasm_modules/simple_add.wasm';

      const module = await app.wasm.loadModule({
        type: 'file',
        value: filePath,
        moduleId,
      });

      return jsonResponse({
        success: true,
        demo: 'module-loading',
        module: {
          id: module.id,
          info: module.info,
          exports: module.instance?.exports ? Object.keys(module.instance.exports) : [],
        },
      });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        note: 'Make sure the WASM file exists. Run: cd wasm_modules && deno run --allow-write build_with_deno.ts',
      }, 500);
    }
  });

  /**
   * GET /api/wasm/demo/modules
   * List all loaded modules
   */
  app.get('/api/wasm/demo/modules', (_ctx: Context) => {
    try {
      const modules = app.wasm.listModules();

      return jsonResponse({
        success: true,
        demo: 'list-modules',
        count: modules.length,
        modules: modules.map(m => ({
          id: m.id,
          source: m.source,
          loaded: m.loaded,
          size: m.size,
        })),
      });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 500);
    }
  });

  /**
   * POST /api/wasm/demo/sandbox/create
   * Create a sandbox
   */
  app.post('/api/wasm/demo/sandbox/create', async (ctx: Context) => {
    try {
      const body = await ctx.request.json();

      const sandbox = app.wasm.createSandbox({
        memoryLimit: body.memoryLimit || 10 * 1024 * 1024, // 10MB default
        timeLimit: body.timeLimit || 5000, // 5s default
        capabilities: ['memory', 'console'],
      });

      return jsonResponse({
        success: true,
        demo: 'sandbox-creation',
        sandbox: {
          id: sandbox.id,
          config: {
            memoryLimit: `${sandbox.config.memoryLimit / 1024 / 1024}MB`,
            timeLimit: `${sandbox.config.timeLimit}ms`,
            capabilities: sandbox.config.capabilities,
          },
        },
      });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 500);
    }
  });

  /**
   * GET /api/wasm/demo/memory
   * Get memory usage stats
   */
  app.get('/api/wasm/demo/memory', (_ctx: Context) => {
    try {
      const memoryStats = app.wasm.getMemoryUsage();

      return jsonResponse({
        success: true,
        demo: 'memory-usage',
        stats: {
          total: `${memoryStats.total} bytes`,
          totalMB: `${(memoryStats.total / 1024 / 1024).toFixed(2)} MB`,
          used: `${memoryStats.used} bytes`,
          usedMB: `${(memoryStats.used / 1024 / 1024).toFixed(2)} MB`,
          limit: `${memoryStats.limit} bytes`,
          limitMB: `${(memoryStats.limit / 1024 / 1024).toFixed(2)} MB`,
        },
      });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 500);
    }
  });

  /**
   * GET /api/wasm/info
   * Get WASM system info
   */
  app.get('/api/wasm/info', (_ctx: Context) => {
    return jsonResponse({
      success: true,
      wasm: {
        enabled: true,
        state: app.wasm.getState(),
        ready: app.wasm.isReady(),
      },
      features: {
        moduleLoading: 'Multiple sources (file, URL, bytes, base64)',
        sandboxing: 'Capability-based security',
        memoryManagement: 'Global and per-module limits',
        metrics: 'Automatic instrumentation',
      },
      documentation: {
        modules: '/api/wasm/demo/modules',
        stats: '/api/wasm/demo/stats',
        memory: '/api/wasm/demo/memory',
      },
    });
  });
}
