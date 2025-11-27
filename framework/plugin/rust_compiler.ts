/**
 * Rust to WASM Compiler Integration
 *
 * Provides integration with external Rust toolchain (rustc/wasm-pack) for
 * compiling Rust source code to WebAssembly.
 */

import { getLogger } from '../telemetry/logger.ts';

const logger = getLogger();
import type {
  WASMCompilationResult,
  WASMCompilationError,
  WASMCompilationWarning,
  WASMCompilationStats,
} from '../runtime/wasm_types.ts';

// ============================================================================
// Types
// ============================================================================

/**
 * Rust compiler configuration
 */
export interface RustCompilerConfig {
  /** Path to Rust toolchain (default: system PATH) */
  rustcPath?: string;
  /** Path to wasm-pack (default: system PATH) */
  wasmPackPath?: string;
  /** Path to cargo (default: system PATH) */
  cargoPath?: string;
  /** Enable caching of compiled modules */
  enableCache?: boolean;
  /** Maximum cache size in bytes */
  maxCacheSize?: number;
  /** Temp directory for compilation */
  tempDir?: string;
  /** Optimization level: 0-3 or 's' for size, 'z' for size min */
  optimizationLevel?: '0' | '1' | '2' | '3' | 's' | 'z';
  /** Enable debug info */
  debug?: boolean;
  /** Target for compilation */
  target?: 'web' | 'bundler' | 'nodejs' | 'no-modules';
  /**
   * Use wasmbuild instead of wasm-pack (Deno recommended).
   * wasmbuild automatically generates TypeScript bindings.
   * @see https://docs.deno.com/runtime/reference/wasm/
   */
  useWasmbuild?: boolean;
}

/**
 * Rust compilation options
 */
export interface RustCompileOptions {
  /** Module name for the WASM package */
  moduleName?: string;
  /** Optimization level override */
  optimizationLevel?: '0' | '1' | '2' | '3' | 's' | 'z';
  /** Enable debug info */
  debug?: boolean;
  /** Additional cargo features to enable */
  features?: string[];
  /** Target override */
  target?: 'web' | 'bundler' | 'nodejs' | 'no-modules';
  /** Additional environment variables */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Cached compilation result
 */
interface CachedCompilation {
  hash: string;
  wasm: Uint8Array;
  timestamp: number;
  stats: WASMCompilationStats;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<RustCompilerConfig> = {
  rustcPath: 'rustc',
  wasmPackPath: 'wasm-pack',
  cargoPath: 'cargo',
  enableCache: true,
  maxCacheSize: 100 * 1024 * 1024, // 100MB
  tempDir: '',
  optimizationLevel: '3',
  debug: false,
  target: 'web',
  useWasmbuild: false, // Default to wasm-pack for backwards compatibility
};

const DEFAULT_COMPILE_OPTIONS: Required<RustCompileOptions> = {
  moduleName: 'wasm_module',
  optimizationLevel: '3',
  debug: false,
  features: [],
  target: 'web',
  env: {},
  timeout: 120000, // 2 minutes
};

// ============================================================================
// Cargo.toml Templates
// ============================================================================

const CARGO_TOML_TEMPLATE = `[package]
name = "{{name}}"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2"

[profile.release]
opt-level = "{{opt_level}}"
lto = true
codegen-units = 1
panic = "abort"

[profile.dev]
opt-level = 0
debug = {{debug}}
`;

const LIB_RS_TEMPLATE = `use wasm_bindgen::prelude::*;

// User code below:
{{code}}
`;

// ============================================================================
// RustCompiler Class
// ============================================================================

/**
 * Rust to WASM compiler that shells out to external Rust toolchain
 */
export class RustCompiler {
  private config: Required<RustCompilerConfig>;
  private cache: Map<string, CachedCompilation> = new Map();
  private cacheSize: number = 0;
  private tempDirBase: string = '';

