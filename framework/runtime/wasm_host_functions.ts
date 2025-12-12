/**
 * WASM Host Function Registry
 *
 * Manages JavaScript functions that can be called from WebAssembly modules.
 * Provides type-safe bindings and automatic memory management.
 */

import { getLogger } from '../telemetry/logger.ts';
import type {
  WASMHostFunction,
  WASMHostFunctionDescriptor,
  WASMValueType,
  WASMFunctionSignature,
} from './wasm_types.ts';

const logger = getLogger();

/**
 * Host function metadata
 */
interface HostFunctionMetadata extends WASMHostFunctionDescriptor {
  /** Call count */
  callCount: number;
  /** Total execution time in milliseconds */
  totalExecutionTime: number;
  /** Last call timestamp */
  lastCalled?: Date;
  /** Last error */
  lastError?: Error;
}

/**
 * Host function execution context
 */
export interface HostFunctionContext {
  /** WASM module memory */
  memory: WebAssembly.Memory;
  /** Module ID */
  moduleId: string;
  /** Function arguments (raw WASM values) */
  args: unknown[];
}

/**
 * Host function with automatic memory access
 */
export type HostFunctionWithContext = (ctx: HostFunctionContext, ...args: unknown[]) => unknown;

/**
 * WASM Host Function Registry
 *
 * Manages JavaScript functions callable from WASM modules with:
 * - Automatic type marshalling
 * - Memory access helpers
 * - Call tracking and metrics
 * - Error handling
 */
export class WASMHostFunctionRegistry {
  private functions: Map<string, Map<string, HostFunctionMetadata>>;
  private globalFunctions: Map<string, HostFunctionMetadata>;

  constructor() {
    this.functions = new Map(); // module -> (name -> function)
    this.globalFunctions = new Map(); // name -> function
  }

  /**
   * Register a global host function available to all modules
   *
   * @example
   * ```typescript
   * registry.registerGlobal('env', 'log', (ctx, msgPtr: number, msgLen: number) => {
   *   const bytes = new Uint8Array(ctx.memory.buffer, msgPtr, msgLen);
   *   const message = new TextDecoder().decode(bytes);
   *   console.log(message);
   * }, {
   *   params: ['i32', 'i32'],
   *   results: []
   * });
   * ```
   */
  registerGlobal(
    module: string,
    name: string,
    func: HostFunctionWithContext,
    signature: WASMFunctionSignature,
    async = false
  ): void {
    const key = `${module}.${name}`;

    if (this.globalFunctions.has(key)) {
      logger.warn(`Global host function already registered: ${key}`);
      return;
    }

    this.globalFunctions.set(key, {
      name,
      module,
      func: func as WASMHostFunction,
      signature,
      async,
      callCount: 0,
      totalExecutionTime: 0,
    });

    logger.debug(`Registered global host function: ${key}`);
  }

  /**
   * Register a host function for a specific module
   */
  register(
    moduleIdOrModuleName: string,
    moduleNameOrFuncName: string,
    funcNameOrFunc: string | HostFunctionWithContext,
    funcOrSignature?: HostFunctionWithContext | WASMFunctionSignature,
    signatureOrAsync?: WASMFunctionSignature | boolean,
    async?: boolean
  ): void {
    // Simplified overload for testing: register(moduleName, funcName, func)
    if (typeof funcNameOrFunc === 'function' && !funcOrSignature) {
      this.registerGlobal(
        moduleIdOrModuleName,
        moduleNameOrFuncName,
        funcNameOrFunc,
        { params: [], results: [] },
        false
      );
      return;
    }

    // Full signature: register(moduleId, moduleName, funcName, func, signature, async)
    const moduleId = moduleIdOrModuleName;
    const moduleName = moduleNameOrFuncName;
    const funcName = funcNameOrFunc as string;
    const func = funcOrSignature as HostFunctionWithContext;
    const signature = (signatureOrAsync as WASMFunctionSignature) || { params: [], results: [] };
    const isAsync = typeof async === 'boolean' ? async : false;

    if (!this.functions.has(moduleId)) {
      this.functions.set(moduleId, new Map());
    }

    const moduleFuncs = this.functions.get(moduleId)!;
    const key = `${moduleName}.${funcName}`;

    if (moduleFuncs.has(key)) {
      logger.warn(`Host function already registered for module ${moduleId}: ${key}`);
      return;
    }

    moduleFuncs.set(key, {
      name: funcName,
      module: moduleName,
      func: func as WASMHostFunction,
      signature,
      async: isAsync,
      callCount: 0,
      totalExecutionTime: 0,
    });

    logger.debug(`Registered host function for ${moduleId}: ${key}`);
  }

