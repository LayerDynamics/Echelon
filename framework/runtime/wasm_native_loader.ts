/**
 * Native WASM Loader for Deno 2.1+
 *
 * Supports Deno's native WASM import syntax using dynamic imports.
 * This enables using `import { fn } from "./module.wasm"` style imports
 * with full type checking support.
 *
 * @see https://docs.deno.com/runtime/reference/wasm/
 *
 * @example
 * ```typescript
 * // Using native imports directly (Deno 2.1+)
 * import { add } from "./add.wasm";
 * console.log(add(1, 2)); // 3
 *
 * // Using this registry for dynamic loading
 * const registry = new NativeWASMRegistry();
 * await registry.register('math', './math.wasm');
 * const result = registry.call<number>('math', 'add', 1, 2);
 * ```
 */

import { EventEmitter } from '../plugin/events.ts';
import { getLogger } from '../telemetry/logger.ts';

const logger = getLogger();

/**
 * Represents a native WASM module loaded via Deno's import system
 */
export interface NativeWASMModule {
  /** The import specifier used to load this module */
  specifier: string;
  /** The loaded module exports */
  exports: Record<string, unknown>;
  /** When the module was registered */
  registeredAt: Date;
  /** Number of times call() has been invoked */
  callCount: number;
}

/**
 * Configuration for the native WASM registry
 */
export interface NativeWASMRegistryConfig {
  /** Event emitter for lifecycle events */
  events?: EventEmitter;
  /** Whether to log debug information */
  debug?: boolean;
}

/**
 * Events emitted by the NativeWASMRegistry
 */
export const NativeWASMEvents = {
  MODULE_REGISTERED: 'native_wasm:module_registered',
  MODULE_UNREGISTERED: 'native_wasm:module_unregistered',
  CALL_START: 'native_wasm:call_start',
  CALL_COMPLETE: 'native_wasm:call_complete',
  CALL_ERROR: 'native_wasm:call_error',
} as const;

/**
 * Load a WASM module using Deno's native dynamic import.
 *
 * Per Deno 2.1+ documentation, WASM modules can be imported directly
 * with type checking support. This function provides dynamic loading
 * with the same capabilities.
 *
 * Note: The WASM module must be served with `application/wasm` MIME type
 * or be a local file.
 *
 * @see https://docs.deno.com/runtime/reference/wasm/
 */