  constructor(config: RustCompilerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the compiler (check for Rust toolchain)
   */
  async initialize(): Promise<{ available: boolean; version?: string; error?: string }> {
    try {
      // Check for rustc
      const rustcResult = await this.runCommand('rustc', ['--version']);
      if (!rustcResult.success) {
        return {
          available: false,
          error: 'rustc not found. Please install Rust: https://rustup.rs/',
        };
      }

      // Check for wasm-pack
      const wasmPackResult = await this.runCommand('wasm-pack', ['--version']);
      if (!wasmPackResult.success) {
        return {
          available: false,
          version: rustcResult.stdout.trim(),
          error: 'wasm-pack not found. Install with: cargo install wasm-pack',
        };
      }

      // Check for wasm32 target
      const targetResult = await this.runCommand('rustup', ['target', 'list', '--installed']);
      if (!targetResult.stdout.includes('wasm32-unknown-unknown')) {
        return {
          available: false,
          version: rustcResult.stdout.trim(),
          error: 'wasm32-unknown-unknown target not installed. Install with: rustup target add wasm32-unknown-unknown',
        };
      }

      // Create temp directory base
      this.tempDirBase = this.config.tempDir || await Deno.makeTempDir({ prefix: 'echelon_rust_' });

      logger.info('Rust compiler initialized', {
        rustVersion: rustcResult.stdout.trim(),
        wasmPackVersion: wasmPackResult.stdout.trim(),
      });

      return {
        available: true,
        version: rustcResult.stdout.trim(),
      };
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Compile Rust source code to WASM
   */
  async compile(source: string, options: RustCompileOptions = {}): Promise<WASMCompilationResult> {
    const opts = { ...DEFAULT_COMPILE_OPTIONS, ...options };
    const startTime = performance.now();

    // Check cache first
    const sourceHash = await this.hashSource(source);
    if (this.config.enableCache) {
      const cached = this.cache.get(sourceHash);
      if (cached) {
        logger.debug('Rust compilation cache hit', { hash: sourceHash });
        return {
          success: true,
          wasm: cached.wasm,
          warnings: [],
          stats: {
            ...cached.stats,
            compilationTime: 0,
          },
        };
      }
    }

    // Create project directory
    const projectDir = await this.createProjectDirectory(opts.moduleName);

    try {
      // Generate Cargo.toml
      const cargoToml = this.generateCargoToml(opts);
      await Deno.writeTextFile(`${projectDir}/Cargo.toml`, cargoToml);

      // Create src directory and lib.rs
      await Deno.mkdir(`${projectDir}/src`, { recursive: true });
      const libRs = this.generateLibRs(source);
      await Deno.writeTextFile(`${projectDir}/src/lib.rs`, libRs);

      // Run wasm-pack build
      const buildResult = await this.runWasmPackBuild(projectDir, opts);

      if (!buildResult.success) {
        return {
          success: false,
          errors: this.parseRustErrors(buildResult.stderr),
          warnings: this.parseRustWarnings(buildResult.stderr),
          stats: {
            sourceSize: source.length,
            outputSize: 0,
            compilationTime: performance.now() - startTime,
            functionCount: 0,
            exportCount: 0,
          },
        };
      }

      // Read compiled WASM file
      const wasmPath = `${projectDir}/pkg/${opts.moduleName}_bg.wasm`;
      let wasm: Uint8Array;
      try {
        wasm = await Deno.readFile(wasmPath);
      } catch {
        // Try alternative path
        const altPath = `${projectDir}/pkg/${opts.moduleName}.wasm`;
        wasm = await Deno.readFile(altPath);
      }

      const compilationTime = performance.now() - startTime;
      const stats: WASMCompilationStats = {
        sourceSize: source.length,
        outputSize: wasm.length,
        compilationTime,
        functionCount: this.countExports(wasm),
        exportCount: this.countExports(wasm),
      };

      // Cache the result
      if (this.config.enableCache) {
        this.addToCache(sourceHash, wasm, stats);
      }

      logger.info('Rust compilation successful', {
        sourceSize: source.length,
        outputSize: wasm.length,
        compilationTime: Math.round(compilationTime),
      });

      return {
        success: true,
        wasm,
        warnings: this.parseRustWarnings(buildResult.stderr),
        stats,
      };
    } finally {
      // Cleanup project directory
      await this.cleanupProjectDirectory(projectDir);
    }
  }

  /**
   * Compile a simple Rust function (helper for common cases)
   */
  async compileFunction(
    name: string,
    params: Array<{ name: string; type: string }>,
    returnType: string,
    body: string,
    options: RustCompileOptions = {}
  ): Promise<WASMCompilationResult> {
    const paramStr = params.map(p => `${p.name}: ${p.type}`).join(', ');
    const source = `
#[wasm_bindgen]
pub fn ${name}(${paramStr}) -> ${returnType} {
    ${body}
}
`;
    return await this.compile(source, options);
  }

  /**
   * Check if Rust toolchain is available
   */
  async isAvailable(): Promise<boolean> {
    const result = await this.initialize();
    return result.available;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { entries: number; size: number; maxSize: number } {
    return {
      entries: this.cache.size,
      size: this.cacheSize,
      maxSize: this.config.maxCacheSize,
    };
  }

  /**
   * Clear the compilation cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheSize = 0;
    logger.debug('Rust compilation cache cleared');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Run a shell command
   */
  private async runCommand(
    command: string,
    args: string[],
    options: { cwd?: string; env?: Record<string, string>; timeout?: number } = {}
  ): Promise<{ success: boolean; stdout: string; stderr: string; code: number }> {
    try {
      const cmd = new Deno.Command(command, {
        args,
        cwd: options.cwd,
        env: options.env,
        stdout: 'piped',
        stderr: 'piped',
      });

      const timeoutPromise = options.timeout
        ? new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Command timed out')), options.timeout)
          )
        : null;

      const execPromise = cmd.output();
      const result = timeoutPromise
        ? await Promise.race([execPromise, timeoutPromise])
        : await execPromise;

      return {
        success: result.success,
        stdout: new TextDecoder().decode(result.stdout),
        stderr: new TextDecoder().decode(result.stderr),
        code: result.code,
      };
    } catch (error) {
      return {
        success: false,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        code: -1,
      };
    }
  }

  /**
   * Create a temporary project directory
   */
  private async createProjectDirectory(moduleName: string): Promise<string> {
    const dirName = `${moduleName}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const projectDir = `${this.tempDirBase}/${dirName}`;
    await Deno.mkdir(projectDir, { recursive: true });
    return projectDir;
  }

  /**
   * Clean up a project directory
   */
  private async cleanupProjectDirectory(projectDir: string): Promise<void> {
    try {
      await Deno.remove(projectDir, { recursive: true });
    } catch (error) {
      logger.warn('Failed to cleanup project directory', {
        path: projectDir,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Generate Cargo.toml content
   */
  private generateCargoToml(options: Required<RustCompileOptions>): string {
    return CARGO_TOML_TEMPLATE
      .replace('{{name}}', options.moduleName)
      .replace('{{opt_level}}', options.optimizationLevel)
      .replace('{{debug}}', options.debug ? 'true' : 'false');
  }

  /**
   * Generate lib.rs content
   */
  private generateLibRs(source: string): string {
    // Check if source already has wasm_bindgen import
    if (source.includes('wasm_bindgen')) {
      return source;
    }
    return LIB_RS_TEMPLATE.replace('{{code}}', source);
  }

  /**
   * Run wasm-pack build
   */
  private async runWasmPackBuild(
    projectDir: string,
    options: Required<RustCompileOptions>
  ): Promise<{ success: boolean; stdout: string; stderr: string }> {
    const args = ['build', '--target', options.target];

    if (!options.debug) {
      args.push('--release');
    } else {
      args.push('--dev');
    }

    // Add features if specified
    if (options.features.length > 0) {
      args.push('--features', options.features.join(','));
    }

    const result = await this.runCommand('wasm-pack', args, {
      cwd: projectDir,
      env: {
        ...options.env,
        RUSTFLAGS: `-C opt-level=${options.optimizationLevel}`,
      },
      timeout: options.timeout,
    });

    return {
      success: result.success,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  /**
   * Parse Rust compiler errors from stderr
   */
  private parseRustErrors(stderr: string): WASMCompilationError[] {
    const errors: WASMCompilationError[] = [];
    const errorRegex = /error(?:\[E\d+\])?: (.+?)(?:\n\s+-->\s+(.+?):(\d+):(\d+))?/g;

    let match;
    while ((match = errorRegex.exec(stderr)) !== null) {
      errors.push({
        message: match[1],
        source: match[2],
        line: match[3] ? parseInt(match[3], 10) : undefined,
        column: match[4] ? parseInt(match[4], 10) : undefined,
      });
    }

    // If no structured errors found but stderr has content, add generic error
    if (errors.length === 0 && stderr.includes('error')) {
      errors.push({
        message: stderr.split('\n').find(line => line.includes('error')) || 'Compilation failed',
      });
    }

    return errors;
  }

  /**
   * Parse Rust compiler warnings from stderr
   */
  private parseRustWarnings(stderr: string): WASMCompilationWarning[] {
    const warnings: WASMCompilationWarning[] = [];
    const warningRegex = /warning: (.+?)(?:\n\s+-->\s+(.+?):(\d+):(\d+))?/g;

    let match;
    while ((match = warningRegex.exec(stderr)) !== null) {
      warnings.push({
        message: match[1],
        source: match[2],
        line: match[3] ? parseInt(match[3], 10) : undefined,
        column: match[4] ? parseInt(match[4], 10) : undefined,
      });
    }

    return warnings;
  }

  /**
   * Hash source code for caching
   */
  private async hashSource(source: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(source);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Add compilation result to cache
   */
  private addToCache(hash: string, wasm: Uint8Array, stats: WASMCompilationStats): void {
    // Evict old entries if cache is full
    while (this.cacheSize + wasm.length > this.config.maxCacheSize && this.cache.size > 0) {
      const oldest = this.findOldestCacheEntry();
      if (oldest) {
        this.cacheSize -= this.cache.get(oldest)!.wasm.length;
        this.cache.delete(oldest);
      }
    }

    this.cache.set(hash, {
      hash,
      wasm,
      timestamp: Date.now(),
      stats,
    });
    this.cacheSize += wasm.length;
  }

  /**
   * Find the oldest cache entry
   */
  private findOldestCacheEntry(): string | null {
    let oldest: string | null = null;
    let oldestTime = Infinity;

    for (const [hash, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldest = hash;
      }
    }

    return oldest;
  }

  /**
   * Count exports in WASM binary (simple heuristic)
   */
  private countExports(wasm: Uint8Array): number {
    // Export section is section ID 7
    // This is a simple heuristic - counts occurrences of export section marker
    let count = 0;
    for (let i = 0; i < wasm.length - 1; i++) {
      if (wasm[i] === 0x07) {
        // Found potential export section, count exports
        // This is simplified - proper parsing would read LEB128 encoded count
        count++;
      }
    }
    return Math.max(count, 1);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new Rust compiler instance
 */
export function createRustCompiler(config?: RustCompilerConfig): RustCompiler {
  return new RustCompiler(config);
}

// ============================================================================
// Rust Type Mappings
// ============================================================================

/**
 * Map TypeScript types to Rust types
 */
export const TYPESCRIPT_TO_RUST_TYPES: Record<string, string> = {
  'number': 'f64',
  'i32': 'i32',
  'i64': 'i64',
  'f32': 'f32',
  'f64': 'f64',
  'boolean': 'bool',
  'string': 'String',
  'void': '()',
  'bigint': 'i64',
  'Uint8Array': 'Vec<u8>',
  'Int32Array': 'Vec<i32>',
  'Float64Array': 'Vec<f64>',
};

/**
 * Map Rust types to WASM types
 */
export const RUST_TO_WASM_TYPES: Record<string, string> = {
  'i32': 'i32',
  'i64': 'i64',
  'f32': 'f32',
  'f64': 'f64',
  'bool': 'i32',
  '()': '',
  'usize': 'i32',
  'isize': 'i32',
  'u8': 'i32',
  'u16': 'i32',
  'u32': 'i32',
  'u64': 'i64',
  'i8': 'i32',
  'i16': 'i32',
};

// ============================================================================
// Rust Code Templates
// ============================================================================

export const RUST_TEMPLATES = {
  /**
   * Simple math function template
   */
  mathFunction: (name: string, op: '+' | '-' | '*' | '/', type: string = 'i32') => `
#[wasm_bindgen]
pub fn ${name}(a: ${type}, b: ${type}) -> ${type} {
    a ${op} b
}
`,

  /**
   * Memory allocation helpers
   */
  memoryHelpers: `
#[wasm_bindgen]
pub fn alloc(size: usize) -> *mut u8 {
    let mut buf = Vec::with_capacity(size);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[wasm_bindgen]
pub fn dealloc(ptr: *mut u8, size: usize) {
    unsafe {
        let _ = Vec::from_raw_parts(ptr, 0, size);
    }
}
`,

  /**
   * String handling helpers
   */
  stringHelpers: `
#[wasm_bindgen]
pub fn string_len(s: &str) -> usize {
    s.len()
}

#[wasm_bindgen]
pub fn string_concat(a: &str, b: &str) -> String {
    format!("{}{}", a, b)
}
`,

  /**
   * Counter with state
   */
  counter: (initial: number = 0) => `
use std::sync::atomic::{AtomicI32, Ordering};

static COUNTER: AtomicI32 = AtomicI32::new(${initial});

#[wasm_bindgen]
pub fn increment() -> i32 {
    COUNTER.fetch_add(1, Ordering::SeqCst) + 1
}

#[wasm_bindgen]
pub fn decrement() -> i32 {
    COUNTER.fetch_sub(1, Ordering::SeqCst) - 1
}

#[wasm_bindgen]
pub fn get_count() -> i32 {
    COUNTER.load(Ordering::SeqCst)
}

#[wasm_bindgen]
pub fn set_count(value: i32) {
    COUNTER.store(value, Ordering::SeqCst);
}
`,
};