  /**
   * Get a host function by module and name (for testing)
   */
  get(moduleName: string, funcName: string): HostFunctionWithContext | undefined {
    const key = `${moduleName}.${funcName}`;
    const globalFunc = this.globalFunctions.get(key);
    if (globalFunc) {
      return globalFunc.func as HostFunctionWithContext;
    }
    return undefined;
  }

  /**
   * Get metrics for a specific function
   */
  getMetrics(moduleName: string, funcName: string): {
    callCount: number;
    totalDuration: number;
    avgDuration: number;
  } | undefined {
    const key = `${moduleName}.${funcName}`;
    const func = this.globalFunctions.get(key);
    if (!func) return undefined;

    return {
      callCount: func.callCount,
      totalDuration: func.totalExecutionTime,
      avgDuration: func.callCount > 0 ? func.totalExecutionTime / func.callCount : 0,
    };
  }

  /**
   * Unregister a module's host functions
   */
  unregister(moduleId: string): void {
    this.functions.delete(moduleId);
  }

  /**
   * Get imports object for WebAssembly instantiation
   *
   * Returns an imports object compatible with WebAssembly.instantiate()
   * that includes all global and module-specific host functions.
   */
  getImports(moduleId: string, memory: WebAssembly.Memory): WebAssembly.Imports {
    const imports: WebAssembly.Imports = {};

    // Add global functions
    for (const [key, metadata] of this.globalFunctions) {
      const [moduleName, funcName] = key.split('.');

      if (!imports[moduleName]) {
        imports[moduleName] = {};
      }

      imports[moduleName][funcName] = this.createWrapper(moduleId, memory, metadata);
    }

    // Add module-specific functions
    const moduleFuncs = this.functions.get(moduleId);
    if (moduleFuncs) {
      for (const [key, metadata] of moduleFuncs) {
        const [moduleName, funcName] = key.split('.');

        if (!imports[moduleName]) {
          imports[moduleName] = {};
        }

        imports[moduleName][funcName] = this.createWrapper(moduleId, memory, metadata);
      }
    }

    return imports;
  }

  /**
   * Create a wrapper function that handles context injection and metrics
   */
  private createWrapper(moduleId: string, memory: WebAssembly.Memory, metadata: HostFunctionMetadata): Function {
    return (...args: unknown[]) => {
      const startTime = performance.now();

      try {
        const ctx: HostFunctionContext = {
          memory,
          moduleId,
          args,
        };

        const result = metadata.func(ctx, ...args);

        // Update metrics
        metadata.callCount++;
        metadata.totalExecutionTime += performance.now() - startTime;
        metadata.lastCalled = new Date();

        return result;
      } catch (error) {
        metadata.lastError = error as Error;
        logger.error(`Host function error: ${metadata.module}.${metadata.name}`, error as Error);
        throw error;
      }
    };
  }

  /**
   * Get statistics for all host functions
   */
  getStats(): {
    global: Map<string, HostFunctionMetadata>;
    perModule: Map<string, Map<string, HostFunctionMetadata>>;
  } {
    return {
      global: new Map(this.globalFunctions),
      perModule: new Map(this.functions),
    };
  }

  /**
   * Clear all registrations
   */
  clear(): void {
    this.functions.clear();
    this.globalFunctions.clear();
  }
}

/**
 * Common host function helpers
 */
