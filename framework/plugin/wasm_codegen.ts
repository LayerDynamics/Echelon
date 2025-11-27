/**
 * WASM Code Generator
 *
 * Provides low-level WASM binary generation capabilities.
 * Generates valid WASM binary format from higher-level constructs.
 */

import type {
  WASMValueType,
  WASMFunctionSignature,
  WASMFunctionDef,
  WASMGlobalDef,
  WASMModuleDef,
  WASMMemoryConfig,
  WASMTableConfig,
  WASMImportDef,
  WASMExportDef,
  WASMInstruction,
} from '../runtime/wasm_types.ts';
import { WASMOpcode } from '../runtime/wasm_types.ts';

// ============================================================================
// WASM Binary Format Constants
// ============================================================================

const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6D]; // '\0asm'
const WASM_VERSION = [0x01, 0x00, 0x00, 0x00]; // Version 1

// Section IDs
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
}

// Value type encodings
const VALUE_TYPE_ENCODING: Record<WASMValueType, number> = {
  'i32': 0x7F,
  'i64': 0x7E,
  'f32': 0x7D,
  'f64': 0x7C,
  'v128': 0x7B,
  'funcref': 0x70,
  'externref': 0x6F,
};

// Export kind encodings
const EXPORT_KIND: Record<string, number> = {
  'function': 0x00,
  'table': 0x01,
  'memory': 0x02,
  'global': 0x03,
};

// Import kind encodings
const IMPORT_KIND: Record<string, number> = {
  'function': 0x00,
  'table': 0x01,
  'memory': 0x02,
  'global': 0x03,
};

/**
 * WASM Module Builder
 *
 * Builds WASM binary from high-level module definition.
 */
export class WASMModuleBuilder {
  private types: WASMFunctionSignature[] = [];
  private typeMap: Map<string, number> = new Map();
  private imports: WASMImportDef[] = [];
  private functions: WASMFunctionDef[] = [];
  private tables: WASMTableConfig[] = [];
  private memories: WASMMemoryConfig[] = [];
  private globals: WASMGlobalDef[] = [];
  private exports: WASMExportDef[] = [];
  private startFunction?: number;
  private importFunctionCount = 0;

  /**
   * Add a function type
   */
  addType(signature: WASMFunctionSignature): number {
    const key = this.signatureToKey(signature);
    const existing = this.typeMap.get(key);
    if (existing !== undefined) return existing;

    const index = this.types.length;
    this.types.push(signature);
    this.typeMap.set(key, index);
    return index;
  }

  /**
   * Add an import
   */
  addImport(imp: WASMImportDef): number {
    const index = this.imports.length;
    this.imports.push(imp);
    if (imp.kind === 'function') {
      this.importFunctionCount++;
    }
    return index;
  }

  /**
   * Add a function
   */
  addFunction(func: WASMFunctionDef): number {
    const index = this.functions.length + this.importFunctionCount;
    this.functions.push(func);

    // Auto-add type
    this.addType(func.signature);

    // Auto-add export if requested
    if (func.export && func.name) {
      this.addExport({
        name: func.name,
        kind: 'function',
        index,
      });
    }

    return index;
  }

  /**
   * Add a table
   */
  addTable(config: WASMTableConfig): number {
    const index = this.tables.length;
    this.tables.push(config);
    return index;
  }

  /**
   * Add a memory
   */
  addMemory(config: WASMMemoryConfig): number {
    const index = this.memories.length;
    this.memories.push(config);
    return index;
  }

  /**
   * Add a global
   */
  addGlobal(global: WASMGlobalDef): number {
    const index = this.globals.length;
    this.globals.push(global);

    // Auto-add export if requested
    if (global.export && global.name) {
      this.addExport({
        name: global.name,
        kind: 'global',
        index,
      });
    }

    return index;
  }

  /**
   * Add an export
   */
  addExport(exp: WASMExportDef): void {
    this.exports.push(exp);
  }

  /**
   * Set start function
   */
  setStart(functionIndex: number): void {
    this.startFunction = functionIndex;
  }

