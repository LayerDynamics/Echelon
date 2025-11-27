/**
 * WASM Middleware
 *
 * Provides middleware for executing WASM modules in request handlers.
 * Enables WASM-powered route processing and API endpoints.
 */

import type { Context, Middleware, Next } from '../http/types.ts';
import type { WASMRuntimeCore } from '../runtime/wasm_runtime.ts';
import type {
  WASMExecutionOptions,
  WASMSandboxConfig,
} from '../runtime/wasm_types.ts';
import { getLogger } from '../telemetry/logger.ts';

const logger = getLogger();

/**
 * WASM middleware options
 */
export interface WASMMiddlewareOptions {
  /** WASM Runtime instance */
  runtime: WASMRuntimeCore;

  /** Default module ID to use if not specified in context */
  defaultModuleId?: string;

  /** Default function to call if not specified */
  defaultFunction?: string;

  /** Sandbox configuration for WASM execution */
  sandboxConfig?: Partial<WASMSandboxConfig>;

  /** Execution options */
  executionOptions?: WASMExecutionOptions;

  /** Whether to pass request body to WASM function */
  passRequestBody?: boolean;

  /** Whether to store result in context state */
  storeResultInState?: boolean;

  /** Key to use when storing result in state */
  stateKey?: string;

  /** Error handler */
  onError?: (error: Error, ctx: Context) => Response | Promise<Response>;
}

/**
 * WASM execution context stored in request state
 */
export interface WASMContextData {
  moduleId?: string;
  functionName?: string;
  args?: unknown[];
  result?: unknown;
  duration?: number;
  error?: Error;
}

const WASM_STATE_KEY = 'wasm';

/**
 * Create WASM execution middleware
 *
 * This middleware allows routes to execute WASM functions during request processing.
 *
 * @example
 * ```typescript
 * // Basic usage
 * app.use(wasmMiddleware({ runtime: wasmRuntime }));
 *
 * // In route handler
 * app.get('/compute/:value', async (ctx) => {
 *   const wasmCtx = ctx.state.get('wasm') as WASMContextData;
 *   wasmCtx.moduleId = 'calculator';
 *   wasmCtx.functionName = 'compute';
 *   wasmCtx.args = [parseInt(ctx.params.value)];
 *
 *   // Result will be available after middleware chain
 *   return new Response(JSON.stringify(wasmCtx.result));
 * });
 * ```
 */
export function wasmMiddleware(options: WASMMiddlewareOptions): Middleware {
  const {
    runtime,
    defaultModuleId,
    defaultFunction,
    executionOptions = {},
    storeResultInState = true,
    stateKey = WASM_STATE_KEY,
    onError,
  } = options;

  return async (ctx: Context, next: Next): Promise<Response> => {
    // Initialize WASM context in state
    const wasmCtx: WASMContextData = {
      moduleId: defaultModuleId,
      functionName: defaultFunction,
    };
    ctx.state.set(stateKey, wasmCtx);

    // Continue to route handler
    const response = await next();

    // Check if WASM execution was requested
    const updatedCtx = ctx.state.get(stateKey) as WASMContextData;
    if (updatedCtx?.moduleId && updatedCtx?.functionName) {
      try {
        const result = await runtime.execute(
          updatedCtx.moduleId,
          updatedCtx.functionName,
          updatedCtx.args ?? [],
          executionOptions
        );

        if (result.success) {
          updatedCtx.result = result.value;
          updatedCtx.duration = result.duration;
        } else {
          updatedCtx.error = result.error;
          if (onError) {
            return await onError(result.error!, ctx);
          }
        }

        if (storeResultInState) {
          ctx.state.set(stateKey, updatedCtx);
        }
      } catch (error) {
        logger.error('WASM middleware execution error', error as Error);
        if (onError) {
          return await onError(error as Error, ctx);
        }
        throw error;
      }
    }

    return response;
  };
}

/**
 * Create middleware that executes a specific WASM function
 *
 * @example
 * ```typescript
 * app.get('/add/:a/:b', wasmFunction({
 *   runtime: wasmRuntime,
 *   moduleId: 'math',
 *   functionName: 'add',
 *   getArgs: (ctx) => [parseInt(ctx.params.a), parseInt(ctx.params.b)],
 *   transformResult: (result) => ({ sum: result }),
 * }));
 * ```
 */