export async function loadNativeWASM(specifier: string): Promise<NativeWASMModule> {
  try {
    // Dynamic import of WASM module - Deno handles compilation
    const module = await import(specifier);

    return {
      specifier,
      exports: module as Record<string, unknown>,
      registeredAt: new Date(),
      callCount: 0,
    };
  } catch (error) {
    throw new Error(
      `Failed to load native WASM module '${specifier}': ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Registry for native WASM modules loaded via Deno's import system.
 *
 * This class provides a managed way to:
 * - Load WASM modules dynamically using Deno 2.1+ native imports
 * - Call exported functions with type safety
 * - Track module usage and lifecycle
 * - Use import map aliases for cleaner specifiers
 *
 * @example
 * ```typescript
 * // Setup deno.json with import map:
 * // { "imports": { "@wasm/math": "./wasm_modules/math.wasm" } }
 *
 * const registry = new NativeWASMRegistry();
 *
 * // Register using import map alias
 * await registry.register('math', '@wasm/math');
 *
 * // Call exported function
 * const sum = registry.call<number>('math', 'add', 5, 3);
 * ```
 */
export class NativeWASMRegistry {
  private modules: Map<string, NativeWASMModule> = new Map();
  private events?: EventEmitter;
  private debug: boolean;

  constructor(config: NativeWASMRegistryConfig = {}) {
    this.events = config.events;
    this.debug = config.debug ?? false;
  }

  /**
   * Register a WASM module by alias.
   *
   * Uses Deno's native import system to load the module.
   * The specifier can be:
   * - A relative path: `./module.wasm`
   * - An absolute path: `/path/to/module.wasm`
   * - An import map alias: `@wasm/module` (requires deno.json config)
   * - A URL: `https://example.com/module.wasm`
   */
  async register(alias: string, specifier: string): Promise<void> {
    if (this.modules.has(alias)) {
      logger.warn(`Native WASM module '${alias}' already registered, replacing`);
    }

    if (this.debug) {
      logger.debug(`Registering native WASM module: ${alias} -> ${specifier}`);
    }

    const module = await loadNativeWASM(specifier);
    this.modules.set(alias, module);

    this.events?.emit(NativeWASMEvents.MODULE_REGISTERED, {
      alias,
      specifier,
      exports: Object.keys(module.exports),
    });

    if (this.debug) {
      logger.debug(`Registered native WASM module: ${alias}`, {
        exports: Object.keys(module.exports),
      });
    }
  }

  /**
   * Unregister a WASM module
   */
  unregister(alias: string): boolean {
    const existed = this.modules.delete(alias);
    if (existed) {
      this.events?.emit(NativeWASMEvents.MODULE_UNREGISTERED, { alias });
    }
    return existed;
  }

  /**
   * Get a registered module
   */
  get(alias: string): NativeWASMModule | undefined {
    return this.modules.get(alias);
  }

  /**
   * Check if a module is registered
   */
  has(alias: string): boolean {
    return this.modules.has(alias);
  }

  /**
   * Get all registered module aliases
   */
  getRegisteredAliases(): string[] {
    return Array.from(this.modules.keys());
  }

  /**
   * Call an exported function from a registered module.
   *
   * @example
   * ```typescript
   * // Assuming math.wasm exports: add(i32, i32) -> i32
   * const result = registry.call<number>('math', 'add', 5, 3);
   * // result = 8
   * ```
   */
  call<T = unknown>(alias: string, exportName: string, ...args: unknown[]): T {
    const module = this.modules.get(alias);
    if (!module) {
      throw new Error(`Native WASM module not registered: ${alias}`);
    }

    const fn = module.exports[exportName];
    if (typeof fn !== 'function') {
      throw new Error(
        `Export '${exportName}' not found or not a function in module '${alias}'. ` +
        `Available exports: ${Object.keys(module.exports).join(', ')}`
      );
    }

    this.events?.emit(NativeWASMEvents.CALL_START, {
      alias,
      exportName,
      argCount: args.length,
    });

    const startTime = performance.now();

    try {
      const result = fn(...args) as T;
      module.callCount++;

      const duration = performance.now() - startTime;
      this.events?.emit(NativeWASMEvents.CALL_COMPLETE, {
        alias,
        exportName,
        duration,
      });

      return result;
    } catch (error) {
      this.events?.emit(NativeWASMEvents.CALL_ERROR, {
        alias,
        exportName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Call an async function or Promise-returning function
   */
  async callAsync<T = unknown>(alias: string, exportName: string, ...args: unknown[]): Promise<T> {
    const result = this.call<T | Promise<T>>(alias, exportName, ...args);
    return result instanceof Promise ? result : Promise.resolve(result);
  }

  /**
   * Get an exported value (non-function) from a module
   */
  getExport<T = unknown>(alias: string, exportName: string): T | undefined {
    const module = this.modules.get(alias);
    if (!module) {
      throw new Error(`Native WASM module not registered: ${alias}`);
    }
    return module.exports[exportName] as T | undefined;
  }

  /**
   * Get memory export from a module
   */
  getMemory(alias: string, exportName = 'memory'): WebAssembly.Memory | undefined {
    const exp = this.getExport(alias, exportName);
    return exp instanceof WebAssembly.Memory ? exp : undefined;
  }

  /**
   * Get all exports from a module
   */
  getExports(alias: string): Record<string, unknown> | undefined {
    return this.modules.get(alias)?.exports;
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    moduleCount: number;
    modules: Array<{
      alias: string;
      specifier: string;
      exportCount: number;
      callCount: number;
      registeredAt: Date;
    }>;
  } {
    const modules = Array.from(this.modules.entries()).map(([alias, module]) => ({
      alias,
      specifier: module.specifier,
      exportCount: Object.keys(module.exports).length,
      callCount: module.callCount,
      registeredAt: module.registeredAt,
    }));

    return {
      moduleCount: this.modules.size,
      modules,
    };
  }

  /**
   * Clear all registered modules
   */
  clear(): void {
    const aliases = Array.from(this.modules.keys());
    this.modules.clear();
    for (const alias of aliases) {
      this.events?.emit(NativeWASMEvents.MODULE_UNREGISTERED, { alias });
    }
  }
}

/**
 * Helper to check if native WASM imports are supported.
 * Always true in Deno 2.1+.
 */
export function isNativeWASMSupported(): boolean {
  // Deno 2.1+ always supports native WASM imports
  return typeof Deno !== 'undefined';
}

/**
 * Create a typed wrapper for a native WASM module.
 *
 * This provides compile-time type safety for WASM function calls.
 *
 * @example
 * ```typescript
 * interface MathModule {
 *   add(a: number, b: number): number;
 *   multiply(a: number, b: number): number;
 * }
 *
 * const math = await createTypedWASMModule<MathModule>('./math.wasm');
 * const sum = math.add(1, 2); // Fully typed
 * ```
 */
export async function createTypedWASMModule<T extends Record<string, unknown>>(
  specifier: string
): Promise<T> {
  const module = await loadNativeWASM(specifier);
  return module.exports as T;
}