  /**
   * Build the WASM binary
   */
  build(): Uint8Array {
    const sections: Uint8Array[] = [];

    // Type section
    if (this.types.length > 0) {
      sections.push(this.encodeTypeSection());
    }

    // Import section
    if (this.imports.length > 0) {
      sections.push(this.encodeImportSection());
    }

    // Function section (type indices)
    if (this.functions.length > 0) {
      sections.push(this.encodeFunctionSection());
    }

    // Table section
    if (this.tables.length > 0) {
      sections.push(this.encodeTableSection());
    }

    // Memory section
    if (this.memories.length > 0) {
      sections.push(this.encodeMemorySection());
    }

    // Global section
    if (this.globals.length > 0) {
      sections.push(this.encodeGlobalSection());
    }

    // Export section
    if (this.exports.length > 0) {
      sections.push(this.encodeExportSection());
    }

    // Start section
    if (this.startFunction !== undefined) {
      sections.push(this.encodeStartSection());
    }

    // Code section
    if (this.functions.length > 0) {
      sections.push(this.encodeCodeSection());
    }

    // Combine all sections
    const totalSize = WASM_MAGIC.length + WASM_VERSION.length +
      sections.reduce((sum, s) => sum + s.length, 0);

    const result = new Uint8Array(totalSize);
    let offset = 0;

    // Write magic
    result.set(WASM_MAGIC, offset);
    offset += WASM_MAGIC.length;

    // Write version
    result.set(WASM_VERSION, offset);
    offset += WASM_VERSION.length;

    // Write sections
    for (const section of sections) {
      result.set(section, offset);
      offset += section.length;
    }

    return result;
  }

  /**
   * Build from a module definition
   */
  static fromDefinition(def: WASMModuleDef): Uint8Array {
    const builder = new WASMModuleBuilder();

    // Add memory
    if (def.memory) {
      builder.addMemory(def.memory);
      builder.addExport({ name: 'memory', kind: 'memory', index: 0 });
    }

    // Add tables
    for (const table of def.tables ?? []) {
      builder.addTable(table);
    }

    // Add imports
    for (const imp of def.imports) {
      builder.addImport(imp);
    }

    // Add functions
    for (const func of def.functions) {
      builder.addFunction(func);
    }

    // Add globals
    for (const global of def.globals) {
      builder.addGlobal(global);
    }

    // Add additional exports
    for (const exp of def.exports) {
      // Check if not already exported
      const existing = builder.exports.find(e =>
        e.name === exp.name && e.kind === exp.kind);
      if (!existing) {
        builder.addExport(exp);
      }
    }

    // Set start function
    if (def.start !== undefined) {
      builder.setStart(def.start);
    }

    return builder.build();
  }

  // ============================================================================
  // Section Encoding
  // ============================================================================

  private encodeTypeSection(): Uint8Array {
    const entries: number[] = [];

    for (const type of this.types) {
      entries.push(0x60); // Function type
      entries.push(...this.encodeVector(type.params.map(t => VALUE_TYPE_ENCODING[t])));
      entries.push(...this.encodeVector(type.results.map(t => VALUE_TYPE_ENCODING[t])));
    }

    return this.encodeSection(SectionId.Type, this.encodeVector(entries, this.types.length));
  }

  private encodeImportSection(): Uint8Array {
    const entries: number[] = [];

    for (const imp of this.imports) {
      entries.push(...this.encodeString(imp.module));
      entries.push(...this.encodeString(imp.name));
      entries.push(IMPORT_KIND[imp.kind]);

      switch (imp.kind) {
        case 'function': {
          const sig = imp.type as WASMFunctionSignature;
          const typeIdx = this.getTypeIndex(sig);
          entries.push(...this.encodeULEB128(typeIdx));
          break;
        }
        case 'table': {
          const table = imp.type as WASMTableConfig;
          entries.push(table.elementType === 'funcref' ? 0x70 : 0x6F);
          entries.push(...this.encodeLimits(table.initial, table.maximum));
          break;
        }
        case 'memory': {
          const mem = imp.type as WASMMemoryConfig;
          entries.push(...this.encodeLimits(mem.initial, mem.maximum));
          break;
        }
        case 'global': {
          const global = imp.type as { type: WASMValueType; mutable: boolean };
          entries.push(VALUE_TYPE_ENCODING[global.type]);
          entries.push(global.mutable ? 0x01 : 0x00);
          break;
        }
      }
    }

    return this.encodeSection(SectionId.Import, this.encodeVector(entries, this.imports.length));
  }

