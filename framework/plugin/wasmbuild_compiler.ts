/**
 * wasmbuild Integration for Deno
 *
 * Uses Deno's recommended wasmbuild tool for Rust to WASM compilation
 * with automatic TypeScript bindings generation.
 *
 * wasmbuild is the official Deno tool that simplifies working with Rust and
 * WebAssembly in Deno projects. It handles:
 * - Compiling Rust code to WASM
 * - Generating TypeScript bindings
 * - Optimizing WASM binaries
 *
 * @see https://docs.deno.com/runtime/reference/wasm/
 * @see https://github.com/aspect-build/aspect-cli/tree/main/packages/wasmbuild
 */

import { getLogger } from '../telemetry/logger.ts';

const logger = getLogger();

/**
 * wasmbuild compiler configuration
 */
export interface WasmbuildConfig {
  /** Project directory containing Cargo.toml */
  projectDir: string;
  /** Output directory for generated files (default: './lib') */
  outDir?: string;
  /** Build in release mode (default: true) */
  release?: boolean;
  /** Additional wasmbuild arguments */
  additionalArgs?: string[];
  /** Environment variables for the build */
  env?: Record<string, string>;
  /** Build timeout in milliseconds (default: 300000 = 5 minutes) */
  timeout?: number;
}

/**
 * Result of a wasmbuild compilation
 */
export interface WasmbuildResult {
  /** Whether compilation succeeded */
  success: boolean;
  /** Path to the generated WASM file */
  wasmPath?: string;
  /** Path to the generated TypeScript bindings */
  bindingsPath?: string;
  /** Compilation errors (if any) */
  errors?: string[];
  /** Compilation warnings */
  warnings?: string[];
  /** Compilation statistics */
  stats?: {
    /** Total compilation time in milliseconds */
    compileTime: number;
    /** WASM binary size in bytes */
    wasmSize: number;
    /** TypeScript bindings size in bytes */
    bindingsSize: number;
  };
  /** Standard output from wasmbuild */
  stdout?: string;
  /** Standard error from wasmbuild */
  stderr?: string;
}

/**
 * Check result for wasmbuild availability
 */
export interface WasmbuildCheckResult {
  /** Whether wasmbuild is available */
  available: boolean;
  /** Version string if available */
  version?: string;
  /** Error message if not available */
  error?: string;
  /** Whether Rust toolchain is available */
  rustAvailable?: boolean;
  /** Rust version if available */
  rustVersion?: string;
}

/**
 * wasmbuild Compiler
 *
 * Provides integration with Deno's recommended wasmbuild tool for
 * compiling Rust to WASM with TypeScript bindings.
 *
 * @example
 * ```typescript
 * const compiler = new WasmbuildCompiler({
 *   projectDir: './my-rust-project',
 *   release: true,
 * });
 *
 * // Check availability
 * const check = await compiler.checkAvailability();
 * if (!check.available) {
 *   console.log('Install wasmbuild:', check.error);
 * }
 *
 * // Compile
 * const result = await compiler.compile();
 * if (result.success) {
 *   console.log('WASM:', result.wasmPath);
 *   console.log('Bindings:', result.bindingsPath);
 * }
 * ```
 */
export class WasmbuildCompiler {
  private config: Required<WasmbuildConfig>;

  constructor(config: WasmbuildConfig) {
    this.config = {
      projectDir: config.projectDir,
      outDir: config.outDir ?? './lib',
      release: config.release ?? true,
      additionalArgs: config.additionalArgs ?? [],
      env: config.env ?? {},
      timeout: config.timeout ?? 300000, // 5 minutes default
    };
  }

  /**
   * Check if wasmbuild and required tools are available
   */
  async checkAvailability(): Promise<WasmbuildCheckResult> {
    const result: WasmbuildCheckResult = {
      available: false,
    };

    // Check Rust toolchain
    try {
      const rustCmd = new Deno.Command('rustc', {
        args: ['--version'],
        stdout: 'piped',
        stderr: 'piped',
      });
      const rustOutput = await rustCmd.output();
      if (rustOutput.success) {
        result.rustAvailable = true;
        result.rustVersion = new TextDecoder().decode(rustOutput.stdout).trim();
      }
    } catch {
      result.rustAvailable = false;
    }

    // Check wasmbuild via deno run
    try {
      const cmd = new Deno.Command('deno', {
        args: ['run', '-A', 'https://deno.land/x/wasmbuild/main.ts', '--version'],
        stdout: 'piped',
        stderr: 'piped',
        env: {
          ...Deno.env.toObject(),
          ...this.config.env,
        },
      });

      const output = await cmd.output();
      if (output.success) {
        result.available = true;
        result.version = new TextDecoder().decode(output.stdout).trim();
      } else {
        result.error = 'wasmbuild returned non-zero exit code';
      }
    } catch (error) {
      result.error = `Failed to run wasmbuild: ${error instanceof Error ? error.message : String(error)}`;
    }

    if (!result.rustAvailable) {
      result.available = false;
      result.error = 'Rust toolchain not found. Install from https://rustup.rs/';
    }

    return result;
  }

