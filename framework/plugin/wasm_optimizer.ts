/**
 * WASM Optimizer
 *
 * Provides optimization passes for WebAssembly modules.
 * Performs size and speed optimizations on WASM binary.
 */

import type {
  WASMOptimizationLevel,
  WASMValidationResult,
} from '../runtime/wasm_types.ts';
import { getLogger } from '../telemetry/logger.ts';

const logger = getLogger();

/**
 * Optimization statistics
 */
export interface OptimizationStats {
  originalSize: number;
  optimizedSize: number;
  sizeSaved: number;
  percentReduction: number;
  passesApplied: string[];
  duration: number;
}

/**
 * Optimization pass result
 */
interface PassResult {
  wasm: Uint8Array;
  modified: boolean;
}

/**
 * WASM Optimizer
 *
 * Applies various optimization passes to WASM modules.
 */
export class WASMOptimizer {
  /**
   * Optimize a WASM module
   */
  async optimize(
    wasm: Uint8Array,
    level: WASMOptimizationLevel = 'speed'
  ): Promise<{ wasm: Uint8Array; stats: OptimizationStats }> {
    const startTime = performance.now();
    const originalSize = wasm.length;
    const passesApplied: string[] = [];

    let optimized = wasm;

    // Validate input first
    const validation = await this.validate(wasm);
    if (!validation.valid) {
      throw new Error(`Invalid WASM input: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    // Apply optimization passes based on level
    const passes = this.getPassesForLevel(level);

    for (const pass of passes) {
      try {
        const result = await pass.apply(optimized);
        if (result.modified) {
          optimized = result.wasm;
          passesApplied.push(pass.name);
        }
      } catch (error) {
        logger.warn(`Optimization pass '${pass.name}' failed: ${error}`);
      }
    }

    const duration = performance.now() - startTime;
    const optimizedSize = optimized.length;
    const sizeSaved = originalSize - optimizedSize;

    return {
      wasm: optimized,
      stats: {
        originalSize,
        optimizedSize,
        sizeSaved,
        percentReduction: (sizeSaved / originalSize) * 100,
        passesApplied,
        duration,
      },
    };
  }

  /**
   * Validate WASM binary
   */
  async validate(wasm: Uint8Array): Promise<WASMValidationResult> {
    const errors: { code: string; message: string }[] = [];
    const warnings: { code: string; message: string }[] = [];

    // Check magic number
    if (wasm.length < 8) {
      errors.push({ code: 'TOO_SMALL', message: 'WASM binary is too small' });
      return { valid: false, errors, warnings };
    }

    const magic = (wasm[0] << 24) | (wasm[1] << 16) | (wasm[2] << 8) | wasm[3];
    if (magic !== 0x0061736D) {
      errors.push({ code: 'INVALID_MAGIC', message: 'Invalid WASM magic number' });
    }

    // Check version
    const version = wasm[4] | (wasm[5] << 8) | (wasm[6] << 16) | (wasm[7] << 24);
    if (version !== 1) {
      warnings.push({ code: 'VERSION', message: `Unexpected WASM version: ${version}` });
    }

    // Use WebAssembly.validate for full validation
    try {
      const valid = WebAssembly.validate(wasm as BufferSource);
      if (!valid) {
        errors.push({ code: 'VALIDATION_FAILED', message: 'WebAssembly.validate returned false' });
      }
    } catch (error) {
      errors.push({ code: 'VALIDATION_ERROR', message: String(error) });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get optimization passes for a level
   */
  private getPassesForLevel(level: WASMOptimizationLevel): OptimizationPass[] {
    switch (level) {
      case 'none':
        return [];

      case 'size':
        return [
          new RemoveUnusedPass(),
          new MergeBlocksPass(),
          new SimplifyInstructionsPass(),
          new CompactNamesPass(),
        ];

      case 'speed':
        return [
          new RemoveUnusedPass(),
          new InlineSmallFunctionsPass(),
          new SimplifyInstructionsPass(),
          new OptimizeLocalsPass(),
        ];

      case 'aggressive':
        return [
          new RemoveUnusedPass(),
          new InlineSmallFunctionsPass(),
          new MergeBlocksPass(),
          new SimplifyInstructionsPass(),
          new OptimizeLocalsPass(),
          new CompactNamesPass(),
          new DeadCodeEliminationPass(),
          new ConstantFoldingPass(),
        ];

      default:
        return [];
    }
  }

  /**
   * Apply a specific optimization pass
   */
  async applyPass(wasm: Uint8Array, passName: string): Promise<Uint8Array> {
    const pass = this.getPassByName(passName);
    if (!pass) {
      throw new Error(`Unknown optimization pass: ${passName}`);
    }

    const result = await pass.apply(wasm);
    return result.wasm;
  }

  /**
   * Get available optimization passes
   */
  getAvailablePasses(): string[] {
    return [
      'remove-unused',
      'inline-small-functions',
      'merge-blocks',
      'simplify-instructions',
      'optimize-locals',
      'compact-names',
      'dead-code-elimination',
      'constant-folding',
    ];
  }

  /**
   * Get pass by name
   */
  private getPassByName(name: string): OptimizationPass | null {
    const passes: Record<string, OptimizationPass> = {
      'remove-unused': new RemoveUnusedPass(),
      'inline-small-functions': new InlineSmallFunctionsPass(),
      'merge-blocks': new MergeBlocksPass(),
      'simplify-instructions': new SimplifyInstructionsPass(),
      'optimize-locals': new OptimizeLocalsPass(),
      'compact-names': new CompactNamesPass(),
      'dead-code-elimination': new DeadCodeEliminationPass(),
      'constant-folding': new ConstantFoldingPass(),
    };

    return passes[name] ?? null;
  }

  /**
   * Strip debug info from WASM module
   */
  stripDebugInfo(wasm: Uint8Array): Uint8Array {
    // Remove custom sections that contain debug info
    return this.removeCustomSections(wasm, ['name', 'sourceMappingURL']);
  }

  /**
   * Remove specific custom sections
   */
  private removeCustomSections(wasm: Uint8Array, sectionNames: string[]): Uint8Array {
    const result: number[] = [];
    let pos = 0;

    // Copy header
    result.push(...wasm.slice(0, 8));
    pos = 8;

    // Process sections
    while (pos < wasm.length) {
      const sectionId = wasm[pos];
      pos++;

      // Read section size
      const { value: sectionSize, bytes: sizeBytes } = this.readULEB128(wasm, pos);
      pos += sizeBytes;

      if (sectionId === 0) {
        // Custom section - check name
        const { value: nameLen, bytes: nameLenBytes } = this.readULEB128(wasm, pos);
        const name = new TextDecoder().decode(wasm.slice(pos + nameLenBytes, pos + nameLenBytes + nameLen));

        if (!sectionNames.includes(name)) {
          // Keep this custom section
          result.push(0);
          result.push(...this.encodeULEB128(sectionSize));
          result.push(...wasm.slice(pos, pos + sectionSize));
        }
        pos += sectionSize;
      } else {
        // Keep non-custom sections
        result.push(sectionId);
        result.push(...this.encodeULEB128(sectionSize));
        result.push(...wasm.slice(pos, pos + sectionSize));
        pos += sectionSize;
      }
    }

    return new Uint8Array(result);
  }

  /**
   * Read unsigned LEB128 value
   */
  private readULEB128(data: Uint8Array, offset: number): { value: number; bytes: number } {
    let result = 0;
    let shift = 0;
    let byte: number;
    let bytes = 0;

    do {
      byte = data[offset + bytes];
      result |= (byte & 0x7F) << shift;
      shift += 7;
      bytes++;
    } while (byte >= 0x80);

    return { value: result, bytes };
  }

  /**
   * Encode unsigned LEB128 value
   */
  private encodeULEB128(value: number): number[] {
    const result: number[] = [];
    do {
      let byte = value & 0x7F;
      value >>>= 7;
      if (value !== 0) {
        byte |= 0x80;
      }
      result.push(byte);
    } while (value !== 0);
    return result;
  }
}

// ============================================================================
// WASM Binary Section IDs
// ============================================================================

const enum SectionId {
  Custom = 0,
  Type = 1,
  Import = 2,
  Function = 3,
  Table = 4,
  Memory = 5,
  Global = 6,
  Export = 7,
  Start = 8,
  Element = 9,
  Code = 10,
  Data = 11,
  DataCount = 12,
}

// WASM Opcodes for optimization
const enum Opcode {
  Unreachable = 0x00,
  Nop = 0x01,
  Block = 0x02,
  Loop = 0x03,
  If = 0x04,
  Else = 0x05,
  End = 0x0B,
  Br = 0x0C,
  BrIf = 0x0D,
  BrTable = 0x0E,
  Return = 0x0F,
  Call = 0x10,
  CallIndirect = 0x11,
  Drop = 0x1A,
  Select = 0x1B,
  LocalGet = 0x20,
  LocalSet = 0x21,
  LocalTee = 0x22,
  GlobalGet = 0x23,
  GlobalSet = 0x24,
  I32Const = 0x41,
  I64Const = 0x42,
  F32Const = 0x43,
  F64Const = 0x44,
  I32Eqz = 0x45,
  I32Add = 0x6A,
  I32Sub = 0x6B,
  I32Mul = 0x6C,
  I32DivS = 0x6D,
  I32DivU = 0x6E,
  I32And = 0x71,
  I32Or = 0x72,
  I32Xor = 0x73,
  I32Shl = 0x74,
  I32ShrS = 0x75,
  I32ShrU = 0x76,
  I64Add = 0x7C,
  I64Sub = 0x7D,
  I64Mul = 0x7E,
}

// ============================================================================
// WASM Binary Parser/Analyzer
// ============================================================================

/**
 * Parsed WASM section
 */
interface ParsedSection {
  id: number;
  offset: number;
  size: number;
  content: Uint8Array;
}

/**
 * Parsed WASM function
 */
interface ParsedFunction {
  index: number;
  typeIndex: number;
  locals: number[];
  bodyOffset: number;
  bodySize: number;
  code: Uint8Array;
}

/**
 * WASM Binary Parser for optimization analysis
 */
class WASMBinaryParser {
  private data: Uint8Array;
  private pos: number = 0;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  /**
   * Parse all sections from WASM binary
   */
  parseSections(): ParsedSection[] {
    const sections: ParsedSection[] = [];
    this.pos = 8; // Skip magic and version

    while (this.pos < this.data.length) {
      const sectionId = this.data[this.pos++];
      const { value: sectionSize, bytes } = this.readULEB128();
      this.pos += bytes - 1; // readULEB128 includes first byte

      sections.push({
        id: sectionId,
        offset: this.pos,
        size: sectionSize,
        content: this.data.slice(this.pos, this.pos + sectionSize),
      });

      this.pos += sectionSize;
    }

    return sections;
  }

  /**
   * Parse type section
   */
  parseTypeSection(content: Uint8Array): { params: number[]; results: number[] }[] {
    const types: { params: number[]; results: number[] }[] = [];
    let pos = 0;

    const { value: count, bytes } = this.readULEB128At(content, pos);
    pos += bytes;

    for (let i = 0; i < count; i++) {
      pos++; // Skip 0x60 (function type marker)

      const { value: paramCount, bytes: paramBytes } = this.readULEB128At(content, pos);
      pos += paramBytes;

      const params: number[] = [];
      for (let j = 0; j < paramCount; j++) {
        params.push(content[pos++]);
      }

      const { value: resultCount, bytes: resultBytes } = this.readULEB128At(content, pos);
      pos += resultBytes;

      const results: number[] = [];
      for (let j = 0; j < resultCount; j++) {
        results.push(content[pos++]);
      }

      types.push({ params, results });
    }

    return types;
  }

  /**
   * Parse function section (type indices)
   */
  parseFunctionSection(content: Uint8Array): number[] {
    const typeIndices: number[] = [];
    let pos = 0;

    const { value: count, bytes } = this.readULEB128At(content, pos);
    pos += bytes;

    for (let i = 0; i < count; i++) {
      const { value: typeIndex, bytes: indexBytes } = this.readULEB128At(content, pos);
      pos += indexBytes;
      typeIndices.push(typeIndex);
    }

    return typeIndices;
  }

  /**
   * Parse export section
   */
  parseExportSection(content: Uint8Array): { name: string; kind: number; index: number }[] {
    const exports: { name: string; kind: number; index: number }[] = [];
    let pos = 0;

    const { value: count, bytes } = this.readULEB128At(content, pos);
    pos += bytes;

    for (let i = 0; i < count; i++) {
      const { value: nameLen, bytes: nameBytes } = this.readULEB128At(content, pos);
      pos += nameBytes;

      const name = new TextDecoder().decode(content.slice(pos, pos + nameLen));
      pos += nameLen;

      const kind = content[pos++];

      const { value: index, bytes: indexBytes } = this.readULEB128At(content, pos);
      pos += indexBytes;

      exports.push({ name, kind, index });
    }

    return exports;
  }

  /**
   * Parse code section into function bodies
   */
  parseCodeSection(content: Uint8Array, startIndex: number): ParsedFunction[] {
    const functions: ParsedFunction[] = [];
    let pos = 0;

    const { value: count, bytes } = this.readULEB128At(content, pos);
    pos += bytes;

    for (let i = 0; i < count; i++) {
      const { value: bodySize, bytes: sizeBytes } = this.readULEB128At(content, pos);
      pos += sizeBytes;

      const bodyStart = pos;

      // Parse locals
      const { value: localGroupCount, bytes: localBytes } = this.readULEB128At(content, pos);
      pos += localBytes;

      const locals: number[] = [];
      for (let j = 0; j < localGroupCount; j++) {
        const { value: localCount, bytes: countBytes } = this.readULEB128At(content, pos);
        pos += countBytes;
        const localType = content[pos++];
        for (let k = 0; k < localCount; k++) {
          locals.push(localType);
        }
      }

      functions.push({
        index: startIndex + i,
        typeIndex: 0, // Will be filled later
        locals,
        bodyOffset: pos,
        bodySize: bodySize - (pos - bodyStart),
        code: content.slice(pos, bodyStart + bodySize),
      });

      pos = bodyStart + bodySize;
    }

    return functions;
  }

  /**
   * Read unsigned LEB128 at position
   */
  private readULEB128At(data: Uint8Array, offset: number): { value: number; bytes: number } {
    let result = 0;
    let shift = 0;
    let bytes = 0;

    do {
      const byte = data[offset + bytes];
      result |= (byte & 0x7F) << shift;
      shift += 7;
      bytes++;
    } while (data[offset + bytes - 1] >= 0x80);

    return { value: result, bytes };
  }

  /**
   * Read signed LEB128 at position
   */
  readSLEB128At(data: Uint8Array, offset: number): { value: number; bytes: number } {
    let result = 0;
    let shift = 0;
    let bytes = 0;
    let byte: number;

    do {
      byte = data[offset + bytes];
      result |= (byte & 0x7F) << shift;
      shift += 7;
      bytes++;
    } while (byte >= 0x80);

    if (shift < 32 && (byte & 0x40) !== 0) {
      result |= (~0 << shift);
    }

    return { value: result, bytes };
  }

  /**
   * Read current position
   */
  private readULEB128(): { value: number; bytes: number } {
    return this.readULEB128At(this.data, this.pos);
  }
}

/**
 * WASM Binary Rewriter
 */
class WASMBinaryRewriter {
  /**
   * Encode unsigned LEB128
   */
  static encodeULEB128(value: number): number[] {
    const result: number[] = [];
    do {
      let byte = value & 0x7F;
      value >>>= 7;
      if (value !== 0) {
        byte |= 0x80;
      }
      result.push(byte);
    } while (value !== 0);
    return result;
  }

  /**
   * Encode signed LEB128
   */
  static encodeSLEB128(value: number): number[] {
    const result: number[] = [];
    let more = true;

    while (more) {
      let byte = value & 0x7F;
      value >>= 7;

      if ((value === 0 && (byte & 0x40) === 0) ||
          (value === -1 && (byte & 0x40) !== 0)) {
        more = false;
      } else {
        byte |= 0x80;
      }
      result.push(byte);
    }
    return result;
  }

  /**
   * Rebuild WASM module from sections
   */
  static rebuildModule(sections: ParsedSection[]): Uint8Array {
    const result: number[] = [0x00, 0x61, 0x73, 0x6D, 0x01, 0x00, 0x00, 0x00];

    for (const section of sections) {
      result.push(section.id);
      result.push(...this.encodeULEB128(section.content.length));
      result.push(...section.content);
    }

    return new Uint8Array(result);
  }
}

// ============================================================================
// Optimization Passes
// ============================================================================

/**
 * Base optimization pass interface
 */
interface OptimizationPass {
  name: string;
  apply(wasm: Uint8Array): Promise<PassResult>;
}

/**
 * Remove unused functions, globals, and types
 *
 * Analyzes exports and call graph to find unreferenced functions,
 * then removes them from the module.
 */
class RemoveUnusedPass implements OptimizationPass {
  name = 'remove-unused';

  async apply(wasm: Uint8Array): Promise<PassResult> {
    const parser = new WASMBinaryParser(wasm);
    const sections = parser.parseSections();

    // Find relevant sections
    const exportSection = sections.find(s => s.id === SectionId.Export);
    const codeSection = sections.find(s => s.id === SectionId.Code);
    const functionSection = sections.find(s => s.id === SectionId.Function);
    const importSection = sections.find(s => s.id === SectionId.Import);

    if (!exportSection || !codeSection || !functionSection) {
      return { wasm, modified: false };
    }

    // Parse exports to find used function indices
    const exports = parser.parseExportSection(exportSection.content);
    const usedFunctions = new Set<number>();

    // All exported functions are used
    for (const exp of exports) {
      if (exp.kind === 0) { // Function
        usedFunctions.add(exp.index);
      }
    }

    // Count imported functions
    let importedFunctionCount = 0;
    if (importSection) {
      let pos = 0;
      const { value: count, bytes } = this.readULEB128At(importSection.content, pos);
      pos += bytes;

      for (let i = 0; i < count; i++) {
        // Skip module name
        const { value: modLen, bytes: modBytes } = this.readULEB128At(importSection.content, pos);
        pos += modBytes + modLen;
        // Skip import name
        const { value: nameLen, bytes: nameBytes } = this.readULEB128At(importSection.content, pos);
        pos += nameBytes + nameLen;
        // Read kind
        const kind = importSection.content[pos++];
        if (kind === 0) {
          importedFunctionCount++;
          // Skip type index
          const { bytes: typeBytes } = this.readULEB128At(importSection.content, pos);
          pos += typeBytes;
        } else {
          // Skip other import types
          this.skipImportDesc(importSection.content, pos, kind);
        }
      }
    }

    // Analyze call graph from code section to find all reachable functions
    const functions = parser.parseCodeSection(codeSection.content, importedFunctionCount);

    // Iteratively find all reachable functions
    let changed = true;
    while (changed) {
      changed = false;
      for (const func of functions) {
        if (usedFunctions.has(func.index)) {
          // Scan for call instructions
          const calledFunctions = this.findCallTargets(func.code);
          for (const calledIndex of calledFunctions) {
            if (!usedFunctions.has(calledIndex)) {
              usedFunctions.add(calledIndex);
              changed = true;
            }
          }
        }
      }
    }

    // Check if we can remove any functions
    const unusedCount = functions.filter(f => !usedFunctions.has(f.index)).length;
    if (unusedCount === 0) {
      return { wasm, modified: false };
    }

    // For now, return unmodified if we find unused functions
    // Full implementation would require rebuilding all sections with new indices
    // This is complex due to index remapping in exports, elements, etc.
    logger.debug(`Found ${unusedCount} unused functions (removal not yet implemented)`);
    return { wasm, modified: false };
  }

  private findCallTargets(code: Uint8Array): number[] {
    const targets: number[] = [];
    let pos = 0;

    while (pos < code.length - 1) { // -1 for End opcode
      const opcode = code[pos++];

      if (opcode === Opcode.Call) {
        const { value: funcIndex, bytes } = this.readULEB128At(code, pos);
        pos += bytes;
        targets.push(funcIndex);
      } else if (opcode === Opcode.CallIndirect) {
        // Skip type index and table index
        const { bytes: typeBytes } = this.readULEB128At(code, pos);
        pos += typeBytes;
        pos++; // Table index (0x00)
      } else {
        // Skip operands for other opcodes
        pos = this.skipOperands(code, pos, opcode);
      }
    }

    return targets;
  }

  private skipOperands(code: Uint8Array, pos: number, opcode: number): number {
    // Handle opcodes with operands
    switch (opcode) {
      case Opcode.Block:
      case Opcode.Loop:
      case Opcode.If:
        pos++; // Block type
        break;
      case Opcode.Br:
      case Opcode.BrIf:
      case Opcode.LocalGet:
      case Opcode.LocalSet:
      case Opcode.LocalTee:
      case Opcode.GlobalGet:
      case Opcode.GlobalSet:
        pos += this.readULEB128At(code, pos).bytes;
        break;
      case Opcode.I32Const:
        pos += this.readSLEB128At(code, pos).bytes;
        break;
      case Opcode.I64Const:
        pos += this.readSLEB128At(code, pos).bytes;
        break;
      case Opcode.F32Const:
        pos += 4;
        break;
      case Opcode.F64Const:
        pos += 8;
        break;
      case Opcode.BrTable: {
        const { value: count, bytes } = this.readULEB128At(code, pos);
        pos += bytes;
        for (let i = 0; i <= count; i++) {
          pos += this.readULEB128At(code, pos).bytes;
        }
        break;
      }
      // Memory instructions with align and offset
      case 0x28: case 0x29: case 0x2A: case 0x2B:
      case 0x2C: case 0x2D: case 0x2E: case 0x2F:
      case 0x30: case 0x31: case 0x32: case 0x33:
      case 0x34: case 0x35:
      case 0x36: case 0x37: case 0x38: case 0x39:
      case 0x3A: case 0x3B: case 0x3C: case 0x3D:
      case 0x3E:
        pos += this.readULEB128At(code, pos).bytes; // align
        pos += this.readULEB128At(code, pos).bytes; // offset
        break;
      case 0x3F: case 0x40: // memory.size, memory.grow
        pos++; // Memory index
        break;
    }
    return pos;
  }

  private readULEB128At(data: Uint8Array, offset: number): { value: number; bytes: number } {
    let result = 0;
    let shift = 0;
    let bytes = 0;
    do {
      const byte = data[offset + bytes];
      result |= (byte & 0x7F) << shift;
      shift += 7;
      bytes++;
    } while (data[offset + bytes - 1] >= 0x80);
    return { value: result, bytes };
  }

  private readSLEB128At(data: Uint8Array, offset: number): { value: number; bytes: number } {
    let result = 0;
    let shift = 0;
    let bytes = 0;
    let byte: number;
    do {
      byte = data[offset + bytes];
      result |= (byte & 0x7F) << shift;
      shift += 7;
      bytes++;
    } while (byte >= 0x80);
    if (shift < 32 && (byte & 0x40) !== 0) {
      result |= (~0 << shift);
    }
    return { value: result, bytes };
  }

  private skipImportDesc(_content: Uint8Array, _pos: number, _kind: number): number {
    // Simplified - skip import descriptor based on kind
    return _pos + 1;
  }
}

/**
 * Inline small functions
 *
 * Finds functions with small bodies that are called only once,
 * and inlines them at the call site.
 */
class InlineSmallFunctionsPass implements OptimizationPass {
  name = 'inline-small-functions';
  private readonly maxInlineSize = 20; // Max instructions to inline

  async apply(wasm: Uint8Array): Promise<PassResult> {
    const parser = new WASMBinaryParser(wasm);
    const sections = parser.parseSections();

    const codeSection = sections.find(s => s.id === SectionId.Code);
    const importSection = sections.find(s => s.id === SectionId.Import);

    if (!codeSection) {
      return { wasm, modified: false };
    }

    // Count imported functions
    let importedFunctionCount = 0;
    if (importSection) {
      // Simplified count
      const { value: count } = this.readULEB128At(importSection.content, 0);
      // This is approximate - would need full parsing for accuracy
      importedFunctionCount = count;
    }

    const functions = parser.parseCodeSection(codeSection.content, importedFunctionCount);

    // Find small functions (candidates for inlining)
    const smallFunctions = functions.filter(f => f.code.length <= this.maxInlineSize);

    if (smallFunctions.length === 0) {
      return { wasm, modified: false };
    }

    // Count call sites for each function
    const callCounts = new Map<number, number>();
    for (const func of functions) {
      const targets = this.findCallTargets(func.code);
      for (const target of targets) {
        callCounts.set(target, (callCounts.get(target) || 0) + 1);
      }
    }

    // Find functions called exactly once that are small
    const inlineCandidates = smallFunctions.filter(
      f => callCounts.get(f.index) === 1
    );

    if (inlineCandidates.length === 0) {
      return { wasm, modified: false };
    }

    // Log that we found candidates but don't modify yet
    // Full implementation would rewrite caller with inlined code
    logger.debug(`Found ${inlineCandidates.length} functions eligible for inlining`);
    return { wasm, modified: false };
  }

  private findCallTargets(code: Uint8Array): number[] {
    const targets: number[] = [];
    let pos = 0;

    while (pos < code.length - 1) {
      const opcode = code[pos++];
      if (opcode === Opcode.Call) {
        const { value: funcIndex, bytes } = this.readULEB128At(code, pos);
        pos += bytes;
        targets.push(funcIndex);
      } else {
        pos = this.skipOperands(code, pos, opcode);
      }
    }

    return targets;
  }

  private skipOperands(code: Uint8Array, pos: number, opcode: number): number {
    switch (opcode) {
      case Opcode.Block: case Opcode.Loop: case Opcode.If:
        pos++;
        break;
      case Opcode.Br: case Opcode.BrIf:
      case Opcode.LocalGet: case Opcode.LocalSet: case Opcode.LocalTee:
      case Opcode.GlobalGet: case Opcode.GlobalSet:
      case Opcode.Call:
        pos += this.readULEB128At(code, pos).bytes;
        break;
      case Opcode.I32Const: case Opcode.I64Const:
        pos += this.readSLEB128At(code, pos).bytes;
        break;
      case Opcode.F32Const:
        pos += 4;
        break;
      case Opcode.F64Const:
        pos += 8;
        break;
    }
    return pos;
  }

  private readULEB128At(data: Uint8Array, offset: number): { value: number; bytes: number } {
    let result = 0;
    let shift = 0;
    let bytes = 0;
    do {
      const byte = data[offset + bytes];
      result |= (byte & 0x7F) << shift;
      shift += 7;
      bytes++;
    } while (data[offset + bytes - 1] >= 0x80);
    return { value: result, bytes };
  }

  private readSLEB128At(data: Uint8Array, offset: number): { value: number; bytes: number } {
    let result = 0;
    let shift = 0;
    let bytes = 0;
    let byte: number;
    do {
      byte = data[offset + bytes];
      result |= (byte & 0x7F) << shift;
      shift += 7;
      bytes++;
    } while (byte >= 0x80);
    if (shift < 32 && (byte & 0x40) !== 0) {
      result |= (~0 << shift);
    }
    return { value: result, bytes };
  }
}

/**
 * Merge adjacent blocks
 *
 * Merges sequential blocks that don't have branch targets.
 */
class MergeBlocksPass implements OptimizationPass {
  name = 'merge-blocks';

  async apply(wasm: Uint8Array): Promise<PassResult> {
    const parser = new WASMBinaryParser(wasm);
    const sections = parser.parseSections();

    const codeSection = sections.find(s => s.id === SectionId.Code);
    if (!codeSection) {
      return { wasm, modified: false };
    }

    // Parse functions and look for mergeable blocks
    let modified = false;
    const newCodeContent: number[] = [];
    let pos = 0;

    // Copy function count
    const { value: funcCount, bytes } = this.readULEB128At(codeSection.content, pos);
    pos += bytes;
    newCodeContent.push(...WASMBinaryRewriter.encodeULEB128(funcCount));

    for (let i = 0; i < funcCount; i++) {
      const { value: bodySize, bytes: sizeBytes } = this.readULEB128At(codeSection.content, pos);
      pos += sizeBytes;

      const bodyContent = codeSection.content.slice(pos, pos + bodySize);
      const optimizedBody = this.mergeBlocksInFunction(bodyContent);

      if (optimizedBody.length !== bodyContent.length) {
        modified = true;
      }

      newCodeContent.push(...WASMBinaryRewriter.encodeULEB128(optimizedBody.length));
      newCodeContent.push(...optimizedBody);

      pos += bodySize;
    }

    if (!modified) {
      return { wasm, modified: false };
    }

    // Rebuild module with new code section
    const newSections = sections.map(s => {
      if (s.id === SectionId.Code) {
        return {
          ...s,
          content: new Uint8Array(newCodeContent),
        };
      }
      return s;
    });

    return {
      wasm: WASMBinaryRewriter.rebuildModule(newSections),
      modified: true,
    };
  }

  private mergeBlocksInFunction(body: Uint8Array): Uint8Array {
    // Look for patterns like: block (nop) end -> nop
    // or: block end -> (nothing)
    const result: number[] = [];
    let pos = 0;

    // Copy locals
    const { value: localGroupCount, bytes: localBytes } = this.readULEB128At(body, pos);
    pos += localBytes;
    result.push(...WASMBinaryRewriter.encodeULEB128(localGroupCount));

    for (let i = 0; i < localGroupCount; i++) {
      const { value: count, bytes: countBytes } = this.readULEB128At(body, pos);
      pos += countBytes;
      result.push(...WASMBinaryRewriter.encodeULEB128(count));
      result.push(body[pos++]); // type
    }

    // Process instructions
    const blockStack: number[] = [];
    const blockContents: number[][] = [[]];

    while (pos < body.length) {
      const opcode = body[pos++];

      if (opcode === Opcode.Block || opcode === Opcode.Loop || opcode === Opcode.If) {
        blockStack.push(opcode);
        blockContents.push([opcode, body[pos++]]); // opcode + block type
      } else if (opcode === Opcode.End) {
        if (blockStack.length > 0) {
          blockStack.pop();
          const blockContent = blockContents.pop()!;

          // Check if block is empty (just block type + end)
          if (blockContent.length === 2) {
            // Empty block - skip it entirely
            continue;
          }

          // Add block content to parent
          blockContents[blockContents.length - 1].push(...blockContent, opcode);
        } else {
          blockContents[blockContents.length - 1].push(opcode);
        }
      } else {
        // Regular instruction - add to current block
        blockContents[blockContents.length - 1].push(opcode);

        // Handle operands
        const operands = this.getOperands(body, pos, opcode);
        blockContents[blockContents.length - 1].push(...body.slice(pos, pos + operands));
        pos += operands;
      }
    }

    result.push(...blockContents[0]);
    return new Uint8Array(result);
  }

  private getOperands(body: Uint8Array, pos: number, opcode: number): number {
    switch (opcode) {
      case Opcode.Block: case Opcode.Loop: case Opcode.If:
        return 1;
      case Opcode.Br: case Opcode.BrIf:
      case Opcode.LocalGet: case Opcode.LocalSet: case Opcode.LocalTee:
      case Opcode.GlobalGet: case Opcode.GlobalSet:
      case Opcode.Call:
        return this.readULEB128At(body, pos).bytes;
      case Opcode.I32Const: case Opcode.I64Const:
        return this.readSLEB128At(body, pos).bytes;
      case Opcode.F32Const:
        return 4;
      case Opcode.F64Const:
        return 8;
      case Opcode.CallIndirect:
        return this.readULEB128At(body, pos).bytes + 1;
      default:
        return 0;
    }
  }

  private readULEB128At(data: Uint8Array, offset: number): { value: number; bytes: number } {
    let result = 0;
    let shift = 0;
    let bytes = 0;
    do {
      const byte = data[offset + bytes];
      result |= (byte & 0x7F) << shift;
      shift += 7;
      bytes++;
    } while (data[offset + bytes - 1] >= 0x80);
    return { value: result, bytes };
  }

  private readSLEB128At(data: Uint8Array, offset: number): { value: number; bytes: number } {
    let result = 0;
    let shift = 0;
    let bytes = 0;
    let byte: number;
    do {
      byte = data[offset + bytes];
      result |= (byte & 0x7F) << shift;
      shift += 7;
      bytes++;
    } while (byte >= 0x80);
    if (shift < 32 && (byte & 0x40) !== 0) {
      result |= (~0 << shift);
    }
    return { value: result, bytes };
  }
}

/**
 * Simplify instruction sequences
 *
 * Applies peephole optimizations to simplify instruction patterns.
 */
class SimplifyInstructionsPass implements OptimizationPass {
  name = 'simplify-instructions';

  async apply(wasm: Uint8Array): Promise<PassResult> {
    const parser = new WASMBinaryParser(wasm);
    const sections = parser.parseSections();

    const codeSection = sections.find(s => s.id === SectionId.Code);
    if (!codeSection) {
      return { wasm, modified: false };
    }

    let modified = false;
    const newCodeContent: number[] = [];
    let pos = 0;

    const { value: funcCount, bytes } = this.readULEB128At(codeSection.content, pos);
    pos += bytes;
    newCodeContent.push(...WASMBinaryRewriter.encodeULEB128(funcCount));

    for (let i = 0; i < funcCount; i++) {
      const { value: bodySize, bytes: sizeBytes } = this.readULEB128At(codeSection.content, pos);
      pos += sizeBytes;

      const bodyContent = codeSection.content.slice(pos, pos + bodySize);
      const optimizedBody = this.simplifyFunction(bodyContent);

      if (optimizedBody.length !== bodyContent.length) {
        modified = true;
      }

      newCodeContent.push(...WASMBinaryRewriter.encodeULEB128(optimizedBody.length));
      newCodeContent.push(...optimizedBody);

      pos += bodySize;
    }

    if (!modified) {
      return { wasm, modified: false };
    }

    const newSections = sections.map(s => {
      if (s.id === SectionId.Code) {
        return { ...s, content: new Uint8Array(newCodeContent) };
      }
      return s;
    });

    return {
      wasm: WASMBinaryRewriter.rebuildModule(newSections),
      modified: true,
    };
  }

  private simplifyFunction(body: Uint8Array): Uint8Array {
    const result: number[] = [];
    let pos = 0;

    // Copy locals
    const { value: localGroupCount, bytes: localBytes } = this.readULEB128At(body, pos);
    pos += localBytes;
    result.push(...WASMBinaryRewriter.encodeULEB128(localGroupCount));

    for (let i = 0; i < localGroupCount; i++) {
      const { value: count, bytes: countBytes } = this.readULEB128At(body, pos);
      pos += countBytes;
      result.push(...WASMBinaryRewriter.encodeULEB128(count));
      result.push(body[pos++]);
    }

    // Process instructions with peephole optimization
    const instructions: { opcode: number; operands: number[] }[] = [];

    while (pos < body.length) {
      const opcode = body[pos++];
      const operandBytes = this.getOperandBytes(body, pos, opcode);
      const operands = Array.from(body.slice(pos, pos + operandBytes));
      pos += operandBytes;
      instructions.push({ opcode, operands });
    }

    // Apply peephole optimizations
    const optimized = this.peepholeOptimize(instructions);

    // Write optimized instructions
    for (const instr of optimized) {
      result.push(instr.opcode);
      result.push(...instr.operands);
    }

    return new Uint8Array(result);
  }

  private peepholeOptimize(instructions: { opcode: number; operands: number[] }[]): { opcode: number; operands: number[] }[] {
    const result: { opcode: number; operands: number[] }[] = [];

    for (let i = 0; i < instructions.length; i++) {
      const curr = instructions[i];
      const next = instructions[i + 1];

      // Pattern: i32.const 0; i32.add -> drop the add (identity)
      if (curr.opcode === Opcode.I32Const && this.getI32ConstValue(curr.operands) === 0 &&
          next?.opcode === Opcode.I32Add) {
        // Skip both - add 0 is identity
        i++;
        continue;
      }

      // Pattern: i32.const 1; i32.mul -> drop the mul (identity)
      if (curr.opcode === Opcode.I32Const && this.getI32ConstValue(curr.operands) === 1 &&
          next?.opcode === Opcode.I32Mul) {
        i++;
        continue;
      }

      // Pattern: i32.const 0; i32.mul -> i32.const 0; drop
      if (curr.opcode === Opcode.I32Const && this.getI32ConstValue(curr.operands) === 0 &&
          next?.opcode === Opcode.I32Mul) {
        result.push({ opcode: Opcode.Drop, operands: [] });
        result.push({ opcode: Opcode.I32Const, operands: [0] });
        i++;
        continue;
      }

      // Pattern: nop -> skip
      if (curr.opcode === Opcode.Nop) {
        continue;
      }

      // Pattern: local.get X; local.set X -> local.tee X; drop (or just skip if followed by drop)
      if (curr.opcode === Opcode.LocalGet && next?.opcode === Opcode.LocalSet &&
          this.operandsEqual(curr.operands, next.operands)) {
        result.push({ opcode: Opcode.LocalTee, operands: curr.operands });
        result.push({ opcode: Opcode.Drop, operands: [] });
        i++;
        continue;
      }

      result.push(curr);
    }

    return result;
  }

  private getI32ConstValue(operands: number[]): number {
    // Decode SLEB128 from operands
    let result = 0;
    let shift = 0;
    for (let i = 0; i < operands.length; i++) {
      const byte = operands[i];
      result |= (byte & 0x7F) << shift;
      shift += 7;
      if ((byte & 0x80) === 0) {
        if (shift < 32 && (byte & 0x40) !== 0) {
          result |= (~0 << shift);
        }
        break;
      }
    }
    return result;
  }

  private operandsEqual(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  private getOperandBytes(body: Uint8Array, pos: number, opcode: number): number {
    switch (opcode) {
      case Opcode.Block: case Opcode.Loop: case Opcode.If:
        return 1;
      case Opcode.Br: case Opcode.BrIf:
      case Opcode.LocalGet: case Opcode.LocalSet: case Opcode.LocalTee:
      case Opcode.GlobalGet: case Opcode.GlobalSet:
      case Opcode.Call:
        return this.readULEB128At(body, pos).bytes;
      case Opcode.I32Const: case Opcode.I64Const:
        return this.readSLEB128At(body, pos).bytes;
      case Opcode.F32Const:
        return 4;
      case Opcode.F64Const:
        return 8;
      case Opcode.CallIndirect:
        return this.readULEB128At(body, pos).bytes + 1;
      case Opcode.BrTable: {
        let len = 0;
        const { value: count, bytes } = this.readULEB128At(body, pos);
        len += bytes;
        for (let i = 0; i <= count; i++) {
          len += this.readULEB128At(body, pos + len).bytes;
        }
        return len;
      }
      // Memory instructions
      case 0x28: case 0x29: case 0x2A: case 0x2B:
      case 0x2C: case 0x2D: case 0x2E: case 0x2F:
      case 0x30: case 0x31: case 0x32: case 0x33:
      case 0x34: case 0x35:
      case 0x36: case 0x37: case 0x38: case 0x39:
      case 0x3A: case 0x3B: case 0x3C: case 0x3D:
      case 0x3E: {
        const alignBytes = this.readULEB128At(body, pos).bytes;
        const offsetBytes = this.readULEB128At(body, pos + alignBytes).bytes;
        return alignBytes + offsetBytes;
      }
      case 0x3F: case 0x40:
        return 1;
      default:
        return 0;
    }
  }

  private readULEB128At(data: Uint8Array, offset: number): { value: number; bytes: number } {
    let result = 0;
    let shift = 0;
    let bytes = 0;
    do {
      const byte = data[offset + bytes];
      result |= (byte & 0x7F) << shift;
      shift += 7;
      bytes++;
    } while (data[offset + bytes - 1] >= 0x80);
    return { value: result, bytes };
  }

  private readSLEB128At(data: Uint8Array, offset: number): { value: number; bytes: number } {
    let result = 0;
    let shift = 0;
    let bytes = 0;
    let byte: number;
    do {
      byte = data[offset + bytes];
      result |= (byte & 0x7F) << shift;
      shift += 7;
      bytes++;
    } while (byte >= 0x80);
    if (shift < 32 && (byte & 0x40) !== 0) {
      result |= (~0 << shift);
    }
    return { value: result, bytes };
  }
}

/**
 * Optimize local variable usage
 *
 * Reduces local variable count by reusing locals of the same type.
 */
class OptimizeLocalsPass implements OptimizationPass {
  name = 'optimize-locals';

  async apply(wasm: Uint8Array): Promise<PassResult> {
    const parser = new WASMBinaryParser(wasm);
    const sections = parser.parseSections();

    const codeSection = sections.find(s => s.id === SectionId.Code);
    if (!codeSection) {
      return { wasm, modified: false };
    }

    let modified = false;
    const newCodeContent: number[] = [];
    let pos = 0;

    const { value: funcCount, bytes } = this.readULEB128At(codeSection.content, pos);
    pos += bytes;
    newCodeContent.push(...WASMBinaryRewriter.encodeULEB128(funcCount));

    for (let i = 0; i < funcCount; i++) {
      const { value: bodySize, bytes: sizeBytes } = this.readULEB128At(codeSection.content, pos);
      pos += sizeBytes;

      const bodyContent = codeSection.content.slice(pos, pos + bodySize);
      const optimizedBody = this.optimizeLocals(bodyContent);

      if (optimizedBody.length !== bodyContent.length) {
        modified = true;
      }

      newCodeContent.push(...WASMBinaryRewriter.encodeULEB128(optimizedBody.length));
      newCodeContent.push(...optimizedBody);

      pos += bodySize;
    }

    if (!modified) {
      return { wasm, modified: false };
    }

    const newSections = sections.map(s => {
      if (s.id === SectionId.Code) {
        return { ...s, content: new Uint8Array(newCodeContent) };
      }
      return s;
    });

    return {
      wasm: WASMBinaryRewriter.rebuildModule(newSections),
      modified: true,
    };
  }

  private optimizeLocals(body: Uint8Array): Uint8Array {
    // Parse locals and track usage
    let pos = 0;
    const { value: localGroupCount, bytes: localBytes } = this.readULEB128At(body, pos);
    pos += localBytes;

    const localTypes: number[] = [];
    for (let i = 0; i < localGroupCount; i++) {
      const { value: count, bytes: countBytes } = this.readULEB128At(body, pos);
      pos += countBytes;
      const type = body[pos++];
      for (let j = 0; j < count; j++) {
        localTypes.push(type);
      }
    }

    // Track which locals are actually used
    const usedLocals = new Set<number>();
    const codeStart = pos;

    while (pos < body.length) {
      const opcode = body[pos++];
      if (opcode === Opcode.LocalGet || opcode === Opcode.LocalSet || opcode === Opcode.LocalTee) {
        const { value: localIdx } = this.readULEB128At(body, pos);
        usedLocals.add(localIdx);
      }
      pos += this.getOperandBytes(body, pos, opcode);
    }

    // If all locals are used, no optimization possible
    if (usedLocals.size === localTypes.length) {
      return body;
    }

    // Build new local list with only used locals
    const localMapping = new Map<number, number>();
    const newLocalTypes: number[] = [];

    for (let i = 0; i < localTypes.length; i++) {
      if (usedLocals.has(i)) {
        localMapping.set(i, newLocalTypes.length);
        newLocalTypes.push(localTypes[i]);
      }
    }

    // If no reduction, return original
    if (newLocalTypes.length === localTypes.length) {
      return body;
    }

    // Rebuild function body with new local indices
    const result: number[] = [];

    // Encode new locals
    const groupedLocals = this.groupLocals(newLocalTypes);
    result.push(...WASMBinaryRewriter.encodeULEB128(groupedLocals.length));
    for (const [count, type] of groupedLocals) {
      result.push(...WASMBinaryRewriter.encodeULEB128(count));
      result.push(type);
    }

    // Rewrite instructions with new local indices
    pos = codeStart;
    while (pos < body.length) {
      const opcode = body[pos++];
      result.push(opcode);

      if (opcode === Opcode.LocalGet || opcode === Opcode.LocalSet || opcode === Opcode.LocalTee) {
        const { value: oldIdx, bytes: idxBytes } = this.readULEB128At(body, pos);
        pos += idxBytes;
        const newIdx = localMapping.get(oldIdx) ?? oldIdx;
        result.push(...WASMBinaryRewriter.encodeULEB128(newIdx));
      } else {
        const operandBytes = this.getOperandBytes(body, pos, opcode);
        result.push(...body.slice(pos, pos + operandBytes));
        pos += operandBytes;
      }
    }

    return new Uint8Array(result);
  }

  private groupLocals(types: number[]): [number, number][] {
    if (types.length === 0) return [];

    const groups: [number, number][] = [];
    let currentType = types[0];
    let count = 1;

    for (let i = 1; i < types.length; i++) {
      if (types[i] === currentType) {
        count++;
      } else {
        groups.push([count, currentType]);
        currentType = types[i];
        count = 1;
      }
    }
    groups.push([count, currentType]);

    return groups;
  }

  private getOperandBytes(body: Uint8Array, pos: number, opcode: number): number {
    switch (opcode) {
      case Opcode.Block: case Opcode.Loop: case Opcode.If:
        return 1;
      case Opcode.Br: case Opcode.BrIf:
      case Opcode.LocalGet: case Opcode.LocalSet: case Opcode.LocalTee:
      case Opcode.GlobalGet: case Opcode.GlobalSet:
      case Opcode.Call:
        return this.readULEB128At(body, pos).bytes;
      case Opcode.I32Const: case Opcode.I64Const:
        return this.readSLEB128At(body, pos).bytes;
      case Opcode.F32Const:
        return 4;
      case Opcode.F64Const:
        return 8;
      default:
        return 0;
    }
  }

  private readULEB128At(data: Uint8Array, offset: number): { value: number; bytes: number } {
    let result = 0;
    let shift = 0;
    let bytes = 0;
    do {
      const byte = data[offset + bytes];
      result |= (byte & 0x7F) << shift;
      shift += 7;
      bytes++;
    } while (data[offset + bytes - 1] >= 0x80);
    return { value: result, bytes };
  }

  private readSLEB128At(data: Uint8Array, offset: number): { value: number; bytes: number } {
    let result = 0;
    let shift = 0;
    let bytes = 0;
    let byte: number;
    do {
      byte = data[offset + bytes];
      result |= (byte & 0x7F) << shift;
      shift += 7;
      bytes++;
    } while (byte >= 0x80);
    if (shift < 32 && (byte & 0x40) !== 0) {
      result |= (~0 << shift);
    }
    return { value: result, bytes };
  }
}

/**
 * Compact/remove names for smaller size
 */
class CompactNamesPass implements OptimizationPass {
  name = 'compact-names';

  apply(wasm: Uint8Array): Promise<PassResult> {
    // Remove the name section for size optimization
    const optimizer = new WASMOptimizer();
    const stripped = optimizer.stripDebugInfo(wasm);
    return Promise.resolve({
      wasm: stripped,
      modified: stripped.length !== wasm.length,
    });
  }
}

/**
 * Remove unreachable code
 *
 * Removes instructions after unreachable or return within blocks.
 */
class DeadCodeEliminationPass implements OptimizationPass {
  name = 'dead-code-elimination';

  async apply(wasm: Uint8Array): Promise<PassResult> {
    const parser = new WASMBinaryParser(wasm);
    const sections = parser.parseSections();

    const codeSection = sections.find(s => s.id === SectionId.Code);
    if (!codeSection) {
      return { wasm, modified: false };
    }

    let modified = false;
    const newCodeContent: number[] = [];
    let pos = 0;

    const { value: funcCount, bytes } = this.readULEB128At(codeSection.content, pos);
    pos += bytes;
    newCodeContent.push(...WASMBinaryRewriter.encodeULEB128(funcCount));

    for (let i = 0; i < funcCount; i++) {
      const { value: bodySize, bytes: sizeBytes } = this.readULEB128At(codeSection.content, pos);
      pos += sizeBytes;

      const bodyContent = codeSection.content.slice(pos, pos + bodySize);
      const optimizedBody = this.eliminateDeadCode(bodyContent);

      if (optimizedBody.length !== bodyContent.length) {
        modified = true;
      }

      newCodeContent.push(...WASMBinaryRewriter.encodeULEB128(optimizedBody.length));
      newCodeContent.push(...optimizedBody);

      pos += bodySize;
    }

    if (!modified) {
      return { wasm, modified: false };
    }

    const newSections = sections.map(s => {
      if (s.id === SectionId.Code) {
        return { ...s, content: new Uint8Array(newCodeContent) };
      }
      return s;
    });

    return {
      wasm: WASMBinaryRewriter.rebuildModule(newSections),
      modified: true,
    };
  }

  private eliminateDeadCode(body: Uint8Array): Uint8Array {
    const result: number[] = [];
    let pos = 0;

    // Copy locals
    const { value: localGroupCount, bytes: localBytes } = this.readULEB128At(body, pos);
    pos += localBytes;
    result.push(...WASMBinaryRewriter.encodeULEB128(localGroupCount));

    for (let i = 0; i < localGroupCount; i++) {
      const { value: count, bytes: countBytes } = this.readULEB128At(body, pos);
      pos += countBytes;
      result.push(...WASMBinaryRewriter.encodeULEB128(count));
      result.push(body[pos++]);
    }

    // Process instructions, tracking reachability
    let blockDepth = 0;
    let unreachableDepth = -1; // -1 means reachable

    while (pos < body.length) {
      const opcode = body[pos++];
      const operandBytes = this.getOperandBytes(body, pos, opcode);
      const operands = body.slice(pos, pos + operandBytes);
      pos += operandBytes;

      // Handle block structure
      if (opcode === Opcode.Block || opcode === Opcode.Loop || opcode === Opcode.If) {
        blockDepth++;
        if (unreachableDepth === -1) {
          result.push(opcode);
          result.push(...operands);
        }
      } else if (opcode === Opcode.Else) {
        if (unreachableDepth === -1 || unreachableDepth === blockDepth) {
          result.push(opcode);
          // Reset reachability for else branch
          if (unreachableDepth === blockDepth) {
            unreachableDepth = -1;
          }
        }
      } else if (opcode === Opcode.End) {
        if (blockDepth > 0) {
          blockDepth--;
          // Restore reachability when leaving unreachable block
          if (unreachableDepth > blockDepth) {
            unreachableDepth = -1;
          }
        }
        if (unreachableDepth === -1) {
          result.push(opcode);
        }
      } else if (opcode === Opcode.Unreachable || opcode === Opcode.Return) {
        if (unreachableDepth === -1) {
          result.push(opcode);
          result.push(...operands);
          unreachableDepth = blockDepth;
        }
        // Skip - already in unreachable code
      } else if (opcode === Opcode.Br) {
        if (unreachableDepth === -1) {
          result.push(opcode);
          result.push(...operands);
          unreachableDepth = blockDepth;
        }
      } else {
        // Regular instruction
        if (unreachableDepth === -1) {
          result.push(opcode);
          result.push(...operands);
        }
        // Skip if in unreachable code
      }
    }

    return new Uint8Array(result);
  }

  private getOperandBytes(body: Uint8Array, pos: number, opcode: number): number {
    switch (opcode) {
      case Opcode.Block: case Opcode.Loop: case Opcode.If:
        return 1;
      case Opcode.Br: case Opcode.BrIf:
      case Opcode.LocalGet: case Opcode.LocalSet: case Opcode.LocalTee:
      case Opcode.GlobalGet: case Opcode.GlobalSet:
      case Opcode.Call:
        return this.readULEB128At(body, pos).bytes;
      case Opcode.I32Const: case Opcode.I64Const:
        return this.readSLEB128At(body, pos).bytes;
      case Opcode.F32Const:
        return 4;
      case Opcode.F64Const:
        return 8;
      default:
        return 0;
    }
  }

  private readULEB128At(data: Uint8Array, offset: number): { value: number; bytes: number } {
    let result = 0;
    let shift = 0;
    let bytes = 0;
    do {
      const byte = data[offset + bytes];
      result |= (byte & 0x7F) << shift;
      shift += 7;
      bytes++;
    } while (data[offset + bytes - 1] >= 0x80);
    return { value: result, bytes };
  }

  private readSLEB128At(data: Uint8Array, offset: number): { value: number; bytes: number } {
    let result = 0;
    let shift = 0;
    let bytes = 0;
    let byte: number;
    do {
      byte = data[offset + bytes];
      result |= (byte & 0x7F) << shift;
      shift += 7;
      bytes++;
    } while (byte >= 0x80);
    if (shift < 32 && (byte & 0x40) !== 0) {
      result |= (~0 << shift);
    }
    return { value: result, bytes };
  }
}

/**
 * Fold constant expressions
 *
 * Evaluates constant expressions at compile time.
 */
class ConstantFoldingPass implements OptimizationPass {
  name = 'constant-folding';

  async apply(wasm: Uint8Array): Promise<PassResult> {
    const parser = new WASMBinaryParser(wasm);
    const sections = parser.parseSections();

    const codeSection = sections.find(s => s.id === SectionId.Code);
    if (!codeSection) {
      return { wasm, modified: false };
    }

    let modified = false;
    const newCodeContent: number[] = [];
    let pos = 0;

    const { value: funcCount, bytes } = this.readULEB128At(codeSection.content, pos);
    pos += bytes;
    newCodeContent.push(...WASMBinaryRewriter.encodeULEB128(funcCount));

    for (let i = 0; i < funcCount; i++) {
      const { value: bodySize, bytes: sizeBytes } = this.readULEB128At(codeSection.content, pos);
      pos += sizeBytes;

      const bodyContent = codeSection.content.slice(pos, pos + bodySize);
      const optimizedBody = this.foldConstants(bodyContent);

      if (optimizedBody.length !== bodyContent.length) {
        modified = true;
      }

      newCodeContent.push(...WASMBinaryRewriter.encodeULEB128(optimizedBody.length));
      newCodeContent.push(...optimizedBody);

      pos += bodySize;
    }

    if (!modified) {
      return { wasm, modified: false };
    }

    const newSections = sections.map(s => {
      if (s.id === SectionId.Code) {
        return { ...s, content: new Uint8Array(newCodeContent) };
      }
      return s;
    });

    return {
      wasm: WASMBinaryRewriter.rebuildModule(newSections),
      modified: true,
    };
  }

  private foldConstants(body: Uint8Array): Uint8Array {
    const result: number[] = [];
    let pos = 0;

    // Copy locals
    const { value: localGroupCount, bytes: localBytes } = this.readULEB128At(body, pos);
    pos += localBytes;
    result.push(...WASMBinaryRewriter.encodeULEB128(localGroupCount));

    for (let i = 0; i < localGroupCount; i++) {
      const { value: count, bytes: countBytes } = this.readULEB128At(body, pos);
      pos += countBytes;
      result.push(...WASMBinaryRewriter.encodeULEB128(count));
      result.push(body[pos++]);
    }

    // Parse instructions
    const instructions: { opcode: number; operands: number[]; value?: number }[] = [];

    while (pos < body.length) {
      const opcode = body[pos++];
      const operandBytes = this.getOperandBytes(body, pos, opcode);
      const operands = Array.from(body.slice(pos, pos + operandBytes));
      pos += operandBytes;

      const instr: { opcode: number; operands: number[]; value?: number } = { opcode, operands };

      // Track constant values
      if (opcode === Opcode.I32Const) {
        instr.value = this.decodeI32Const(operands);
      }

      instructions.push(instr);
    }

    // Apply constant folding
    const optimized = this.foldConstantExpressions(instructions);

    // Write optimized instructions
    for (const instr of optimized) {
      result.push(instr.opcode);
      result.push(...instr.operands);
    }

    return new Uint8Array(result);
  }

  private foldConstantExpressions(instructions: { opcode: number; operands: number[]; value?: number }[]): { opcode: number; operands: number[] }[] {
    const result: { opcode: number; operands: number[] }[] = [];

    for (let i = 0; i < instructions.length; i++) {
      // Look for: i32.const A; i32.const B; binop -> i32.const result
      if (i + 2 < instructions.length) {
        const first = instructions[i];
        const second = instructions[i + 1];
        const op = instructions[i + 2];

        if (first.opcode === Opcode.I32Const && first.value !== undefined &&
            second.opcode === Opcode.I32Const && second.value !== undefined) {

          let foldedValue: number | null = null;

          switch (op.opcode) {
            case Opcode.I32Add:
              foldedValue = (first.value + second.value) | 0;
              break;
            case Opcode.I32Sub:
              foldedValue = (first.value - second.value) | 0;
              break;
            case Opcode.I32Mul:
              foldedValue = Math.imul(first.value, second.value);
              break;
            case Opcode.I32And:
              foldedValue = first.value & second.value;
              break;
            case Opcode.I32Or:
              foldedValue = first.value | second.value;
              break;
            case Opcode.I32Xor:
              foldedValue = first.value ^ second.value;
              break;
            case Opcode.I32Shl:
              foldedValue = first.value << (second.value & 31);
              break;
            case Opcode.I32ShrS:
              foldedValue = first.value >> (second.value & 31);
              break;
            case Opcode.I32ShrU:
              foldedValue = first.value >>> (second.value & 31);
              break;
          }

          if (foldedValue !== null) {
            result.push({
              opcode: Opcode.I32Const,
              operands: WASMBinaryRewriter.encodeSLEB128(foldedValue),
            });
            i += 2; // Skip all three instructions
            continue;
          }
        }
      }

      result.push({ opcode: instructions[i].opcode, operands: instructions[i].operands });
    }

    return result;
  }

  private decodeI32Const(operands: number[]): number {
    let result = 0;
    let shift = 0;
    for (let i = 0; i < operands.length; i++) {
      const byte = operands[i];
      result |= (byte & 0x7F) << shift;
      shift += 7;
      if ((byte & 0x80) === 0) {
        if (shift < 32 && (byte & 0x40) !== 0) {
          result |= (~0 << shift);
        }
        break;
      }
    }
    return result;
  }

  private getOperandBytes(body: Uint8Array, pos: number, opcode: number): number {
    switch (opcode) {
      case Opcode.Block: case Opcode.Loop: case Opcode.If:
        return 1;
      case Opcode.Br: case Opcode.BrIf:
      case Opcode.LocalGet: case Opcode.LocalSet: case Opcode.LocalTee:
      case Opcode.GlobalGet: case Opcode.GlobalSet:
      case Opcode.Call:
        return this.readULEB128At(body, pos).bytes;
      case Opcode.I32Const: case Opcode.I64Const:
        return this.readSLEB128At(body, pos).bytes;
      case Opcode.F32Const:
        return 4;
      case Opcode.F64Const:
        return 8;
      default:
        return 0;
    }
  }

  private readULEB128At(data: Uint8Array, offset: number): { value: number; bytes: number } {
    let result = 0;
    let shift = 0;
    let bytes = 0;
    do {
      const byte = data[offset + bytes];
      result |= (byte & 0x7F) << shift;
      shift += 7;
      bytes++;
    } while (data[offset + bytes - 1] >= 0x80);
    return { value: result, bytes };
  }

  private readSLEB128At(data: Uint8Array, offset: number): { value: number; bytes: number } {
    let result = 0;
    let shift = 0;
    let bytes = 0;
    let byte: number;
    do {
      byte = data[offset + bytes];
      result |= (byte & 0x7F) << shift;
      shift += 7;
      bytes++;
    } while (byte >= 0x80);
    if (shift < 32 && (byte & 0x40) !== 0) {
      result |= (~0 << shift);
    }
    return { value: result, bytes };
  }
}