export function wasmFunction(options: {
  runtime: WASMRuntimeCore;
  moduleId: string;
  functionName: string;
  getArgs?: (ctx: Context) => unknown[] | Promise<unknown[]>;
  transformResult?: (result: unknown, ctx: Context) => unknown;
  executionOptions?: WASMExecutionOptions;
  onError?: (error: Error, ctx: Context) => Response | Promise<Response>;
}): Middleware {
  const {
    runtime,
    moduleId,
    functionName,
    getArgs,
    transformResult,
    executionOptions = {},
    onError,
  } = options;

  return async (ctx: Context, next: Next): Promise<Response> => {
    try {
      // Get arguments
      const args = getArgs ? await getArgs(ctx) : [];

      // Execute WASM function
      const result = await runtime.execute(moduleId, functionName, args, executionOptions);

      if (!result.success) {
        if (onError) {
          return await onError(result.error!, ctx);
        }
        return new Response(JSON.stringify({ error: result.error?.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Transform result if transformer provided
      const finalResult = transformResult
        ? transformResult(result.value, ctx)
        : result.value;

      // Store in context state
      ctx.state.set(WASM_STATE_KEY, {
        moduleId,
        functionName,
        args,
        result: finalResult,
        duration: result.duration,
      });

      // Continue to next middleware/handler
      return await next();
    } catch (error) {
      logger.error('WASM function middleware error', error as Error);
      if (onError) {
        return await onError(error as Error, ctx);
      }
      throw error;
    }
  };
}

/**
 * Create a route handler that directly returns WASM function result as JSON
 *
 * @example
 * ```typescript
 * app.get('/compute', wasmHandler({
 *   runtime: wasmRuntime,
 *   moduleId: 'calculator',
 *   functionName: 'compute',
 *   getArgs: async (ctx) => {
 *     const body = await ctx.request.json();
 *     return [body.a, body.b];
 *   },
 * }));
 * ```
 */
export function wasmHandler(options: {
  runtime: WASMRuntimeCore;
  moduleId: string;
  functionName: string;
  getArgs?: (ctx: Context) => unknown[] | Promise<unknown[]>;
  transformResult?: (result: unknown, ctx: Context) => unknown;
  executionOptions?: WASMExecutionOptions;
}): (ctx: Context) => Promise<Response> {
  const {
    runtime,
    moduleId,
    functionName,
    getArgs,
    transformResult,
    executionOptions = {},
  } = options;

  return async (ctx: Context): Promise<Response> => {
    try {
      // Get arguments
      const args = getArgs ? await getArgs(ctx) : [];

      // Execute WASM function
      const result = await runtime.execute(moduleId, functionName, args, executionOptions);

      if (!result.success) {
        return new Response(JSON.stringify({
          error: result.error?.message,
          module: moduleId,
          function: functionName,
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Transform result if transformer provided
      const finalResult = transformResult
        ? transformResult(result.value, ctx)
        : result.value;

      // Return JSON response
      return new Response(JSON.stringify({
        result: finalResult,
        duration: result.duration,
        memoryUsed: result.memoryUsed,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      logger.error('WASM handler error', error as Error);
      return new Response(JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
}

/**
 * Create middleware that loads a WASM module before processing
 *
 * @example
 * ```typescript
 * app.use('/api/wasm/*', wasmLoader({
 *   runtime: wasmRuntime,
 *   moduleSource: { type: 'file', value: './modules/api.wasm' },
 * }));
 * ```
 */
export function wasmLoader(options: {
  runtime: WASMRuntimeCore;
  moduleSource: import('../runtime/wasm_types.ts').WASMSource;
  sandboxConfig?: Partial<WASMSandboxConfig>;
}): Middleware {
  const { runtime, moduleSource, sandboxConfig } = options;
  let loaded = false;
  let moduleId: string | undefined;

  return async (ctx: Context, next: Next): Promise<Response> => {
    // Load module on first request
    if (!loaded) {
      try {
        const module = await runtime.loadModule(moduleSource);
        moduleId = module.id;

        // Create sandbox if configured
        if (sandboxConfig) {
          const sandbox = runtime.createSandbox(sandboxConfig);
          runtime.assignModuleToSandbox(moduleId, sandbox.id);
        }

        loaded = true;
        logger.info(`Loaded WASM module: ${moduleId}`);
      } catch (error) {
        logger.error('Failed to load WASM module', error as Error);
        return new Response('WASM module loading failed', { status: 500 });
      }
    }

    // Store module ID in context
    ctx.state.set('wasmModuleId', moduleId);

    return await next();
  };
}

/**
 * Get WASM execution data from context
 */
export function getWASMContext(ctx: Context): WASMContextData | undefined {
  return ctx.state.get(WASM_STATE_KEY) as WASMContextData | undefined;
}

/**
 * Set WASM execution parameters in context
 */
export function setWASMExecution(
  ctx: Context,
  moduleId: string,
  functionName: string,
  args?: unknown[]
): void {
  const wasmCtx = ctx.state.get(WASM_STATE_KEY) as WASMContextData | undefined;
  if (wasmCtx) {
    wasmCtx.moduleId = moduleId;
    wasmCtx.functionName = functionName;
    wasmCtx.args = args;
  } else {
    ctx.state.set(WASM_STATE_KEY, {
      moduleId,
      functionName,
      args,
    });
  }
}
