/**
 * WASM Compiler
 *
 * Compiles source code to WebAssembly binary format.
 * Supports WAT (WebAssembly Text format) and provides
 * infrastructure for higher-level language compilation.
 */

import type {
  WASMCompilationResult,
  WASMCompilationError,
  WASMCompilationWarning,
  WASMCompilationStats,
  WASMSourceMap,
  WASMModuleDef,
  WASMFunctionDef,
  WASMValueType,
  WASMInstruction,
} from '../runtime/wasm_types.ts';
import { WASMOpcode } from '../runtime/wasm_types.ts';
import { WASMModuleBuilder, WASMCodegen } from './wasm_codegen.ts';
import { getLogger } from '../telemetry/logger.ts';

const logger = getLogger();

/**
 * WAT Compiler Options
 */
export interface WATCompilerOptions {
  validate?: boolean;
  generateSourceMap?: boolean;
}

/**
 * Build Configuration
 */
export interface BuildConfig {
  source: string;
  sourceType: 'wat' | 'wasm-text';
  options?: WATCompilerOptions;
}

/**
 * Build Result
 */
export interface BuildResult {
  success: boolean;
  wasm?: Uint8Array;
  sourceMap?: WASMSourceMap;
  errors: WASMCompilationError[];
  warnings: WASMCompilationWarning[];
  stats: WASMCompilationStats;
}

/**
 * WAT Parser Token
 */
interface WATToken {
  type: 'lparen' | 'rparen' | 'keyword' | 'number' | 'string' | 'identifier';
  value: string;
  line: number;
  column: number;
}

/**
 * WAT AST Node
 */
interface WATNode {
  type: string;
  children: (WATNode | string | number)[];
  line?: number;
  column?: number;
}

/**
 * Scope tracking for variable resolution
 */
interface CompilationScope {
  params: Map<string, number>;       // Named parameters -> index
  locals: Map<string, number>;       // Named locals -> index
  globals: Map<string, number>;      // Named globals -> index
  functions: Map<string, number>;    // Named functions -> index
  labels: Map<string, number>;       // Block labels -> depth
  currentLabelDepth: number;
}

/**
 * Source mapping entry
 */
interface SourceMapping {
  wasmOffset: number;
  sourceLine: number;
  sourceColumn: number;
}

/**
 * WASM Compiler
 *
 * Compiles WAT (WebAssembly Text) to WASM binary format.
 */
export class WASMCompiler {
  private codegen: WASMCodegen;
  private scope: CompilationScope;
  private sourceMappings: SourceMapping[] = [];

  constructor() {
    this.codegen = new WASMCodegen();
    this.scope = this.createEmptyScope();
  }

  /**
   * Create an empty compilation scope
   */
  private createEmptyScope(): CompilationScope {
    return {
      params: new Map(),
      locals: new Map(),
      globals: new Map(),
      functions: new Map(),
      labels: new Map(),
      currentLabelDepth: 0,
    };
  }

