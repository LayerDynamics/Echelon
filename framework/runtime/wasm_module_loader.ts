/**
 * WASM Module Loader
 *
 * Handles loading, validating, and caching of WebAssembly modules
 * from various sources (files, URLs, bytes, base64).
 */

import type {
  WASMSource,
  WASMModule,
  WASMModuleInfo,
  WASMExportInfo,
  WASMImportInfo,
  WASMValidationResult,
  WASMFunctionSignature,
  WASMValueType,
} from './wasm_types.ts';
import { WASMEvents } from './wasm_types.ts';
import { EventEmitter } from '../plugin/events.ts';
import { getLogger } from '../telemetry/logger.ts';

const logger = getLogger();

/**
 * Module cache entry
 */
interface CacheEntry {
  module: WASMModule;
  bytes: Uint8Array;
  cachedAt: Date;
  lastAccessed: Date;
  accessCount: number;
}

/**
 * Loader options
 */
export interface WASMLoaderOptions {
  enableCache?: boolean;
  cacheTTL?: number;        // Cache TTL in milliseconds
  maxCacheSize?: number;    // Max cache entries
  validateOnLoad?: boolean;
  /** Use streaming compilation for URL sources (default: true for better performance) */
  preferStreaming?: boolean;
}

/**
 * WASM Module Loader
 *
 * Handles loading WASM modules from various sources with caching support.
 */
export class WASMModuleLoader {
  private cache: Map<string, CacheEntry> = new Map();
  private events: EventEmitter;
  private options: Required<WASMLoaderOptions>;
  private moduleCounter = 0;

  constructor(events: EventEmitter, options: WASMLoaderOptions = {}) {
    this.events = events;
    this.options = {
      enableCache: options.enableCache ?? true,
      cacheTTL: options.cacheTTL ?? 3600000, // 1 hour default
      maxCacheSize: options.maxCacheSize ?? 100,
      validateOnLoad: options.validateOnLoad ?? true,
      preferStreaming: options.preferStreaming ?? true, // Default ON per Deno best practices
    };
  }