  private encodeFunctionSection(): Uint8Array {
    const typeIndices: number[] = [];

    for (const func of this.functions) {
      const typeIdx = this.getTypeIndex(func.signature);
      typeIndices.push(...this.encodeULEB128(typeIdx));
    }

    return this.encodeSection(SectionId.Function, this.encodeVector(typeIndices, this.functions.length));
  }

  private encodeTableSection(): Uint8Array {
    const entries: number[] = [];

    for (const table of this.tables) {
      entries.push(table.elementType === 'funcref' ? 0x70 : 0x6F);
      entries.push(...this.encodeLimits(table.initial, table.maximum));
    }

    return this.encodeSection(SectionId.Table, this.encodeVector(entries, this.tables.length));
  }

  private encodeMemorySection(): Uint8Array {
    const entries: number[] = [];

    for (const mem of this.memories) {
      entries.push(...this.encodeLimits(mem.initial, mem.maximum));
    }

    return this.encodeSection(SectionId.Memory, this.encodeVector(entries, this.memories.length));
  }

  private encodeGlobalSection(): Uint8Array {
    const entries: number[] = [];

    for (const global of this.globals) {
      entries.push(VALUE_TYPE_ENCODING[global.type]);
      entries.push(global.mutable ? 0x01 : 0x00);
      entries.push(...this.encodeInstructions(global.init));
      entries.push(WASMOpcode.End);
    }

    return this.encodeSection(SectionId.Global, this.encodeVector(entries, this.globals.length));
  }

  private encodeExportSection(): Uint8Array {
    const entries: number[] = [];

    for (const exp of this.exports) {
      entries.push(...this.encodeString(exp.name));
      entries.push(EXPORT_KIND[exp.kind]);
      entries.push(...this.encodeULEB128(exp.index));
    }

    return this.encodeSection(SectionId.Export, this.encodeVector(entries, this.exports.length));
  }

  private encodeStartSection(): Uint8Array {
    const content = this.encodeULEB128(this.startFunction!);
    return this.encodeSection(SectionId.Start, content);
  }

  private encodeCodeSection(): Uint8Array {
    const bodies: number[][] = [];

    for (const func of this.functions) {
      const body: number[] = [];

      // Encode locals
      const localGroups = this.groupLocals(func.locals);
      body.push(...this.encodeULEB128(localGroups.length));
      for (const [count, type] of localGroups) {
        body.push(...this.encodeULEB128(count));
        body.push(VALUE_TYPE_ENCODING[type]);
      }

      // Encode body
      body.push(...this.encodeInstructions(func.body));
      body.push(WASMOpcode.End);

      bodies.push(body);
    }

    // Encode as vector of code entries
    const entries: number[] = [];
    entries.push(...this.encodeULEB128(bodies.length));
    for (const body of bodies) {
      entries.push(...this.encodeULEB128(body.length));
      entries.push(...body);
    }

    return this.encodeSection(SectionId.Code, entries);
  }

  // ============================================================================
  // Encoding Helpers
  // ============================================================================

  private encodeSection(id: SectionId, content: number[]): Uint8Array {
    const result = [id, ...this.encodeULEB128(content.length), ...content];
    return new Uint8Array(result);
  }

  private encodeVector(content: number[], count?: number): number[] {
    const actualCount = count ?? content.length;
    return [...this.encodeULEB128(actualCount), ...content];
  }

  private encodeString(str: string): number[] {
    const bytes = new TextEncoder().encode(str);
    return [...this.encodeULEB128(bytes.length), ...bytes];
  }

  private encodeLimits(min: number, max?: number): number[] {
    if (max !== undefined) {
      return [0x01, ...this.encodeULEB128(min), ...this.encodeULEB128(max)];
    }
    return [0x00, ...this.encodeULEB128(min)];
  }

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