  /**
   * Compile the Rust project to WASM using wasmbuild
   */
  async compile(): Promise<WasmbuildResult> {
    const startTime = performance.now();

    // Verify project exists
    try {
      const cargoPath = `${this.config.projectDir}/Cargo.toml`;
      await Deno.stat(cargoPath);
    } catch {
      return {
        success: false,
        errors: [`Cargo.toml not found in ${this.config.projectDir}`],
      };
    }

    // Build command arguments
    const args = ['run', '-A', 'https://deno.land/x/wasmbuild/main.ts'];

    if (this.config.release) {
      args.push('--release');
    }

    // Add output directory
    args.push('--out', this.config.outDir);

    // Add any additional arguments
    args.push(...this.config.additionalArgs);

    logger.debug('Running wasmbuild', { args, cwd: this.config.projectDir });

    try {
      const cmd = new Deno.Command('deno', {
        args,
        cwd: this.config.projectDir,
        stdout: 'piped',
        stderr: 'piped',
        env: {
          ...Deno.env.toObject(),
          ...this.config.env,
        },
      });

      // Handle timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      let output: Deno.CommandOutput;
      try {
        output = await cmd.output();
      } finally {
        clearTimeout(timeoutId);
      }

      const compileTime = performance.now() - startTime;
      const stdout = new TextDecoder().decode(output.stdout);
      const stderr = new TextDecoder().decode(output.stderr);

      if (!output.success) {
        // Parse errors from stderr
        const errors = this.parseErrors(stderr);
        const warnings = this.parseWarnings(stderr);

        return {
          success: false,
          errors: errors.length > 0 ? errors : [stderr || 'Compilation failed'],
          warnings,
          stdout,
          stderr,
          stats: { compileTime, wasmSize: 0, bindingsSize: 0 },
        };
      }

      // Find generated files
      const projectName = await this.getProjectName();
      const wasmPath = `${this.config.projectDir}/${this.config.outDir}/${projectName}_bg.wasm`;
      const bindingsPath = `${this.config.projectDir}/${this.config.outDir}/${projectName}.ts`;

      // Get file sizes
      let wasmSize = 0;
      let bindingsSize = 0;

      try {
        const wasmStat = await Deno.stat(wasmPath);
        wasmSize = wasmStat.size;
      } catch {
        // WASM file might have different name
      }

      try {
        const bindingsStat = await Deno.stat(bindingsPath);
        bindingsSize = bindingsStat.size;
      } catch {
        // Bindings file might have different name
      }

      const warnings = this.parseWarnings(stderr);

      return {
        success: true,
        wasmPath: wasmSize > 0 ? wasmPath : undefined,
        bindingsPath: bindingsSize > 0 ? bindingsPath : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        stdout,
        stderr,
        stats: {
          compileTime,
          wasmSize,
          bindingsSize,
        },
      };
    } catch (error) {
      const compileTime = performance.now() - startTime;

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          errors: [`Compilation timed out after ${this.config.timeout}ms`],
          stats: { compileTime, wasmSize: 0, bindingsSize: 0 },
        };
      }

      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)],
        stats: { compileTime, wasmSize: 0, bindingsSize: 0 },
      };
    }
  }

  /**
   * Get the Rust project name from Cargo.toml
   */
  private async getProjectName(): Promise<string> {
    try {
      const cargoPath = `${this.config.projectDir}/Cargo.toml`;
      const content = await Deno.readTextFile(cargoPath);

      // Simple TOML parsing for name field
      const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
      if (nameMatch) {
        // Convert kebab-case to snake_case for WASM output
        return nameMatch[1].replace(/-/g, '_');
      }
    } catch {
      // Ignore errors
    }

    return 'wasm_module';
  }

  /**
   * Parse error messages from stderr
   */
  private parseErrors(stderr: string): string[] {
    const errors: string[] = [];
    const errorRegex = /error(?:\[E\d+\])?:\s*(.+?)(?:\n\s*-->|$)/gs;
    let match;

    while ((match = errorRegex.exec(stderr)) !== null) {
      errors.push(match[1].trim());
    }

    return errors;
  }

  /**
   * Parse warning messages from stderr
   */
  private parseWarnings(stderr: string): string[] {
    const warnings: string[] = [];
    const warningRegex = /warning:\s*(.+?)(?:\n\s*-->|$)/gs;
    let match;

    while ((match = warningRegex.exec(stderr)) !== null) {
      warnings.push(match[1].trim());
    }

    return warnings;
  }

  /**
   * Clean the output directory
   */
  async clean(): Promise<void> {
    const outPath = `${this.config.projectDir}/${this.config.outDir}`;
    try {
      await Deno.remove(outPath, { recursive: true });
      logger.debug(`Cleaned output directory: ${outPath}`);
    } catch {
      // Directory might not exist
    }
  }

  /**
   * Get the configuration
   */
  getConfig(): Readonly<Required<WasmbuildConfig>> {
    return { ...this.config };
  }
}

/**
 * Quick helper to compile a Rust project with wasmbuild
 */
export async function compileWithWasmbuild(
  projectDir: string,
  options?: Partial<Omit<WasmbuildConfig, 'projectDir'>>
): Promise<WasmbuildResult> {
  const compiler = new WasmbuildCompiler({
    projectDir,
    ...options,
  });
  return compiler.compile();
}

/**
 * Check if wasmbuild is available in the current environment
 */
export async function isWasmbuildAvailable(): Promise<boolean> {
  const compiler = new WasmbuildCompiler({ projectDir: '.' });
  const check = await compiler.checkAvailability();
  return check.available;
}