  /**
   * Load a WASM module from a source descriptor
   *
   * For URL sources, streaming compilation is used by default (preferStreaming: true)
   * per Deno 2.1+ best practices. This is more memory-efficient and faster.
   *
   * Note: Streaming compilation skips byte caching since raw bytes aren't available.
   * Set preferStreaming: false if you need byte caching for URL sources.
   */
  async load(source: WASMSource): Promise<WASMModule> {
    const moduleId = source.moduleId ?? this.generateModuleId();

    this.events.emit(WASMEvents.MODULE_LOADING, { moduleId, source: source.type });

    try {
      // Use streaming for URL sources when preferred and validation is disabled
      // Streaming doesn't provide raw bytes, so we can't validate or cache bytes
      const useStreaming = source.type === 'url' &&
        this.options.preferStreaming &&
        !this.options.validateOnLoad;

      if (useStreaming) {
        // Streaming path - more efficient per Deno docs
        const compiledModule = await this.loadFromURLStreaming(source.value as string);

        // Extract module information (without bytes, size will be 0)
        const info = this.extractModuleInfoFromCompiled(moduleId, compiledModule, source);

        const wasmModule: WASMModule = {
          id: moduleId,
          info,
          compiledModule,
        };

        // Note: Cannot cache bytes with streaming - module is compiled directly
        // We still cache the module object itself
        if (this.options.enableCache) {
          this.cacheModuleWithoutBytes(moduleId, wasmModule);
        }

        this.events.emit(WASMEvents.MODULE_LOADED, {
          moduleId,
          size: 0, // Unknown with streaming
          exports: info.exports.length,
          imports: info.imports.length,
          streaming: true,
        });

        logger.debug(`Loaded WASM module via streaming: ${moduleId}`);

        return wasmModule;
      }

      // Non-streaming path - downloads full bytes first
      let bytes: Uint8Array;

      switch (source.type) {
        case 'file':
          bytes = await this.loadFromFile(source.value as string);
          break;
        case 'url':
          bytes = await this.loadFromURL(source.value as string);
          break;
        case 'bytes':
          bytes = source.value as Uint8Array;
          break;
        case 'base64':
          bytes = this.decodeBase64(source.value as string);
          break;
        default:
          throw new Error(`Unknown source type: ${source.type}`);
      }

      // Validate if enabled
      if (this.options.validateOnLoad) {
        const validation = await this.validate(bytes);
        if (!validation.valid) {
          const errors = validation.errors.map(e => e.message).join(', ');
          throw new Error(`WASM validation failed: ${errors}`);
        }
      }

      // Compile the module
      const compiledModule = await WebAssembly.compile(bytes as BufferSource);

      // Extract module information
      const info = this.extractModuleInfo(moduleId, compiledModule, bytes, source);

      const wasmModule: WASMModule = {
        id: moduleId,
        info,
        compiledModule,
      };

      // Cache if enabled
      if (this.options.enableCache) {
        this.cacheModule(moduleId, wasmModule, bytes);
      }

      this.events.emit(WASMEvents.MODULE_LOADED, {
        moduleId,
        size: bytes.length,
        exports: info.exports.length,
        imports: info.imports.length,
        streaming: false,
      });

      logger.debug(`Loaded WASM module: ${moduleId}`, { size: bytes.length });

      return wasmModule;
    } catch (error) {
      this.events.emit(WASMEvents.MODULE_ERROR, {
        moduleId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Load WASM bytes from a file
   */
  async loadFromFile(path: string): Promise<Uint8Array> {
    try {
      return await Deno.readFile(path);
    } catch (error) {
      throw new Error(`Failed to load WASM from file '${path}': ${error}`);
    }
  }

  /**
   * Load WASM bytes from a URL
   */
  async loadFromURL(url: string): Promise<Uint8Array> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const buffer = await response.arrayBuffer();
      return new Uint8Array(buffer);
    } catch (error) {
      throw new Error(`Failed to load WASM from URL '${url}': ${error}`);
    }
  }

  /**
   * Load and compile WASM from URL using streaming compilation.
   * This is more efficient than loadFromURL as it compiles while downloading.
   *
   * Per Deno 2.1+ best practices: Use WebAssembly.compileStreaming for better
   * memory efficiency and faster compilation.
   *
   * @see https://docs.deno.com/runtime/reference/wasm/
   */
  async loadFromURLStreaming(url: string): Promise<WebAssembly.Module> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      // Streaming compilation - more memory efficient per Deno docs
      return await WebAssembly.compileStreaming(response);
    } catch (error) {
      throw new Error(`Failed to stream-compile WASM from URL '${url}': ${error}`);
    }
  }