  private encodeSLEB128(value: number): number[] {
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

  private encodeInstructions(instructions: WASMInstruction[]): number[] {
    const result: number[] = [];

    for (const instr of instructions) {
      result.push(instr.opcode);

      // Encode operands based on opcode
      for (const operand of instr.operands) {
        if (typeof operand === 'number') {
          // Most numeric operands use signed or unsigned LEB128
          if (this.isSignedOperand(instr.opcode)) {
            result.push(...this.encodeSLEB128(operand));
          } else {
            result.push(...this.encodeULEB128(operand));
          }
        } else if (typeof operand === 'bigint') {
          result.push(...this.encodeSLEB128BigInt(operand));
        } else if (typeof operand === 'object' && operand !== null) {
          // Float encoding
          if ('f32' in operand) {
            result.push(...this.encodeF32((operand as { f32: number }).f32));
          } else if ('f64' in operand) {
            result.push(...this.encodeF64((operand as { f64: number }).f64));
          }
        }
      }
    }

    return result;
  }

  private isSignedOperand(opcode: WASMOpcode): boolean {
    // Opcodes that use signed operands
    return [
      WASMOpcode.I32Const,
      WASMOpcode.I64Const,
      WASMOpcode.Br,
      WASMOpcode.BrIf,
    ].includes(opcode);
  }

  private encodeSLEB128BigInt(value: bigint): number[] {
    const result: number[] = [];
    let more = true;

    while (more) {
      let byte = Number(value & 0x7Fn);
      value >>= 7n;

      if ((value === 0n && (byte & 0x40) === 0) ||
          (value === -1n && (byte & 0x40) !== 0)) {
        more = false;
      } else {
        byte |= 0x80;
      }
      result.push(byte);
    }
    return result;
  }

  private encodeF32(value: number): number[] {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, value, true);
    return Array.from(new Uint8Array(buffer));
  }

  private encodeF64(value: number): number[] {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setFloat64(0, value, true);
    return Array.from(new Uint8Array(buffer));
  }

  private signatureToKey(sig: WASMFunctionSignature): string {
    return `${sig.params.join(',')}->${sig.results.join(',')}`;
  }

  private getTypeIndex(sig: WASMFunctionSignature): number {
    const key = this.signatureToKey(sig);
    let idx = this.typeMap.get(key);
    if (idx === undefined) {
      idx = this.addType(sig);
    }
    return idx;
  }

  private groupLocals(locals: WASMValueType[]): Array<[number, WASMValueType]> {
    if (locals.length === 0) return [];

    const groups: Array<[number, WASMValueType]> = [];
    let currentType = locals[0];
    let count = 1;

    for (let i = 1; i < locals.length; i++) {
      if (locals[i] === currentType) {
        count++;
      } else {
        groups.push([count, currentType]);
        currentType = locals[i];
        count = 1;
      }
    }
    groups.push([count, currentType]);

    return groups;
  }
}

/**
 * WASM Codegen - High-level code generation utilities
 */
export class WASMCodegen {
  /**
   * Create a module builder
   */
  createModuleBuilder(): WASMModuleBuilder {
    return new WASMModuleBuilder();
  }

  /**
   * Generate a function definition
   */
  generateFunction(
    name: string | undefined,
    signature: WASMFunctionSignature,
    locals: WASMValueType[],
    body: WASMInstruction[],
    exportFunc = false
  ): WASMFunctionDef {
    return {
      name,
      signature,
      locals,
      body,
      export: exportFunc,
    };
  }

  /**
   * Generate a global definition
   */
  generateGlobal(
    name: string | undefined,
    type: WASMValueType,
    mutable: boolean,
    init: WASMInstruction[],
    exportGlobal = false
  ): WASMGlobalDef {
    return {
      name,
      type,
      mutable,
      init,
      export: exportGlobal,
    };
  }

  /**
   * Create a function type/signature
   */
  funcType(params: WASMValueType[], results: WASMValueType[]): WASMFunctionSignature {
    return { params, results };
  }

  /**
   * Create an instruction
   */
  instruction(opcode: WASMOpcode, ...operands: unknown[]): WASMInstruction {
    return { opcode, operands };
  }

  // ============================================================================
  // Instruction Helpers
  // ============================================================================

  // Constants
  i32Const(value: number): WASMInstruction {
    return { opcode: WASMOpcode.I32Const, operands: [value] };
  }

  i64Const(value: bigint): WASMInstruction {
    return { opcode: WASMOpcode.I64Const, operands: [value] };
  }

  f32Const(value: number): WASMInstruction {
    return { opcode: WASMOpcode.F32Const, operands: [{ f32: value }] };
  }

  f64Const(value: number): WASMInstruction {
    return { opcode: WASMOpcode.F64Const, operands: [{ f64: value }] };
  }

  // Variables
  localGet(index: number): WASMInstruction {
    return { opcode: WASMOpcode.LocalGet, operands: [index] };
  }

  localSet(index: number): WASMInstruction {
    return { opcode: WASMOpcode.LocalSet, operands: [index] };
  }