export const HostFunctionHelpers = {
  /**
   * Read a string from WASM memory
   */
  readString(memory: WebAssembly.Memory, ptr: number, len: number): string {
    const bytes = new Uint8Array(memory.buffer, ptr, len);
    return new TextDecoder().decode(bytes);
  },

  /**
   * Read a null-terminated string from WASM memory
   */
  readCString(memory: WebAssembly.Memory, ptr: number, maxLen = 4096): string {
    const bytes = new Uint8Array(memory.buffer, ptr, maxLen);
    let len = 0;
    while (len < maxLen && bytes[len] !== 0) {
      len++;
    }
    return new TextDecoder().decode(bytes.subarray(0, len));
  },

  /**
   * Write a string to WASM memory
   */
  writeString(memory: WebAssembly.Memory, ptr: number, str: string): number {
    const bytes = new TextEncoder().encode(str);
    new Uint8Array(memory.buffer, ptr, bytes.length).set(bytes);
    return bytes.length;
  },

  /**
   * Write a null-terminated string to WASM memory
   */
  writeCString(memory: WebAssembly.Memory, ptr: number, str: string): number {
    const bytes = new TextEncoder().encode(str + '\0');
    new Uint8Array(memory.buffer, ptr, bytes.length).set(bytes);
    return bytes.length;
  },

  /**
   * Read bytes from WASM memory
   */
  readBytes(memory: WebAssembly.Memory, ptr: number, len: number): Uint8Array {
    return new Uint8Array(memory.buffer, ptr, len);
  },

  /**
   * Write bytes to WASM memory
   */
  writeBytes(memory: WebAssembly.Memory, ptr: number, bytes: Uint8Array): void {
    new Uint8Array(memory.buffer, ptr, bytes.length).set(bytes);
  },

  /**
   * Read JSON from WASM memory
   */
  readJSON<T = unknown>(memory: WebAssembly.Memory, ptr: number, len: number): T {
    const str = this.readString(memory, ptr, len);
    return JSON.parse(str) as T;
  },

  /**
   * Write JSON to WASM memory
   */
  writeJSON(memory: WebAssembly.Memory, ptr: number, data: unknown): number {
    const str = JSON.stringify(data);
    return this.writeString(memory, ptr, str);
  },
};

/**
 * Standard host function library
 */
export const StandardHostFunctions = {
  /**
   * Console logging functions
   */
  console: {
    log: (ctx: HostFunctionContext, ...args: unknown[]) => {
      const [ptr, len] = args as [number, number];
      const message = HostFunctionHelpers.readString(ctx.memory, ptr, len);
      console.log(`[WASM ${ctx.moduleId}]`, message);
    },

    error: (ctx: HostFunctionContext, ...args: unknown[]) => {
      const [ptr, len] = args as [number, number];
      const message = HostFunctionHelpers.readString(ctx.memory, ptr, len);
      console.error(`[WASM ${ctx.moduleId}]`, message);
    },

    warn: (ctx: HostFunctionContext, ...args: unknown[]) => {
      const [ptr, len] = args as [number, number];
      const message = HostFunctionHelpers.readString(ctx.memory, ptr, len);
      console.warn(`[WASM ${ctx.moduleId}]`, message);
    },

    info: (ctx: HostFunctionContext, ...args: unknown[]) => {
      const [ptr, len] = args as [number, number];
      const message = HostFunctionHelpers.readString(ctx.memory, ptr, len);
      console.info(`[WASM ${ctx.moduleId}]`, message);
    },

    debug: (ctx: HostFunctionContext, ...args: unknown[]) => {
      const [ptr, len] = args as [number, number];
      const message = HostFunctionHelpers.readString(ctx.memory, ptr, len);
      console.debug(`[WASM ${ctx.moduleId}]`, message);
    },
  },

  /**
   * Math functions
   */
  math: {
    random: (): number => {
      return Math.random();
    },

    floor: (...args: unknown[]): number => {
      return Math.floor(args[0] as number);
    },

    ceil: (...args: unknown[]): number => {
      return Math.ceil(args[0] as number);
    },

    round: (...args: unknown[]): number => {
      return Math.round(args[0] as number);
    },

    sqrt: (...args: unknown[]): number => {
      return Math.sqrt(args[0] as number);
    },

    pow: (...args: unknown[]): number => {
      const [x, y] = args as [number, number];
      return Math.pow(x, y);
    },

    sin: (...args: unknown[]): number => {
      return Math.sin(args[0] as number);
    },

    cos: (...args: unknown[]): number => {
      return Math.cos(args[0] as number);
    },

    tan: (...args: unknown[]): number => {
      return Math.tan(args[0] as number);
    },
  },

  /**
   * Time functions
   */
  time: {
    now: (): number => {
      return Date.now();
    },

    performance_now: (): number => {
      return performance.now();
    },
  },

  /**
   * Memory allocation helpers (when WASM doesn't have its own allocator)
   */
  memory: {
    /**
     * Get current memory size in pages
     */
    size: (ctx: HostFunctionContext): number => {
      return ctx.memory.buffer.byteLength / 65536; // WASM page size
    },

    /**
     * Grow memory by specified pages
     */
    grow: (ctx: HostFunctionContext, ...args: unknown[]): number => {
      const pages = args[0] as number;
      return ctx.memory.grow(pages);
    },
  },
};