  /**
   * Load and instantiate WASM from URL in a single streaming operation.
   * Most efficient method when you need both compilation and instantiation.
   *
   * @see https://docs.deno.com/runtime/reference/wasm/
   */
  async loadAndInstantiateStreaming(
    url: string,
    imports: WebAssembly.Imports = {}
  ): Promise<{ module: WebAssembly.Module; instance: WebAssembly.Instance }> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      // Combined streaming compile + instantiate
      const result = await WebAssembly.instantiateStreaming(response, imports);
      return { module: result.module, instance: result.instance };
    } catch (error) {
      throw new Error(`Failed to stream-instantiate WASM from URL '${url}': ${error}`);
    }
  }

  /**
   * Decode base64 to bytes
   */
  private decodeBase64(base64: string): Uint8Array {
    // Remove potential data URL prefix
    const cleanBase64 = base64.replace(/^data:.*?;base64,/, '');
    const binaryString = atob(cleanBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Validate WASM bytes
   */
  async validate(bytes: Uint8Array): Promise<WASMValidationResult> {
    const errors: { code: string; message: string; offset?: number }[] = [];
    const warnings: { code: string; message: string; offset?: number }[] = [];

    try {
      // Check magic number
      if (bytes.length < 8) {
        errors.push({
          code: 'INVALID_SIZE',
          message: 'WASM binary too small (< 8 bytes)',
        });
        return { valid: false, errors, warnings };
      }

      const magic = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
      if (magic !== 0x0061736D) { // '\0asm' in big-endian
        errors.push({
          code: 'INVALID_MAGIC',
          message: 'Invalid WASM magic number',
          offset: 0,
        });
      }

      // Check version
      const version = bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24);
      if (version !== 1) {
        warnings.push({
          code: 'UNSUPPORTED_VERSION',
          message: `Unsupported WASM version: ${version}`,
          offset: 4,
        });
      }

      // Use WebAssembly.validate for full validation
      const valid = WebAssembly.validate(bytes as BufferSource);
      if (!valid) {
        errors.push({
          code: 'VALIDATION_FAILED',
          message: 'WebAssembly.validate() returned false',
        });
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      errors.push({
        code: 'VALIDATION_ERROR',
        message: error instanceof Error ? error.message : String(error),
      });
      return { valid: false, errors, warnings };
    }
  }

  /**
   * Extract module information from compiled module
   */
  private extractModuleInfo(
    moduleId: string,
    compiledModule: WebAssembly.Module,
    bytes: Uint8Array,
    source: WASMSource
  ): WASMModuleInfo {
    const moduleExports = WebAssembly.Module.exports(compiledModule);
    const moduleImports = WebAssembly.Module.imports(compiledModule);

    // Parse actual signatures from WASM binary (Phase 2 improvement)
    const exportSignatures = this.parseExportSignatures(bytes);

    const exports: WASMExportInfo[] = moduleExports.map((exp) => ({
      name: exp.name,
      kind: exp.kind as 'function' | 'table' | 'memory' | 'global',
      // Use parsed signature if available, otherwise fall back to inference
      signature: exp.kind === 'function'
        ? (exportSignatures.get(exp.name) ?? this.inferSignature(exp.name))
        : undefined,
    }));

    const imports: WASMImportInfo[] = moduleImports.map((imp) => ({
      module: imp.module,
      name: imp.name,
      kind: imp.kind as 'function' | 'table' | 'memory' | 'global',
      signature: imp.kind === 'function' ? this.inferSignature(imp.name) : undefined,
    }));

    return {
      id: moduleId,
      source: source.type,
      sourcePath: typeof source.value === 'string' ? source.value : undefined,
      size: bytes.length,
      exports,
      imports,
      loadedAt: new Date(),
      executionCount: 0,
    };
  }

  /**
   * Extract module information from compiled module (streaming path - no bytes available)
   * Used when loading via streaming compilation where raw bytes aren't accessible.
   */
  private extractModuleInfoFromCompiled(
    moduleId: string,
    compiledModule: WebAssembly.Module,
    source: WASMSource
  ): WASMModuleInfo {
    const moduleExports = WebAssembly.Module.exports(compiledModule);
    const moduleImports = WebAssembly.Module.imports(compiledModule);

    const exports: WASMExportInfo[] = moduleExports.map((exp) => ({
      name: exp.name,
      kind: exp.kind as 'function' | 'table' | 'memory' | 'global',
      signature: exp.kind === 'function' ? this.inferSignature(exp.name) : undefined,
    }));

    const imports: WASMImportInfo[] = moduleImports.map((imp) => ({
      module: imp.module,
      name: imp.name,
      kind: imp.kind as 'function' | 'table' | 'memory' | 'global',
      signature: imp.kind === 'function' ? this.inferSignature(imp.name) : undefined,
    }));

    return {
      id: moduleId,
      source: source.type,
      sourcePath: typeof source.value === 'string' ? source.value : undefined,
      size: 0, // Unknown with streaming - bytes not available
      exports,
      imports,
      loadedAt: new Date(),
      executionCount: 0,
    };
  }

  /**
   * Infer function signature from name (basic heuristics)
   * This is a fallback when bytes are not available (streaming).
   * In practice, you'd want to parse the WASM binary for actual signatures.
   */
  private inferSignature(_name: string): WASMFunctionSignature {
    // Default signature - actual implementation would parse WASM binary
    return {
      params: [] as WASMValueType[],
      results: [] as WASMValueType[],
    };
  }

  // ============================================================================
  // WASM Binary Parsing for Type Inference (Phase 2)
  // ============================================================================

  /**
   * Parsed function signatures from WASM binary
   */
  private parsedSignatures: Map<string, WASMFunctionSignature[]> = new Map();

  /**
   * Parse function signatures from WASM binary type section.
   * Per Deno docs, WASM provides type checking - we parse actual signatures.
   *
   * WASM binary format:
   * - Magic: 0x00 0x61 0x73 0x6D ('\0asm')
   * - Version: 0x01 0x00 0x00 0x00 (version 1)
   * - Sections: id (1 byte) + size (LEB128) + content
   *
   * Section IDs:
   * - 1: Type section (function signatures)
   * - 3: Function section (type indices)
   * - 7: Export section (exported items)
   */
  parseSignaturesFromBytes(bytes: Uint8Array): WASMFunctionSignature[] {
    const signatures: WASMFunctionSignature[] = [];

    if (bytes.length < 8) return signatures;

    // Verify magic number
    if (bytes[0] !== 0x00 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6D) {
      return signatures; // Invalid WASM
    }

    let pos = 8; // Skip magic + version

    while (pos < bytes.length) {
      const sectionId = bytes[pos++];
      if (pos >= bytes.length) break;

      const { value: sectionSize, bytesRead } = this.readLEB128Unsigned(bytes, pos);
      pos += bytesRead;

      if (sectionId === 1) { // Type section
        const sectionEnd = pos + sectionSize;
        const { value: typeCount, bytesRead: countBytes } = this.readLEB128Unsigned(bytes, pos);
        pos += countBytes;

        for (let i = 0; i < typeCount && pos < sectionEnd; i++) {
          const funcType = bytes[pos++];
          if (funcType !== 0x60) continue; // 0x60 = function type

          // Parse parameter types
          const { value: paramCount, bytesRead: paramCountBytes } = this.readLEB128Unsigned(bytes, pos);
          pos += paramCountBytes;
          const params: WASMValueType[] = [];
          for (let j = 0; j < paramCount && pos < sectionEnd; j++) {
            params.push(this.byteToValueType(bytes[pos++]));
          }

          // Parse result types
          const { value: resultCount, bytesRead: resultCountBytes } = this.readLEB128Unsigned(bytes, pos);
          pos += resultCountBytes;
          const results: WASMValueType[] = [];
          for (let j = 0; j < resultCount && pos < sectionEnd; j++) {
            results.push(this.byteToValueType(bytes[pos++]));
          }

          signatures.push({ params, results });
        }
        break; // Found type section, done
      }

      pos += sectionSize; // Skip to next section
    }

    return signatures;
  }

  /**
   * Build a map of export names to their function signatures.
   * Requires parsing Type, Function, and Export sections.
   */
  parseExportSignatures(bytes: Uint8Array): Map<string, WASMFunctionSignature> {
    const exportSignatures = new Map<string, WASMFunctionSignature>();

    if (bytes.length < 8) return exportSignatures;

    // Verify magic number
    if (bytes[0] !== 0x00 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6D) {
      return exportSignatures;
    }

    const typeSignatures: WASMFunctionSignature[] = [];
    const funcTypeIndices: number[] = [];
    const exportFuncs: Array<{ name: string; funcIndex: number }> = [];
    let numImportedFuncs = 0;

    let pos = 8;

    while (pos < bytes.length) {
      const sectionId = bytes[pos++];
      if (pos >= bytes.length) break;

      const { value: sectionSize, bytesRead } = this.readLEB128Unsigned(bytes, pos);
      pos += bytesRead;
      const sectionEnd = pos + sectionSize;

      switch (sectionId) {
        case 1: { // Type section
          const { value: typeCount, bytesRead: countBytes } = this.readLEB128Unsigned(bytes, pos);
          pos += countBytes;

          for (let i = 0; i < typeCount && pos < sectionEnd; i++) {
            const funcType = bytes[pos++];
            if (funcType !== 0x60) {
              pos = sectionEnd;
              break;
            }

            const { value: paramCount, bytesRead: pb } = this.readLEB128Unsigned(bytes, pos);
            pos += pb;
            const params: WASMValueType[] = [];
            for (let j = 0; j < paramCount; j++) {
              params.push(this.byteToValueType(bytes[pos++]));
            }

            const { value: resultCount, bytesRead: rb } = this.readLEB128Unsigned(bytes, pos);
            pos += rb;
            const results: WASMValueType[] = [];
            for (let j = 0; j < resultCount; j++) {
              results.push(this.byteToValueType(bytes[pos++]));
            }

            typeSignatures.push({ params, results });
          }
          break;
        }

        case 2: { // Import section - count imported functions
          const { value: importCount, bytesRead: ib } = this.readLEB128Unsigned(bytes, pos);
          pos += ib;

          for (let i = 0; i < importCount && pos < sectionEnd; i++) {
            // Module name (string)
            const { value: modLen, bytesRead: mlb } = this.readLEB128Unsigned(bytes, pos);
            pos += mlb + modLen;
            // Import name (string)
            const { value: nameLen, bytesRead: nlb } = this.readLEB128Unsigned(bytes, pos);
            pos += nlb + nameLen;
            // Import kind
            const importKind = bytes[pos++];
            if (importKind === 0x00) { // Function import
              numImportedFuncs++;
              const { bytesRead: tib } = this.readLEB128Unsigned(bytes, pos);
              pos += tib;
            } else if (importKind === 0x01) { // Table
              pos += 3; // Simplified skip
            } else if (importKind === 0x02) { // Memory
              const flags = bytes[pos++];
              const { bytesRead: minb } = this.readLEB128Unsigned(bytes, pos);
              pos += minb;
              if (flags & 0x01) {
                const { bytesRead: maxb } = this.readLEB128Unsigned(bytes, pos);
                pos += maxb;
              }
            } else if (importKind === 0x03) { // Global
              pos += 2; // type + mutability
            }
          }
          break;
        }

        case 3: { // Function section
          const { value: funcCount, bytesRead: fb } = this.readLEB128Unsigned(bytes, pos);
          pos += fb;

          for (let i = 0; i < funcCount && pos < sectionEnd; i++) {
            const { value: typeIdx, bytesRead: tib } = this.readLEB128Unsigned(bytes, pos);
            pos += tib;
            funcTypeIndices.push(typeIdx);
          }
          break;
        }

        case 7: { // Export section
          const { value: exportCount, bytesRead: eb } = this.readLEB128Unsigned(bytes, pos);
          pos += eb;

          for (let i = 0; i < exportCount && pos < sectionEnd; i++) {
            // Export name (string)
            const { value: nameLen, bytesRead: nlb } = this.readLEB128Unsigned(bytes, pos);
            pos += nlb;
            const nameBytes = bytes.slice(pos, pos + nameLen);
            const name = new TextDecoder().decode(nameBytes);
            pos += nameLen;

            // Export kind
            const exportKind = bytes[pos++];
            // Export index
            const { value: exportIndex, bytesRead: eib } = this.readLEB128Unsigned(bytes, pos);
            pos += eib;

            if (exportKind === 0x00) { // Function export
              exportFuncs.push({ name, funcIndex: exportIndex });
            }
          }
          break;
        }

        default:
          pos = sectionEnd;
      }

      if (pos < sectionEnd) {
        pos = sectionEnd;
      }
    }

    // Map exports to signatures
    for (const { name, funcIndex } of exportFuncs) {
      // funcIndex includes imported functions, which come first
      const localFuncIndex = funcIndex - numImportedFuncs;
      if (localFuncIndex >= 0 && localFuncIndex < funcTypeIndices.length) {
        const typeIndex = funcTypeIndices[localFuncIndex];
        if (typeIndex < typeSignatures.length) {
          exportSignatures.set(name, typeSignatures[typeIndex]);
        }
      }
    }

    return exportSignatures;
  }

  /**
   * Read unsigned LEB128 encoded integer
   */
  private readLEB128Unsigned(bytes: Uint8Array, start: number): { value: number; bytesRead: number } {
    let result = 0;
    let shift = 0;
    let pos = start;
    let byte: number;

    do {
      if (pos >= bytes.length) {
        return { value: result, bytesRead: pos - start };
      }
      byte = bytes[pos++];
      result |= (byte & 0x7F) << shift;
      shift += 7;
    } while (byte & 0x80);

    return { value: result, bytesRead: pos - start };
  }

  /**
   * Convert WASM type byte to WASMValueType
   */
  private byteToValueType(byte: number): WASMValueType {
    const typeMap: Record<number, WASMValueType> = {
      0x7F: 'i32',
      0x7E: 'i64',
      0x7D: 'f32',
      0x7C: 'f64',
      0x7B: 'v128',
      0x70: 'funcref',
      0x6F: 'externref',
    };
    return typeMap[byte] ?? 'i32';
  }

  // ============================================================================
  // TypeScript Declaration Generation (Phase 4)
  // ============================================================================

  /**
   * Generate TypeScript declaration (.d.ts) content for a WASM module.
   *
   * Per Deno 2.1+ best practices, WASM imports are type-checked. This method
   * generates type declarations for dynamic loading scenarios where native
   * import type inference isn't available.
   *
   * @example
   * ```typescript
   * const loader = new WASMModuleLoader(events);
   * const module = await loader.load({ type: 'file', value: './add.wasm' });
   * const declaration = loader.generateTypeDeclaration(module);
   * // Write to add.wasm.d.ts
   * ```
   */
  generateTypeDeclaration(module: WASMModule): string {
    const lines: string[] = [
      '// Auto-generated TypeScript declarations for WASM module',
      `// Module: ${module.id}`,
      `// Generated: ${new Date().toISOString()}`,
      '',
      'declare module "*.wasm" {',
    ];

    // Generate function exports
    const funcExports = module.info.exports.filter(e => e.kind === 'function');
    for (const exp of funcExports) {
      const sig = exp.signature;
      if (sig) {
        const params = sig.params.map((t, i) => `arg${i}: ${this.wasmTypeToTS(t)}`).join(', ');
        const returnType = sig.results.length === 0
          ? 'void'
          : sig.results.length === 1
            ? this.wasmTypeToTS(sig.results[0])
            : `[${sig.results.map(t => this.wasmTypeToTS(t)).join(', ')}]`;
        lines.push(`  export function ${exp.name}(${params}): ${returnType};`);
      } else {
        // Fallback for unknown signatures
        lines.push(`  export function ${exp.name}(...args: number[]): number;`);
      }
    }

    // Generate memory export
    const memoryExports = module.info.exports.filter(e => e.kind === 'memory');
    for (const exp of memoryExports) {
      lines.push(`  export const ${exp.name}: WebAssembly.Memory;`);
    }

    // Generate table export
    const tableExports = module.info.exports.filter(e => e.kind === 'table');
    for (const exp of tableExports) {
      lines.push(`  export const ${exp.name}: WebAssembly.Table;`);
    }

    // Generate global exports
    const globalExports = module.info.exports.filter(e => e.kind === 'global');
    for (const exp of globalExports) {
      lines.push(`  export const ${exp.name}: WebAssembly.Global;`);
    }

    lines.push('}');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generate TypeScript declaration for a specific WASM module path.
   * Creates declarations that match Deno's native WASM import syntax.
   *
   * @example
   * ```typescript
   * // For ./math.wasm containing add(i32, i32) -> i32
   * const decl = loader.generateModuleDeclaration('./math.wasm', module);
   * // Result:
   * // declare module "./math.wasm" {
   * //   export function add(arg0: number, arg1: number): number;
   * // }
   * ```
   */
  generateModuleDeclaration(modulePath: string, module: WASMModule): string {
    const lines: string[] = [
      '// Auto-generated TypeScript declarations for WASM module',
      `// Source: ${modulePath}`,
      `// Generated: ${new Date().toISOString()}`,
      '',
      `declare module "${modulePath}" {`,
    ];

    // Generate function exports with actual signatures
    const funcExports = module.info.exports.filter(e => e.kind === 'function');
    for (const exp of funcExports) {
      const sig = exp.signature;
      if (sig) {
        const params = sig.params.map((t, i) => `arg${i}: ${this.wasmTypeToTS(t)}`).join(', ');
        const returnType = sig.results.length === 0
          ? 'void'
          : sig.results.length === 1
            ? this.wasmTypeToTS(sig.results[0])
            : `[${sig.results.map(t => this.wasmTypeToTS(t)).join(', ')}]`;
        lines.push(`  export function ${exp.name}(${params}): ${returnType};`);
      } else {
        lines.push(`  export function ${exp.name}(...args: number[]): number;`);
      }
    }

    // Generate non-function exports
    for (const exp of module.info.exports) {
      if (exp.kind === 'memory') {
        lines.push(`  export const ${exp.name}: WebAssembly.Memory;`);
      } else if (exp.kind === 'table') {
        lines.push(`  export const ${exp.name}: WebAssembly.Table;`);
      } else if (exp.kind === 'global') {
        lines.push(`  export const ${exp.name}: WebAssembly.Global;`);
      }
    }

    lines.push('}');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Convert WASM value type to TypeScript type
   */
  private wasmTypeToTS(type: WASMValueType): string {
    const typeMap: Record<WASMValueType, string> = {
      'i32': 'number',
      'i64': 'bigint',
      'f32': 'number',
      'f64': 'number',
      'v128': 'Int8Array', // SIMD 128-bit vector
      'funcref': 'Function',
      'externref': 'unknown',
    };
    return typeMap[type] ?? 'unknown';
  }

  /**
   * Generate a unique module ID
   */
  private generateModuleId(): string {
    return `wasm_module_${Date.now()}_${++this.moduleCounter}`;
  }

  /**
   * Cache a module
   */
  private cacheModule(moduleId: string, module: WASMModule, bytes: Uint8Array): void {
    // Evict old entries if cache is full
    if (this.cache.size >= this.options.maxCacheSize) {
      this.evictOldestEntry();
    }

    this.cache.set(moduleId, {
      module,
      bytes,
      cachedAt: new Date(),
      lastAccessed: new Date(),
      accessCount: 1,
    });
  }

  /**
   * Cache a module without bytes (for streaming-loaded modules)
   * The compiled module is cached but raw bytes are not available.
   */
  private cacheModuleWithoutBytes(moduleId: string, module: WASMModule): void {
    // Evict old entries if cache is full
    if (this.cache.size >= this.options.maxCacheSize) {
      this.evictOldestEntry();
    }

    this.cache.set(moduleId, {
      module,
      bytes: new Uint8Array(0), // Empty - streaming doesn't provide bytes
      cachedAt: new Date(),
      lastAccessed: new Date(),
      accessCount: 1,
    });
  }

  /**
   * Get a cached module
   */
  getCachedModule(moduleId: string): WASMModule | null {
    const entry = this.cache.get(moduleId);
    if (!entry) return null;

    // Check TTL
    const age = Date.now() - entry.cachedAt.getTime();
    if (age > this.options.cacheTTL) {
      this.cache.delete(moduleId);
      return null;
    }

    // Update access stats
    entry.lastAccessed = new Date();
    entry.accessCount++;

    return entry.module;
  }

  /**
   * Get cached module bytes
   */
  getCachedBytes(moduleId: string): Uint8Array | null {
    const entry = this.cache.get(moduleId);
    return entry?.bytes ?? null;
  }

  /**
   * Invalidate cache entry or all entries
   */
  invalidateCache(moduleId?: string): void {
    if (moduleId) {
      this.cache.delete(moduleId);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Evict the oldest cache entry
   */
  private evictOldestEntry(): void {
    let oldest: string | null = null;
    let oldestTime = Infinity;

    for (const [id, entry] of this.cache) {
      const time = entry.lastAccessed.getTime();
      if (time < oldestTime) {
        oldestTime = time;
        oldest = id;
      }
    }

    if (oldest) {
      this.cache.delete(oldest);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    entries: Array<{
      moduleId: string;
      size: number;
      cachedAt: Date;
      lastAccessed: Date;
      accessCount: number;
    }>;
  } {
    const entries = Array.from(this.cache.entries()).map(([moduleId, entry]) => ({
      moduleId,
      size: entry.bytes.length,
      cachedAt: entry.cachedAt,
      lastAccessed: entry.lastAccessed,
      accessCount: entry.accessCount,
    }));

    return {
      size: this.cache.size,
      maxSize: this.options.maxCacheSize,
      entries,
    };
  }

  /**
   * Preload a list of modules
   */
  async preloadModules(sources: WASMSource[]): Promise<Map<string, WASMModule>> {
    const results = new Map<string, WASMModule>();

    await Promise.all(
      sources.map(async (source) => {
        try {
          const module = await this.load(source);
          results.set(module.id, module);
        } catch (error) {
          logger.error(`Failed to preload module`, error as Error, { source });
        }
      })
    );

    return results;
  }

  /**
   * Clone a module (creates a new instance from cached bytes)
   */
  async cloneModule(moduleId: string, newId?: string): Promise<WASMModule | null> {
    const bytes = this.getCachedBytes(moduleId);
    if (!bytes) return null;

    return this.load({
      type: 'bytes',
      value: bytes,
      moduleId: newId,
    });
  }

  /**
   * Get module by ID from cache
   */
  getModule(moduleId: string): WASMModule | undefined {
    return this.cache.get(moduleId)?.module;
  }

  /**
   * Check if a module is cached
   */
  isCached(moduleId: string): boolean {
    return this.cache.has(moduleId);
  }

  /**
   * Get all cached module IDs
   */
  getCachedModuleIds(): string[] {
    return Array.from(this.cache.keys());
  }
}