  localTee(index: number): WASMInstruction {
    return { opcode: WASMOpcode.LocalTee, operands: [index] };
  }

  globalGet(index: number): WASMInstruction {
    return { opcode: WASMOpcode.GlobalGet, operands: [index] };
  }

  globalSet(index: number): WASMInstruction {
    return { opcode: WASMOpcode.GlobalSet, operands: [index] };
  }

  // Control flow
  call(funcIndex: number): WASMInstruction {
    return { opcode: WASMOpcode.Call, operands: [funcIndex] };
  }

  return_(): WASMInstruction {
    return { opcode: WASMOpcode.Return, operands: [] };
  }

  // i32 operations
  i32Add(): WASMInstruction {
    return { opcode: WASMOpcode.I32Add, operands: [] };
  }

  i32Sub(): WASMInstruction {
    return { opcode: WASMOpcode.I32Sub, operands: [] };
  }

  i32Mul(): WASMInstruction {
    return { opcode: WASMOpcode.I32Mul, operands: [] };
  }

  i32DivS(): WASMInstruction {
    return { opcode: WASMOpcode.I32DivS, operands: [] };
  }

  i32DivU(): WASMInstruction {
    return { opcode: WASMOpcode.I32DivU, operands: [] };
  }

  i32Eq(): WASMInstruction {
    return { opcode: WASMOpcode.I32Eq, operands: [] };
  }

  i32Ne(): WASMInstruction {
    return { opcode: WASMOpcode.I32Ne, operands: [] };
  }

  i32LtS(): WASMInstruction {
    return { opcode: WASMOpcode.I32LtS, operands: [] };
  }

  i32GtS(): WASMInstruction {
    return { opcode: WASMOpcode.I32GtS, operands: [] };
  }

  i32LeS(): WASMInstruction {
    return { opcode: WASMOpcode.I32LeS, operands: [] };
  }

  i32GeS(): WASMInstruction {
    return { opcode: WASMOpcode.I32GeS, operands: [] };
  }

  // i64 operations
  i64Add(): WASMInstruction {
    return { opcode: WASMOpcode.I64Add, operands: [] };
  }

  i64Sub(): WASMInstruction {
    return { opcode: WASMOpcode.I64Sub, operands: [] };
  }

  i64Mul(): WASMInstruction {
    return { opcode: WASMOpcode.I64Mul, operands: [] };
  }

  // f32 operations
  f32Add(): WASMInstruction {
    return { opcode: WASMOpcode.F32Add, operands: [] };
  }

  f32Sub(): WASMInstruction {
    return { opcode: WASMOpcode.F32Sub, operands: [] };
  }

  f32Mul(): WASMInstruction {
    return { opcode: WASMOpcode.F32Mul, operands: [] };
  }

  f32Div(): WASMInstruction {
    return { opcode: WASMOpcode.F32Div, operands: [] };
  }

  // f64 operations
  f64Add(): WASMInstruction {
    return { opcode: WASMOpcode.F64Add, operands: [] };
  }

  f64Sub(): WASMInstruction {
    return { opcode: WASMOpcode.F64Sub, operands: [] };
  }

  f64Mul(): WASMInstruction {
    return { opcode: WASMOpcode.F64Mul, operands: [] };
  }

  f64Div(): WASMInstruction {
    return { opcode: WASMOpcode.F64Div, operands: [] };
  }

  // Memory operations
  i32Load(offset = 0, align = 2): WASMInstruction {
    return { opcode: WASMOpcode.I32Load, operands: [align, offset] };
  }

  i32Store(offset = 0, align = 2): WASMInstruction {
    return { opcode: WASMOpcode.I32Store, operands: [align, offset] };
  }

  memorySize(): WASMInstruction {
    return { opcode: WASMOpcode.MemorySize, operands: [0] };
  }

  memoryGrow(): WASMInstruction {
    return { opcode: WASMOpcode.MemoryGrow, operands: [0] };
  }

  // Other
  drop(): WASMInstruction {
    return { opcode: WASMOpcode.Drop, operands: [] };
  }

  nop(): WASMInstruction {
    return { opcode: WASMOpcode.Nop, operands: [] };
  }

  unreachable(): WASMInstruction {
    return { opcode: WASMOpcode.Unreachable, operands: [] };
  }
}