  /**
   * Compile WAT source to WASM binary
   */
  async compileWAT(source: string, options: WATCompilerOptions = {}): Promise<WASMCompilationResult> {
    const startTime = performance.now();
    const errors: WASMCompilationError[] = [];
    const warnings: WASMCompilationWarning[] = [];

    try {
      // Tokenize
      const tokens = this.tokenize(source);

      // Parse
      const ast = this.parse(tokens);

      // Validate AST
      if (options.validate !== false) {
        const validationResult = this.validateAST(ast);
        errors.push(...validationResult.errors);
        warnings.push(...validationResult.warnings);

        if (errors.length > 0) {
          return {
            success: false,
            errors,
            warnings,
            stats: this.createStats(source.length, 0, startTime),
          };
        }
      }

      // Generate WASM
      const moduleDef = this.astToModuleDef(ast);
      const wasm = WASMModuleBuilder.fromDefinition(moduleDef);

      // Generate source map if requested
      let sourceMap: WASMSourceMap | undefined;
      if (options.generateSourceMap) {
        sourceMap = this.generateSourceMap(source, wasm);
      }

      const compilationTime = performance.now() - startTime;

      return {
        success: true,
        wasm,
        sourceMap,
        errors: [],
        warnings,
        stats: {
          sourceSize: source.length,
          outputSize: wasm.length,
          compilationTime,
          functionCount: moduleDef.functions.length,
          exportCount: moduleDef.exports.length,
        },
      };
    } catch (error) {
      errors.push({
        message: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        errors,
        warnings,
        stats: this.createStats(source.length, 0, startTime),
      };
    }
  }

  /**
   * Build a module from configuration
   */
  async buildModule(config: BuildConfig): Promise<BuildResult> {
    if (config.sourceType === 'wat' || config.sourceType === 'wasm-text') {
      const result = await this.compileWAT(config.source, config.options);
      return {
        success: result.success,
        wasm: result.wasm,
        sourceMap: result.sourceMap,
        errors: result.errors ?? [],
        warnings: result.warnings ?? [],
        stats: result.stats!,
      };
    }

    return {
      success: false,
      errors: [{ message: `Unsupported source type: ${config.sourceType}` }],
      warnings: [],
      stats: this.createStats(config.source.length, 0, performance.now()),
    };
  }

  /**
   * Compile a simple expression to WASM
   */
  compileExpression(
    expression: string,
    resultType: WASMValueType = 'i32'
  ): WASMCompilationResult {
    const startTime = performance.now();

    try {
      // Parse simple math expressions
      const instructions = this.parseExpression(expression, resultType);

      // Create a simple function that returns the expression result
      const funcDef: WASMFunctionDef = {
        name: 'evaluate',
        signature: { params: [], results: [resultType] },
        locals: [],
        body: instructions,
        export: true,
      };

      const moduleDef: WASMModuleDef = {
        functions: [funcDef],
        globals: [],
        imports: [],
        exports: [],
      };

      const wasm = WASMModuleBuilder.fromDefinition(moduleDef);

      return {
        success: true,
        wasm,
        errors: [],
        warnings: [],
        stats: this.createStats(expression.length, wasm.length, startTime),
      };
    } catch (error) {
      return {
        success: false,
        errors: [{ message: error instanceof Error ? error.message : String(error) }],
        warnings: [],
        stats: this.createStats(expression.length, 0, startTime),
      };
    }
  }

  // ============================================================================
  // WAT Tokenizer
  // ============================================================================

  private tokenize(source: string): WATToken[] {
    const tokens: WATToken[] = [];
    let pos = 0;
    let line = 1;
    let column = 1;

    while (pos < source.length) {
      const char = source[pos];

      // Skip whitespace
      if (/\s/.test(char)) {
        if (char === '\n') {
          line++;
          column = 1;
        } else {
          column++;
        }
        pos++;
        continue;
      }

      // Skip comments
      if (char === ';' && source[pos + 1] === ';') {
        while (pos < source.length && source[pos] !== '\n') {
          pos++;
        }
        continue;
      }

      // Block comments
      if (char === '(' && source[pos + 1] === ';') {
        pos += 2;
        let depth = 1;
        while (pos < source.length && depth > 0) {
          if (source[pos] === '(' && source[pos + 1] === ';') {
            depth++;
            pos += 2;
          } else if (source[pos] === ';' && source[pos + 1] === ')') {
            depth--;
            pos += 2;
          } else {
            if (source[pos] === '\n') {
              line++;
              column = 1;
            }
            pos++;
          }
        }
        continue;
      }

      // Parentheses
      if (char === '(') {
        tokens.push({ type: 'lparen', value: '(', line, column });
        pos++;
        column++;
        continue;
      }

      if (char === ')') {
        tokens.push({ type: 'rparen', value: ')', line, column });
        pos++;
        column++;
        continue;
      }

      // String
      if (char === '"') {
        const startColumn = column;
        let value = '';
        pos++;
        column++;
        while (pos < source.length && source[pos] !== '"') {
          if (source[pos] === '\\') {
            pos++;
            column++;
            value += source[pos];
          } else {
            value += source[pos];
          }
          pos++;
          column++;
        }
        pos++; // Skip closing quote
        column++;
        tokens.push({ type: 'string', value, line, column: startColumn });
        continue;
      }

      // Number or keyword/identifier
      if (/[a-zA-Z0-9_.$\-+]/.test(char)) {
        const startColumn = column;
        let value = '';
        while (pos < source.length && /[a-zA-Z0-9_.$\-+:]/.test(source[pos])) {
          value += source[pos];
          pos++;
          column++;
        }

        // Determine token type
        if (/^-?[0-9]/.test(value) || /^-?0x[0-9a-fA-F]/.test(value)) {
          tokens.push({ type: 'number', value, line, column: startColumn });
        } else if (value.startsWith('$')) {
          tokens.push({ type: 'identifier', value, line, column: startColumn });
        } else {
          tokens.push({ type: 'keyword', value, line, column: startColumn });
        }
        continue;
      }

      // Unknown character
      throw new Error(`Unexpected character '${char}' at line ${line}, column ${column}`);
    }

    return tokens;
  }

  // ============================================================================
  // WAT Parser
  // ============================================================================

  private parse(tokens: WATToken[]): WATNode {
    let pos = 0;

    const parseNode = (): WATNode => {
      if (tokens[pos].type !== 'lparen') {
        throw new Error(`Expected '(' at line ${tokens[pos].line}`);
      }
      pos++; // Skip '('

      const node: WATNode = {
        type: '',
        children: [],
        line: tokens[pos]?.line,
        column: tokens[pos]?.column,
      };

      // First element should be the node type
      if (tokens[pos].type === 'keyword') {
        node.type = tokens[pos].value;
        pos++;
      }

      // Parse children
      while (pos < tokens.length && tokens[pos].type !== 'rparen') {
        if (tokens[pos].type === 'lparen') {
          node.children.push(parseNode());
        } else if (tokens[pos].type === 'keyword') {
          node.children.push(tokens[pos].value);
          pos++;
        } else if (tokens[pos].type === 'number') {
          node.children.push(this.parseNumber(tokens[pos].value));
          pos++;
        } else if (tokens[pos].type === 'string') {
          node.children.push(tokens[pos].value);
          pos++;
        } else if (tokens[pos].type === 'identifier') {
          node.children.push(tokens[pos].value);
          pos++;
        } else {
          pos++;
        }
      }

      if (tokens[pos]?.type !== 'rparen') {
        throw new Error(`Expected ')' at end of expression`);
      }
      pos++; // Skip ')'

      return node;
    };

    return parseNode();
  }

  private parseNumber(value: string): number {
    if (value.startsWith('0x') || value.startsWith('-0x')) {
      return parseInt(value, 16);
    }
    if (value.includes('.') || value.includes('e') || value.includes('E')) {
      return parseFloat(value);
    }
    return parseInt(value, 10);
  }

  // ============================================================================
  // AST Validation
  // ============================================================================

  private validateAST(ast: WATNode): { errors: WASMCompilationError[]; warnings: WASMCompilationWarning[] } {
    const errors: WASMCompilationError[] = [];
    const warnings: WASMCompilationWarning[] = [];

    if (ast.type !== 'module') {
      errors.push({ message: 'Root element must be a module', line: ast.line, column: ast.column });
      return { errors, warnings };
    }

    // Additional validation could be added here

    return { errors, warnings };
  }

  // ============================================================================
  // AST to Module Definition
  // ============================================================================

  private astToModuleDef(ast: WATNode): WASMModuleDef {
    const moduleDef: WASMModuleDef = {
      functions: [],
      globals: [],
      imports: [],
      exports: [],
    };

    // Reset scope for new module
    this.scope = this.createEmptyScope();
    this.sourceMappings = [];

    // First pass: collect all function and global names for forward references
    let funcIndex = 0;
    let globalIndex = 0;
    for (const child of ast.children) {
      if (typeof child !== 'object') continue;

      if (child.type === 'import') {
        // Imports come before local definitions
        const importDef = child;
        for (const c of importDef.children) {
          if (typeof c === 'object') {
            if (c.type === 'func') {
              // Find name if present
              for (const n of c.children) {
                if (typeof n === 'string' && n.startsWith('$')) {
                  this.scope.functions.set(n.substring(1), funcIndex);
                }
              }
              funcIndex++;
            } else if (c.type === 'global') {
              for (const n of c.children) {
                if (typeof n === 'string' && n.startsWith('$')) {
                  this.scope.globals.set(n.substring(1), globalIndex);
                }
              }
              globalIndex++;
            }
          }
        }
      } else if (child.type === 'func') {
        for (const c of child.children) {
          if (typeof c === 'string' && c.startsWith('$')) {
            this.scope.functions.set(c.substring(1), funcIndex);
            break;
          }
        }
        funcIndex++;
      } else if (child.type === 'global') {
        for (const c of child.children) {
          if (typeof c === 'string' && c.startsWith('$')) {
            this.scope.globals.set(c.substring(1), globalIndex);
            break;
          }
        }
        globalIndex++;
      }
    }

    // Second pass: parse all definitions
    for (const child of ast.children) {
      if (typeof child !== 'object') continue;

      switch (child.type) {
        case 'func':
          moduleDef.functions.push(this.parseFuncNode(child));
          break;
        case 'memory':
          moduleDef.memory = this.parseMemoryNode(child);
          break;
        case 'global':
          moduleDef.globals.push(this.parseGlobalNode(child));
          break;
        case 'table':
          if (!moduleDef.tables) moduleDef.tables = [];
          moduleDef.tables.push(this.parseTableNode(child));
          break;
        case 'export':
          moduleDef.exports.push(this.parseExportNode(child, moduleDef));
          break;
        case 'import':
          moduleDef.imports.push(this.parseImportNode(child));
          break;
        case 'start':
          moduleDef.start = this.parseStartNode(child);
          break;
      }
    }

    return moduleDef;
  }

  /**
   * Parse a table node
   */
  private parseTableNode(node: WATNode): import('../runtime/wasm_types.ts').WASMTableConfig {
    let elementType: 'funcref' | 'externref' = 'funcref';
    let initial = 0;
    let maximum: number | undefined;

    for (const child of node.children) {
      if (typeof child === 'number') {
        if (initial === 0) {
          initial = child;
        } else {
          maximum = child;
        }
      } else if (typeof child === 'string') {
        if (child === 'funcref' || child === 'externref') {
          elementType = child;
        }
      }
    }

    return { elementType, initial, maximum };
  }

  /**
   * Parse a start node
   */
  private parseStartNode(node: WATNode): number {
    for (const child of node.children) {
      if (typeof child === 'number') {
        return child;
      } else if (typeof child === 'string' && child.startsWith('$')) {
        const funcName = child.substring(1);
        return this.scope.functions.get(funcName) ?? 0;
      }
    }
    return 0;
  }

  private parseFuncNode(node: WATNode): WASMFunctionDef {
    let name: string | undefined;
    const params: WASMValueType[] = [];
    const results: WASMValueType[] = [];
    const locals: WASMValueType[] = [];
    const body: WASMInstruction[] = [];
    let isExport = false;

    // Reset function-local scope (keep globals and functions from module)
    this.scope.params = new Map();
    this.scope.locals = new Map();
    this.scope.labels = new Map();
    this.scope.currentLabelDepth = 0;

    let paramIndex = 0;
    let localIndex = 0;

    // First pass: collect params and locals with names
    for (const child of node.children) {
      if (typeof child === 'string') {
        if (child.startsWith('$')) {
          name = child.substring(1);
        }
      } else if (typeof child === 'object') {
        if (child.type === 'param') {
          let paramName: string | undefined;
          for (const p of child.children) {
            if (typeof p === 'string') {
              if (p.startsWith('$')) {
                paramName = p.substring(1);
              } else if (this.isValueType(p)) {
                if (paramName) {
                  this.scope.params.set(paramName, paramIndex);
                  paramName = undefined;
                }
                params.push(p as WASMValueType);
                paramIndex++;
              }
            }
          }
        } else if (child.type === 'local') {
          let localName: string | undefined;
          for (const l of child.children) {
            if (typeof l === 'string') {
              if (l.startsWith('$')) {
                localName = l.substring(1);
              } else if (this.isValueType(l)) {
                if (localName) {
                  // Local indices start after params
                  this.scope.locals.set(localName, params.length + localIndex);
                  localName = undefined;
                }
                locals.push(l as WASMValueType);
                localIndex++;
              }
            }
          }
        }
      }
    }

    // Second pass: parse all content
    for (const child of node.children) {
      if (typeof child === 'object') {
        switch (child.type) {
          case 'export':
            isExport = true;
            if (typeof child.children[0] === 'string') {
              name = child.children[0];
            }
            break;
          case 'param':
          case 'local':
          case 'result':
            // Already handled in first pass or below
            if (child.type === 'result') {
              for (const r of child.children) {
                if (typeof r === 'string' && this.isValueType(r)) {
                  results.push(r as WASMValueType);
                }
              }
            }
            break;
          default:
            // Parse instruction
            body.push(...this.parseInstructionsWithScope(child, node.line, node.column));
        }
      }
    }

    return {
      name,
      signature: { params, results },
      locals,
      body,
      export: isExport,
    };
  }

  /**
   * Parse instructions with proper scope and control flow handling
   */
  private parseInstructionsWithScope(node: WATNode, sourceLine?: number, sourceColumn?: number): WASMInstruction[] {
    const instructions: WASMInstruction[] = [];

    // Add source mapping if available
    if (sourceLine !== undefined) {
      this.sourceMappings.push({
        wasmOffset: -1, // Will be updated during binary generation
        sourceLine,
        sourceColumn: sourceColumn ?? 0,
      });
    }

    // Handle block-type instructions specially
    if (node.type === 'block' || node.type === 'loop' || node.type === 'if') {
      return this.parseBlockInstruction(node);
    }

    const opcode = this.opcodeFromName(node.type);

    if (opcode !== null) {
      const operands: unknown[] = [];

      for (const child of node.children) {
        if (typeof child === 'number') {
          operands.push(child);
        } else if (typeof child === 'string') {
          if (child.startsWith('$')) {
            // Variable reference - resolve from scope
            const resolved = this.resolveIdentifier(child.substring(1), node.type);
            operands.push(resolved);
          } else if (this.isBlockType(child)) {
            // Block type annotation
            operands.push(this.blockTypeToCode(child));
          }
        } else if (typeof child === 'object') {
          // Nested instructions (folded form)
          instructions.push(...this.parseInstructionsWithScope(child, child.line, child.column));
        }
      }

      instructions.push({ opcode, operands });
    }

    return instructions;
  }

  /**
   * Parse block-structured instructions (block, loop, if)
   */
  private parseBlockInstruction(node: WATNode): WASMInstruction[] {
    const instructions: WASMInstruction[] = [];
    let blockType = 0x40; // void block type by default
    let label: string | undefined;

    // Check for label and block type
    for (const child of node.children) {
      if (typeof child === 'string') {
        if (child.startsWith('$')) {
          label = child.substring(1);
        } else if (this.isValueType(child)) {
          blockType = this.valueTypeToCode(child);
        }
      } else if (typeof child === 'object' && child.type === 'result') {
        // Block result type
        for (const r of child.children) {
          if (typeof r === 'string' && this.isValueType(r)) {
            blockType = this.valueTypeToCode(r);
          }
        }
      }
    }

    // Register label
    if (label) {
      this.scope.labels.set(label, this.scope.currentLabelDepth);
    }
    this.scope.currentLabelDepth++;

    // Emit block start instruction
    const opcode = this.opcodeFromName(node.type)!;
    instructions.push({ opcode, operands: [blockType] });

    // Parse block body
    let seenElse = false;
    for (const child of node.children) {
      if (typeof child === 'object') {
        if (child.type === 'then') {
          // Parse then branch (for if)
          for (const thenChild of child.children) {
            if (typeof thenChild === 'object') {
              instructions.push(...this.parseInstructionsWithScope(thenChild, thenChild.line, thenChild.column));
            }
          }
        } else if (child.type === 'else') {
          // Emit else instruction
          instructions.push({ opcode: WASMOpcode.Else, operands: [] });
          seenElse = true;
          // Parse else branch
          for (const elseChild of child.children) {
            if (typeof elseChild === 'object') {
              instructions.push(...this.parseInstructionsWithScope(elseChild, elseChild.line, elseChild.column));
            }
          }
        } else if (child.type !== 'result') {
          // Regular instruction in block
          instructions.push(...this.parseInstructionsWithScope(child, child.line, child.column));
        }
      }
    }

    // For if without explicit else, we might still need to handle implicit else
    if (node.type === 'if' && !seenElse) {
      // Check if there are any instructions after potential else children
    }

    // Emit end instruction
    instructions.push({ opcode: WASMOpcode.End, operands: [] });

    // Clean up label scope
    this.scope.currentLabelDepth--;
    if (label) {
      this.scope.labels.delete(label);
    }

    return instructions;
  }

  /**
   * Resolve an identifier to its index based on context
   */
  private resolveIdentifier(name: string, instructionType: string): number {
    // Determine what kind of reference this is based on instruction
    if (instructionType === 'call') {
      return this.scope.functions.get(name) ?? 0;
    } else if (instructionType === 'global.get' || instructionType === 'global.set') {
      return this.scope.globals.get(name) ?? 0;
    } else if (instructionType === 'br' || instructionType === 'br_if') {
      // For branches, resolve label to relative depth
      const labelDepth = this.scope.labels.get(name);
      if (labelDepth !== undefined) {
        return this.scope.currentLabelDepth - labelDepth - 1;
      }
      return 0;
    } else {
      // Default: try params first, then locals
      const paramIndex = this.scope.params.get(name);
      if (paramIndex !== undefined) return paramIndex;

      const localIndex = this.scope.locals.get(name);
      if (localIndex !== undefined) return localIndex;

      return 0;
    }
  }

  /**
   * Check if string is a block type
   */
  private isBlockType(value: string): boolean {
    return this.isValueType(value) || value === 'void';
  }

  /**
   * Convert block type string to binary code
   */
  private blockTypeToCode(type: string): number {
    const typeMap: Record<string, number> = {
      'void': 0x40,
      'i32': 0x7F,
      'i64': 0x7E,
      'f32': 0x7D,
      'f64': 0x7C,
    };
    return typeMap[type] ?? 0x40;
  }

  /**
   * Convert value type string to binary code
   */
  private valueTypeToCode(type: string): number {
    const typeMap: Record<string, number> = {
      'i32': 0x7F,
      'i64': 0x7E,
      'f32': 0x7D,
      'f64': 0x7C,
      'v128': 0x7B,
      'funcref': 0x70,
      'externref': 0x6F,
    };
    return typeMap[type] ?? 0x7F;
  }

  private parseMemoryNode(node: WATNode): { initial: number; maximum?: number } {
    let initial = 1;
    let maximum: number | undefined;

    for (const child of node.children) {
      if (typeof child === 'number') {
        if (initial === 1) {
          initial = child;
        } else {
          maximum = child;
        }
      }
    }

    return { initial, maximum };
  }

  private parseGlobalNode(node: WATNode): import('../runtime/wasm_types.ts').WASMGlobalDef {
    let name: string | undefined;
    let type: WASMValueType = 'i32';
    let mutable = false;
    const init: WASMInstruction[] = [];

    for (const child of node.children) {
      if (typeof child === 'string') {
        if (child.startsWith('$')) {
          name = child.substring(1);
        } else if (this.isValueType(child)) {
          type = child as WASMValueType;
        }
      } else if (typeof child === 'object') {
        if (child.type === 'mut') {
          mutable = true;
          for (const c of child.children) {
            if (typeof c === 'string' && this.isValueType(c)) {
              type = c as WASMValueType;
            }
          }
        } else {
          init.push(...this.parseInstructions(child));
        }
      }
    }

    return { name, type, mutable, init };
  }

  private parseExportNode(node: WATNode, moduleDef: WASMModuleDef): import('../runtime/wasm_types.ts').WASMExportDef {
    let name = '';
    let kind: 'function' | 'memory' | 'global' | 'table' = 'function';
    let index = 0;

    for (const child of node.children) {
      if (typeof child === 'string') {
        name = child;
      } else if (typeof child === 'object') {
        if (child.type === 'func') {
          kind = 'function';
          const ref = child.children[0];
          if (typeof ref === 'string' && ref.startsWith('$')) {
            const funcName = ref.substring(1);
            index = moduleDef.functions.findIndex(f => f.name === funcName);
          } else if (typeof ref === 'number') {
            index = ref;
          }
        } else if (child.type === 'memory') {
          kind = 'memory';
          const ref = child.children[0];
          index = typeof ref === 'number' ? ref : 0;
        } else if (child.type === 'global') {
          kind = 'global';
          const ref = child.children[0];
          if (typeof ref === 'number') {
            index = ref;
          }
        }
      }
    }

    return { name, kind, index };
  }

  private parseImportNode(node: WATNode): import('../runtime/wasm_types.ts').WASMImportDef {
    let module = '';
    let name = '';
    let kind: 'function' | 'memory' | 'global' | 'table' = 'function';
    let type: any = { params: [], results: [] };

    let stringIndex = 0;
    for (const child of node.children) {
      if (typeof child === 'string') {
        if (stringIndex === 0) {
          module = child;
        } else {
          name = child;
        }
        stringIndex++;
      } else if (typeof child === 'object') {
        if (child.type === 'func') {
          kind = 'function';
          type = this.parseImportFuncType(child);
        } else if (child.type === 'memory') {
          kind = 'memory';
          type = this.parseMemoryNode(child);
        }
      }
    }

    return { module, name, kind, type };
  }

  private parseImportFuncType(node: WATNode): import('../runtime/wasm_types.ts').WASMFunctionSignature {
    const params: WASMValueType[] = [];
    const results: WASMValueType[] = [];

    for (const child of node.children) {
      if (typeof child === 'object') {
        if (child.type === 'param') {
          for (const p of child.children) {
            if (typeof p === 'string' && this.isValueType(p)) {
              params.push(p as WASMValueType);
            }
          }
        } else if (child.type === 'result') {
          for (const r of child.children) {
            if (typeof r === 'string' && this.isValueType(r)) {
              results.push(r as WASMValueType);
            }
          }
        }
      }
    }

    return { params, results };
  }

  private parseInstructions(node: WATNode): WASMInstruction[] {
    const instructions: WASMInstruction[] = [];
    const opcode = this.opcodeFromName(node.type);

    if (opcode !== null) {
      const operands: unknown[] = [];

      for (const child of node.children) {
        if (typeof child === 'number') {
          operands.push(child);
        } else if (typeof child === 'string') {
          if (child.startsWith('$')) {
            // Variable reference - need to resolve later
            operands.push(0); // Placeholder
          }
        } else if (typeof child === 'object') {
          // Nested instructions (folded form)
          instructions.push(...this.parseInstructions(child));
        }
      }

      instructions.push({ opcode, operands });
    }

    return instructions;
  }

  private isValueType(value: string): boolean {
    return ['i32', 'i64', 'f32', 'f64', 'v128', 'funcref', 'externref'].includes(value);
  }

  private opcodeFromName(name: string): WASMOpcode | null {
    const opcodeMap: Record<string, WASMOpcode> = {
      'unreachable': WASMOpcode.Unreachable,
      'nop': WASMOpcode.Nop,
      'block': WASMOpcode.Block,
      'loop': WASMOpcode.Loop,
      'if': WASMOpcode.If,
      'else': WASMOpcode.Else,
      'end': WASMOpcode.End,
      'br': WASMOpcode.Br,
      'br_if': WASMOpcode.BrIf,
      'br_table': WASMOpcode.BrTable,
      'return': WASMOpcode.Return,
      'call': WASMOpcode.Call,
      'call_indirect': WASMOpcode.CallIndirect,
      'drop': WASMOpcode.Drop,
      'select': WASMOpcode.Select,
      'local.get': WASMOpcode.LocalGet,
      'local.set': WASMOpcode.LocalSet,
      'local.tee': WASMOpcode.LocalTee,
      'global.get': WASMOpcode.GlobalGet,
      'global.set': WASMOpcode.GlobalSet,
      'i32.load': WASMOpcode.I32Load,
      'i64.load': WASMOpcode.I64Load,
      'f32.load': WASMOpcode.F32Load,
      'f64.load': WASMOpcode.F64Load,
      'i32.store': WASMOpcode.I32Store,
      'i64.store': WASMOpcode.I64Store,
      'f32.store': WASMOpcode.F32Store,
      'f64.store': WASMOpcode.F64Store,
      'memory.size': WASMOpcode.MemorySize,
      'memory.grow': WASMOpcode.MemoryGrow,
      'i32.const': WASMOpcode.I32Const,
      'i64.const': WASMOpcode.I64Const,
      'f32.const': WASMOpcode.F32Const,
      'f64.const': WASMOpcode.F64Const,
      'i32.eqz': WASMOpcode.I32Eqz,
      'i32.eq': WASMOpcode.I32Eq,
      'i32.ne': WASMOpcode.I32Ne,
      'i32.lt_s': WASMOpcode.I32LtS,
      'i32.lt_u': WASMOpcode.I32LtU,
      'i32.gt_s': WASMOpcode.I32GtS,
      'i32.gt_u': WASMOpcode.I32GtU,
      'i32.le_s': WASMOpcode.I32LeS,
      'i32.le_u': WASMOpcode.I32LeU,
      'i32.ge_s': WASMOpcode.I32GeS,
      'i32.ge_u': WASMOpcode.I32GeU,
      'i32.add': WASMOpcode.I32Add,
      'i32.sub': WASMOpcode.I32Sub,
      'i32.mul': WASMOpcode.I32Mul,
      'i32.div_s': WASMOpcode.I32DivS,
      'i32.div_u': WASMOpcode.I32DivU,
      'i32.rem_s': WASMOpcode.I32RemS,
      'i32.rem_u': WASMOpcode.I32RemU,
      'i32.and': WASMOpcode.I32And,
      'i32.or': WASMOpcode.I32Or,
      'i32.xor': WASMOpcode.I32Xor,
      'i32.shl': WASMOpcode.I32Shl,
      'i32.shr_s': WASMOpcode.I32ShrS,
      'i32.shr_u': WASMOpcode.I32ShrU,
      'i64.add': WASMOpcode.I64Add,
      'i64.sub': WASMOpcode.I64Sub,
      'i64.mul': WASMOpcode.I64Mul,
      'f32.add': WASMOpcode.F32Add,
      'f32.sub': WASMOpcode.F32Sub,
      'f32.mul': WASMOpcode.F32Mul,
      'f32.div': WASMOpcode.F32Div,
      'f64.add': WASMOpcode.F64Add,
      'f64.sub': WASMOpcode.F64Sub,
      'f64.mul': WASMOpcode.F64Mul,
      'f64.div': WASMOpcode.F64Div,
    };

    return opcodeMap[name] ?? null;
  }

  // ============================================================================
  // Expression Parser (for simple expressions)
  // ============================================================================

  private parseExpression(expression: string, resultType: WASMValueType): WASMInstruction[] {
    // Simple recursive descent parser for basic math expressions
    const tokens = this.tokenizeExpression(expression);
    let pos = 0;

    const parseAddSub = (): WASMInstruction[] => {
      let instructions = parseMulDiv();

      while (pos < tokens.length && (tokens[pos] === '+' || tokens[pos] === '-')) {
        const op = tokens[pos++];
        const right = parseMulDiv();
        instructions = [...instructions, ...right];

        if (resultType === 'i32') {
          instructions.push({ opcode: op === '+' ? WASMOpcode.I32Add : WASMOpcode.I32Sub, operands: [] });
        } else if (resultType === 'f64') {
          instructions.push({ opcode: op === '+' ? WASMOpcode.F64Add : WASMOpcode.F64Sub, operands: [] });
        }
      }

      return instructions;
    };

    const parseMulDiv = (): WASMInstruction[] => {
      let instructions = parsePrimary();

      while (pos < tokens.length && (tokens[pos] === '*' || tokens[pos] === '/')) {
        const op = tokens[pos++];
        const right = parsePrimary();
        instructions = [...instructions, ...right];

        if (resultType === 'i32') {
          instructions.push({ opcode: op === '*' ? WASMOpcode.I32Mul : WASMOpcode.I32DivS, operands: [] });
        } else if (resultType === 'f64') {
          instructions.push({ opcode: op === '*' ? WASMOpcode.F64Mul : WASMOpcode.F64Div, operands: [] });
        }
      }

      return instructions;
    };

    const parsePrimary = (): WASMInstruction[] => {
      if (tokens[pos] === '(') {
        pos++; // Skip '('
        const instructions = parseAddSub();
        pos++; // Skip ')'
        return instructions;
      }

      const value = parseFloat(tokens[pos++]);
      if (resultType === 'i32') {
        return [{ opcode: WASMOpcode.I32Const, operands: [Math.floor(value)] }];
      } else if (resultType === 'f64') {
        return [{ opcode: WASMOpcode.F64Const, operands: [{ f64: value }] }];
      }

      return [];
    };

    return parseAddSub();
  }

  private tokenizeExpression(expression: string): string[] {
    const tokens: string[] = [];
    let pos = 0;

    while (pos < expression.length) {
      const char = expression[pos];

      if (/\s/.test(char)) {
        pos++;
        continue;
      }

      if ('+-*/()'.includes(char)) {
        tokens.push(char);
        pos++;
        continue;
      }

      if (/[0-9.]/.test(char)) {
        let num = '';
        while (pos < expression.length && /[0-9.]/.test(expression[pos])) {
          num += expression[pos++];
        }
        tokens.push(num);
        continue;
      }

      pos++;
    }

    return tokens;
  }

  // ============================================================================
  // Source Map Generation
  // ============================================================================

  private generateSourceMap(source: string, _wasm: Uint8Array): WASMSourceMap {
    // Generate VLQ-encoded source map from collected mappings
    const mappings = this.encodeSourceMappings();

    return {
      version: 3,
      file: 'module.wasm',
      sources: ['source.wat'],
      sourcesContent: [source],
      names: [],
      mappings,
    };
  }

  /**
   * Encode source mappings to VLQ format
   * Source map format: https://sourcemaps.info/spec.html
   */
  private encodeSourceMappings(): string {
    if (this.sourceMappings.length === 0) {
      return '';
    }

    const segments: string[] = [];
    let prevLine = 0;
    let prevColumn = 0;

    // Group mappings by WASM offset (simplified - one segment per mapping)
    for (const mapping of this.sourceMappings) {
      if (mapping.wasmOffset < 0) continue;

      // Encode: generated column, source index, source line, source column
      const vlqSegment = this.encodeVLQ([
        0,  // Generated column (simplified)
        0,  // Source file index (always 0)
        mapping.sourceLine - prevLine,
        mapping.sourceColumn - prevColumn,
      ]);

      segments.push(vlqSegment);
      prevLine = mapping.sourceLine;
      prevColumn = mapping.sourceColumn;
    }

    return segments.join(',');
  }

  /**
   * Encode array of numbers as VLQ string
   */
  private encodeVLQ(values: number[]): string {
    const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';

    for (const value of values) {
      let vlq = value < 0 ? ((-value) << 1) + 1 : value << 1;

      do {
        let digit = vlq & 0x1F;
        vlq >>>= 5;
        if (vlq > 0) {
          digit |= 0x20; // continuation bit
        }
        result += BASE64_CHARS[digit];
      } while (vlq > 0);
    }

    return result;
  }

  private createStats(sourceSize: number, outputSize: number, startTime: number): WASMCompilationStats {
    return {
      sourceSize,
      outputSize,
      compilationTime: performance.now() - startTime,
      functionCount: 0,
      exportCount: 0,
    };
  }
}