/**
 * Register all standard host functions
 */
export function registerStandardHostFunctions(registry: WASMHostFunctionRegistry): void {
  // Console functions
  registry.registerGlobal('env', 'console_log', StandardHostFunctions.console.log, {
    params: ['i32', 'i32'],
    results: [],
  });
  registry.registerGlobal('env', 'console_error', StandardHostFunctions.console.error, {
    params: ['i32', 'i32'],
    results: [],
  });
  registry.registerGlobal('env', 'console_warn', StandardHostFunctions.console.warn, {
    params: ['i32', 'i32'],
    results: [],
  });
  registry.registerGlobal('env', 'console_info', StandardHostFunctions.console.info, {
    params: ['i32', 'i32'],
    results: [],
  });
  registry.registerGlobal('env', 'console_debug', StandardHostFunctions.console.debug, {
    params: ['i32', 'i32'],
    results: [],
  });

  // Math functions
  registry.registerGlobal('env', 'Math.random', () => StandardHostFunctions.math.random(), {
    params: [],
    results: ['f64'],
  });
  registry.registerGlobal('env', 'Math.floor', (_, ...args: unknown[]) => StandardHostFunctions.math.floor(...args), {
    params: ['f64'],
    results: ['f64'],
  });
  registry.registerGlobal('env', 'Math.ceil', (_, ...args: unknown[]) => StandardHostFunctions.math.ceil(...args), {
    params: ['f64'],
    results: ['f64'],
  });
  registry.registerGlobal('env', 'Math.round', (_, ...args: unknown[]) => StandardHostFunctions.math.round(...args), {
    params: ['f64'],
    results: ['f64'],
  });
  registry.registerGlobal('env', 'Math.sqrt', (_, ...args: unknown[]) => StandardHostFunctions.math.sqrt(...args), {
    params: ['f64'],
    results: ['f64'],
  });
  registry.registerGlobal('env', 'Math.pow', (_, ...args: unknown[]) => StandardHostFunctions.math.pow(...args), {
    params: ['f64', 'f64'],
    results: ['f64'],
  });

  // Time functions
  registry.registerGlobal('env', 'Date.now', () => StandardHostFunctions.time.now(), {
    params: [],
    results: ['f64'],
  });
  registry.registerGlobal('env', 'performance.now', () => StandardHostFunctions.time.performance_now(), {
    params: [],
    results: ['f64'],
  });

  // Memory functions
  registry.registerGlobal('env', 'memory.size', StandardHostFunctions.memory.size, {
    params: [],
    results: ['i32'],
  });
  registry.registerGlobal('env', 'memory.grow', StandardHostFunctions.memory.grow, {
    params: ['i32'],
    results: ['i32'],
  });

  logger.info('Registered standard host functions');
}

/**
 * Create a host function registry with standard functions
 */
export function createHostFunctionRegistry(includeStandard = true): WASMHostFunctionRegistry {
  const registry = new WASMHostFunctionRegistry();

  if (includeStandard) {
    registerStandardHostFunctions(registry);
  }

  return registry;
}
