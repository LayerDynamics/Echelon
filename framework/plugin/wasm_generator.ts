/**
 * WASM Generator Core
 *
 * Main entry point for WASM code generation.
 * Orchestrates compilation, code generation, and optimization.
 */

import type {
  WASMGeneratorSource,
  WASMGeneratorOptions,
  WASMCompilationResult,
  WASMOptimizationLevel,
  WASMTemplate,
  WASMModuleDef,
  WASMFunctionDef,
  WASMValueType,
  WASMInstruction,
} from '../runtime/wasm_types.ts';
import { WASMEvents, WASMOpcode } from '../runtime/wasm_types.ts';
import { WASMCompiler } from './wasm_compiler.ts';
import { WASMCodegen, WASMModuleBuilder } from './wasm_codegen.ts';
import { WASMOptimizer, type OptimizationStats } from './wasm_optimizer.ts';
import { EventEmitter } from './events.ts';
import { getLogger } from '../telemetry/logger.ts';
import { getMetrics } from '../telemetry/metrics.ts';

const logger = getLogger();
const metrics = getMetrics();

/**
 * Generation result
 */
export interface WASMGenerationResult {
  success: boolean;
  wasm?: Uint8Array;
  errors: Array<{ message: string; line?: number; column?: number }>;
  warnings: Array<{ message: string; line?: number; column?: number }>;
  stats: {
    sourceSize: number;
    outputSize: number;
    compilationTime: number;
    optimizationTime?: number;
    functionCount: number;
    exportCount: number;
  };
}

/**
 * WASM Generator Core
 *
 * Provides unified interface for WASM code generation.
 */
export class WASMGeneratorCore {
  private compiler: WASMCompiler;
  private codegen: WASMCodegen;
  private optimizer: WASMOptimizer;
  private events: EventEmitter;
  private templates: Map<string, WASMTemplate> = new Map();

  // Metrics
  private generationCounter = metrics.counter({
    name: 'wasm_generations_total',
    help: 'Total WASM generation operations',
    labels: ['type', 'status'],
  });
  private generationDuration = metrics.histogram({
    name: 'wasm_generation_duration_seconds',
    help: 'WASM generation duration in seconds',
    labels: ['type'],
  });

  constructor(events: EventEmitter) {
    this.events = events;
    this.compiler = new WASMCompiler();
    this.codegen = new WASMCodegen();
    this.optimizer = new WASMOptimizer();

    // Register built-in templates
    this.registerBuiltInTemplates();
  }

  /**
   * Generate WASM from source
   */
  async generate(source: WASMGeneratorSource): Promise<WASMGenerationResult> {
    const timer = this.generationDuration.startTimer({ type: source.type });

    await this.events.emit(WASMEvents.GEN_START, {
      type: source.type,
      sourceLength: source.code.length,
    });

    try {
      let result: WASMGenerationResult;

      switch (source.type) {
        case 'wat':
          result = await this.generateFromWAT(source.code, source.options);
          break;
        case 'typescript':
          result = await this.generateFromTypeScript(source.code, source.options);
          break;
        case 'template':
          result = await this.generateFromTemplateSource(source.code, source.options);
          break;
        default:
          result = {
            success: false,
            errors: [{ message: `Unsupported source type: ${source.type}` }],
            warnings: [],
            stats: { sourceSize: source.code.length, outputSize: 0, compilationTime: 0, functionCount: 0, exportCount: 0 },
          };
      }

      if (result.success && result.wasm) {
        await this.events.emit(WASMEvents.GEN_COMPLETE, {
          type: source.type,
          outputSize: result.wasm.length,
          stats: result.stats,
        });
        this.generationCounter.inc({ type: source.type, status: 'success' });
      } else {
        await this.events.emit(WASMEvents.GEN_ERROR, {
          type: source.type,
          errors: result.errors,
        });
        this.generationCounter.inc({ type: source.type, status: 'error' });
      }

      timer();
      return result;
    } catch (error) {
      timer();
      this.generationCounter.inc({ type: source.type, status: 'error' });

      await this.events.emit(WASMEvents.GEN_ERROR, {
        type: source.type,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        errors: [{ message: error instanceof Error ? error.message : String(error) }],
        warnings: [],
        stats: { sourceSize: source.code.length, outputSize: 0, compilationTime: 0, functionCount: 0, exportCount: 0 },
      };
    }
  }

  /**
   * Generate from WAT source
   */
  async generateFromWAT(source: string, options?: WASMGeneratorOptions): Promise<WASMGenerationResult> {
    const compilationResult = await this.compiler.compileWAT(source, {
      validate: options?.validate ?? true,
      generateSourceMap: options?.sourceMap,
    });

    if (!compilationResult.success || !compilationResult.wasm) {
      return {
        success: false,
        errors: compilationResult.errors ?? [],
        warnings: compilationResult.warnings ?? [],
        stats: compilationResult.stats!,
      };
    }

    let wasm = compilationResult.wasm;
    let optimizationTime: number | undefined;

    // Apply optimization if requested
    if (options?.optimize && options.optimizationLevel !== 'none') {
      const optimizationResult = await this.optimizer.optimize(
        wasm,
        options.optimizationLevel ?? 'speed'
      );
      wasm = optimizationResult.wasm;
      optimizationTime = optimizationResult.stats.duration;
    }

    return {
      success: true,
      wasm,
      errors: [],
      warnings: compilationResult.warnings ?? [],
      stats: {
        ...compilationResult.stats!,
        optimizationTime,
        outputSize: wasm.length,
      },
    };
  }

  /**
   * Generate from TypeScript-like source
   * This is a simplified subset for demonstration
   */
  async generateFromTypeScript(source: string, options?: WASMGeneratorOptions): Promise<WASMGenerationResult> {
    const startTime = performance.now();

    try {
      // Parse TypeScript-like function definitions
      const moduleDef = this.parseTypeScriptSource(source);

      // Generate WASM
      let wasm = WASMModuleBuilder.fromDefinition(moduleDef);

      let optimizationTime: number | undefined;

      // Apply optimization if requested
      if (options?.optimize && options.optimizationLevel !== 'none') {
        const optimizationResult = await this.optimizer.optimize(
          wasm,
          options.optimizationLevel ?? 'speed'
        );
        wasm = optimizationResult.wasm;
        optimizationTime = optimizationResult.stats.duration;
      }

      return {
        success: true,
        wasm,
        errors: [],
        warnings: [],
        stats: {
          sourceSize: source.length,
          outputSize: wasm.length,
          compilationTime: performance.now() - startTime,
          optimizationTime,
          functionCount: moduleDef.functions.length,
          exportCount: moduleDef.exports.length + moduleDef.functions.filter(f => f.export).length,
        },
      };
    } catch (error) {
      return {
        success: false,
        errors: [{ message: error instanceof Error ? error.message : String(error) }],
        warnings: [],
        stats: {
          sourceSize: source.length,
          outputSize: 0,
          compilationTime: performance.now() - startTime,
          functionCount: 0,
          exportCount: 0,
        },
      };
    }
  }

  /**
   * Generate from template source
   */
  private async generateFromTemplateSource(
    source: string,
    options?: WASMGeneratorOptions
  ): Promise<WASMGenerationResult> {
    const startTime = performance.now();

    try {
      // Parse template call: templateName(params)
      const match = source.match(/^(\w+)\s*\((.*)\)$/s);
      if (!match) {
        throw new Error('Invalid template source format. Expected: templateName(params)');
      }

      const [, templateName, paramsJson] = match;
      const params = paramsJson.trim() ? JSON.parse(`{${paramsJson}}`) : {};

      const wasm = await this.generateFromTemplate(templateName, params);

      let optimizedWasm = wasm;
      let optimizationTime: number | undefined;

      if (options?.optimize && options.optimizationLevel !== 'none') {
        const optimizationResult = await this.optimizer.optimize(
          wasm,
          options.optimizationLevel ?? 'speed'
        );
        optimizedWasm = optimizationResult.wasm;
        optimizationTime = optimizationResult.stats.duration;
      }

      return {
        success: true,
        wasm: optimizedWasm,
        errors: [],
        warnings: [],
        stats: {
          sourceSize: source.length,
          outputSize: optimizedWasm.length,
          compilationTime: performance.now() - startTime,
          optimizationTime,
          functionCount: 1,
          exportCount: 1,
        },
      };
    } catch (error) {
      return {
        success: false,
        errors: [{ message: error instanceof Error ? error.message : String(error) }],
        warnings: [],
        stats: {
          sourceSize: source.length,
          outputSize: 0,
          compilationTime: performance.now() - startTime,
          functionCount: 0,
          exportCount: 0,
        },
      };
    }
  }

  /**
   * Generate WASM from a registered template
   */
  async generateFromTemplate(
    templateName: string,
    params: Record<string, unknown>
  ): Promise<Uint8Array> {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    // Validate required parameters
    for (const param of template.parameters) {
      if (param.required && !(param.name in params)) {
        throw new Error(`Missing required parameter: ${param.name}`);
      }
    }

    // Apply defaults
    const fullParams: Record<string, unknown> = {};
    for (const param of template.parameters) {
      fullParams[param.name] = param.name in params ? params[param.name] : param.default;
    }

    // Generate module definition
    const moduleDef = template.generate(fullParams);

    // Build WASM binary
    return WASMModuleBuilder.fromDefinition(moduleDef);
  }

  /**
   * Register a template
   */
  registerTemplate(template: WASMTemplate): void {
    this.templates.set(template.name, template);
    logger.debug(`Registered WASM template: ${template.name}`);
  }

  /**
   * Unregister a template
   */
  unregisterTemplate(name: string): void {
    this.templates.delete(name);
  }

  /**
   * Get all registered templates
   */
  getTemplates(): WASMTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Compile a simple expression to WASM
   */
  compileExpression(expression: string, resultType: WASMValueType = 'i32'): WASMCompilationResult {
    return this.compiler.compileExpression(expression, resultType);
  }

  /**
   * Optimize existing WASM binary
   */
  async optimize(
    wasm: Uint8Array,
    level: WASMOptimizationLevel = 'speed'
  ): Promise<{ wasm: Uint8Array; stats: OptimizationStats }> {
    return this.optimizer.optimize(wasm, level);
  }

  /**
   * Validate WASM binary
   */
  async validate(wasm: Uint8Array): Promise<{ valid: boolean; errors: string[] }> {
    const result = await this.optimizer.validate(wasm);
    return {
      valid: result.valid,
      errors: result.errors.map(e => e.message),
    };
  }

  /**
   * Get the codegen instance for manual module building
   */
  getCodegen(): WASMCodegen {
    return this.codegen;
  }

  /**
   * Create a module builder
   */
  createModuleBuilder(): WASMModuleBuilder {
    return this.codegen.createModuleBuilder();
  }

  // ============================================================================
  // TypeScript Parser - Token Types
  // ============================================================================

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Parse TypeScript-like source to module definition
   * Enhanced parser with AST-based approach
   */
  private parseTypeScriptSource(source: string): WASMModuleDef {
    const parser = new TypeScriptToWASMParser(source);
    return parser.parse();
  }

  /**
   * Register built-in templates
   */
  private registerBuiltInTemplates(): void {
    // Simple math function template
    this.registerTemplate({
      name: 'mathFunction',
      description: 'Generate a simple math function',
      parameters: [
        { name: 'name', type: 'string', required: true, description: 'Function name' },
        { name: 'operation', type: 'string', required: true, description: 'add, sub, mul, div' },
        { name: 'type', type: 'string', default: 'i32', description: 'Value type (i32, i64, f32, f64)' },
      ],
      generate: (params: Record<string, unknown>) => {
        const type = (params.type as WASMValueType) || 'i32';
        const opMap: Record<string, Record<string, number>> = {
          i32: { add: WASMOpcode.I32Add, sub: WASMOpcode.I32Sub, mul: WASMOpcode.I32Mul, div: WASMOpcode.I32DivS },
          i64: { add: WASMOpcode.I64Add, sub: WASMOpcode.I64Sub, mul: WASMOpcode.I64Mul },
          f32: { add: WASMOpcode.F32Add, sub: WASMOpcode.F32Sub, mul: WASMOpcode.F32Mul, div: WASMOpcode.F32Div },
          f64: { add: WASMOpcode.F64Add, sub: WASMOpcode.F64Sub, mul: WASMOpcode.F64Mul, div: WASMOpcode.F64Div },
        };

        return {
          functions: [{
            name: params.name as string,
            signature: { params: [type, type], results: [type] },
            locals: [],
            body: [
              { opcode: WASMOpcode.LocalGet, operands: [0] },
              { opcode: WASMOpcode.LocalGet, operands: [1] },
              { opcode: opMap[type][params.operation as string], operands: [] },
            ],
            export: true,
          }],
          globals: [],
          imports: [],
          exports: [],
        };
      },
    });

    // Counter template
    this.registerTemplate({
      name: 'counter',
      description: 'Generate a counter with increment/decrement/get functions',
      parameters: [
        { name: 'initial', type: 'number', default: 0, description: 'Initial counter value' },
      ],
      generate: (params: Record<string, unknown>) => {
        const initial = (params.initial as number) || 0;

        return {
          functions: [
            {
              name: 'increment',
              signature: { params: [], results: ['i32'] },
              locals: [],
              body: [
                { opcode: WASMOpcode.GlobalGet, operands: [0] },
                { opcode: WASMOpcode.I32Const, operands: [1] },
                { opcode: WASMOpcode.I32Add, operands: [] },
                { opcode: WASMOpcode.GlobalSet, operands: [0] },
                { opcode: WASMOpcode.GlobalGet, operands: [0] },
              ],
              export: true,
            },
            {
              name: 'decrement',
              signature: { params: [], results: ['i32'] },
              locals: [],
              body: [
                { opcode: WASMOpcode.GlobalGet, operands: [0] },
                { opcode: WASMOpcode.I32Const, operands: [1] },
                { opcode: WASMOpcode.I32Sub, operands: [] },
                { opcode: WASMOpcode.GlobalSet, operands: [0] },
                { opcode: WASMOpcode.GlobalGet, operands: [0] },
              ],
              export: true,
            },
            {
              name: 'get',
              signature: { params: [], results: ['i32'] },
              locals: [],
              body: [
                { opcode: WASMOpcode.GlobalGet, operands: [0] },
              ],
              export: true,
            },
            {
              name: 'set',
              signature: { params: ['i32'], results: [] },
              locals: [],
              body: [
                { opcode: WASMOpcode.LocalGet, operands: [0] },
                { opcode: WASMOpcode.GlobalSet, operands: [0] },
              ],
              export: true,
            },
          ],
          globals: [{
            name: 'counter',
            type: 'i32',
            mutable: true,
            init: [{ opcode: WASMOpcode.I32Const, operands: [initial] }],
          }],
          imports: [],
          exports: [],
        };
      },
    });

    logger.debug('Registered built-in WASM templates');
  }
}

// ============================================================================
// TypeScript to WASM Parser
// ============================================================================

/**
 * Token types for the TypeScript lexer
 */
enum TokenType {
  // Keywords
  Export = 'export',
  Function = 'function',
  Class = 'class',
  Const = 'const',
  Let = 'let',
  Var = 'var',
  Return = 'return',
  If = 'if',
  Else = 'else',
  While = 'while',
  For = 'for',
  Break = 'break',
  Continue = 'continue',

  // Identifiers and literals
  Identifier = 'identifier',
  Number = 'number',
  String = 'string',

  // Operators
  Plus = '+',
  Minus = '-',
  Star = '*',
  Slash = '/',
  Percent = '%',
  Ampersand = '&',
  Pipe = '|',
  Caret = '^',
  LessLess = '<<',
  GreaterGreater = '>>',
  GreaterGreaterGreater = '>>>',
  Less = '<',
  Greater = '>',
  LessEqual = '<=',
  GreaterEqual = '>=',
  EqualEqual = '==',
  NotEqual = '!=',
  EqualEqualEqual = '===',
  NotEqualEqual = '!==',
  AmpersandAmpersand = '&&',
  PipePipe = '||',
  Bang = '!',
  Equal = '=',
  PlusEqual = '+=',
  MinusEqual = '-=',
  StarEqual = '*=',
  SlashEqual = '/=',

  // Delimiters
  LeftParen = '(',
  RightParen = ')',
  LeftBrace = '{',
  RightBrace = '}',
  LeftBracket = '[',
  RightBracket = ']',
  Semicolon = ';',
  Colon = ':',
  Comma = ',',
  Dot = '.',
  Arrow = '=>',
  Question = '?',
  At = '@',

  // Special
  EOF = 'eof',
  Error = 'error',
}

/**
 * Token representation
 */
interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

/**
 * AST Node types
 */
type ASTNode =
  | FunctionNode
  | ClassNode
  | VariableNode
  | ReturnNode
  | IfNode
  | WhileNode
  | ForNode
  | ExpressionNode
  | BlockNode
  | DecoratorNode;

interface FunctionNode {
  kind: 'function';
  name: string;
  params: ParameterNode[];
  returnType: string;
  body: ASTNode[];
  exported: boolean;
  decorators: DecoratorNode[];
  line: number;
}

interface ClassNode {
  kind: 'class';
  name: string;
  methods: FunctionNode[];
  properties: VariableNode[];
  exported: boolean;
  decorators: DecoratorNode[];
  line: number;
}

interface VariableNode {
  kind: 'variable';
  name: string;
  type: string;
  initializer?: ExpressionNode;
  mutable: boolean;
  line: number;
}

interface ParameterNode {
  name: string;
  type: string;
}

interface ReturnNode {
  kind: 'return';
  value?: ExpressionNode;
  line: number;
}

interface IfNode {
  kind: 'if';
  condition: ExpressionNode;
  thenBranch: ASTNode[];
  elseBranch?: ASTNode[];
  line: number;
}

interface WhileNode {
  kind: 'while';
  condition: ExpressionNode;
  body: ASTNode[];
  line: number;
}

interface ForNode {
  kind: 'for';
  initializer?: ASTNode;
  condition?: ExpressionNode;
  increment?: ExpressionNode;
  body: ASTNode[];
  line: number;
}

interface BlockNode {
  kind: 'block';
  statements: ASTNode[];
  line: number;
}

interface DecoratorNode {
  kind: 'decorator';
  name: string;
  args: ExpressionNode[];
  line: number;
}

type ExpressionNode =
  | BinaryExpressionNode
  | UnaryExpressionNode
  | CallExpressionNode
  | IdentifierNode
  | LiteralNode
  | MemberExpressionNode
  | AssignmentExpressionNode
  | ConditionalExpressionNode;

interface BinaryExpressionNode {
  kind: 'binary';
  operator: string;
  left: ExpressionNode;
  right: ExpressionNode;
  line: number;
}

interface UnaryExpressionNode {
  kind: 'unary';
  operator: string;
  operand: ExpressionNode;
  prefix: boolean;
  line: number;
}

interface CallExpressionNode {
  kind: 'call';
  callee: ExpressionNode;
  args: ExpressionNode[];
  line: number;
}

interface IdentifierNode {
  kind: 'identifier';
  name: string;
  line: number;
}

interface LiteralNode {
  kind: 'literal';
  value: number | string | boolean;
  type: 'number' | 'string' | 'boolean';
  line: number;
}

interface MemberExpressionNode {
  kind: 'member';
  object: ExpressionNode;
  property: string;
  computed: boolean;
  line: number;
}

interface AssignmentExpressionNode {
  kind: 'assignment';
  operator: string;
  left: ExpressionNode;
  right: ExpressionNode;
  line: number;
}

interface ConditionalExpressionNode {
  kind: 'conditional';
  condition: ExpressionNode;
  consequent: ExpressionNode;
  alternate: ExpressionNode;
  line: number;
}

/**
 * TypeScript to WASM Parser
 * Converts TypeScript source to WASM module definition
 */
class TypeScriptToWASMParser {
  private source: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private currentToken: Token | null = null;
  private peekToken: Token | null = null;

  constructor(source: string) {
    this.source = source;
    this.advance();
    this.advance();
  }

  /**
   * Parse the source into a module definition
   */
  parse(): WASMModuleDef {
    const functions: WASMFunctionDef[] = [];
    const globals: import('../runtime/wasm_types.ts').WASMGlobalDef[] = [];

    while (!this.isAtEnd()) {
      const node = this.parseTopLevel();
      if (!node) continue;

      if (node.kind === 'function') {
        const funcDef = this.functionNodeToWASM(node);
        functions.push(funcDef);
      } else if (node.kind === 'class') {
        // Convert class methods to functions
        for (const method of node.methods) {
          const funcDef = this.functionNodeToWASM(method, node.name);
          functions.push(funcDef);
        }
      } else if (node.kind === 'variable' && node.initializer) {
        // Top-level const becomes global
        globals.push(this.variableNodeToGlobal(node));
      }
    }

    return {
      functions,
      globals,
      imports: [],
      exports: [],
    };
  }

  // ============================================================================
  // Lexer
  // ============================================================================

  private advance(): Token | null {
    const prev = this.currentToken;
    this.currentToken = this.peekToken;
    this.peekToken = this.nextToken();
    return prev;
  }

  private nextToken(): Token {
    this.skipWhitespaceAndComments();

    if (this.pos >= this.source.length) {
      return { type: TokenType.EOF, value: '', line: this.line, column: this.column };
    }

    const startLine = this.line;
    const startColumn = this.column;
    const char = this.source[this.pos];

    // Identifiers and keywords
    if (this.isAlpha(char)) {
      return this.identifier(startLine, startColumn);
    }

    // Numbers
    if (this.isDigit(char) || (char === '.' && this.isDigit(this.source[this.pos + 1]))) {
      return this.number(startLine, startColumn);
    }

    // Strings
    if (char === '"' || char === "'" || char === '`') {
      return this.string(char, startLine, startColumn);
    }

    // Operators and delimiters
    return this.operator(startLine, startColumn);
  }

  private skipWhitespaceAndComments(): void {
    while (this.pos < this.source.length) {
      const char = this.source[this.pos];

      if (char === ' ' || char === '\t' || char === '\r') {
        this.pos++;
        this.column++;
      } else if (char === '\n') {
        this.pos++;
        this.line++;
        this.column = 1;
      } else if (char === '/' && this.source[this.pos + 1] === '/') {
        // Single-line comment
        while (this.pos < this.source.length && this.source[this.pos] !== '\n') {
          this.pos++;
        }
      } else if (char === '/' && this.source[this.pos + 1] === '*') {
        // Multi-line comment
        this.pos += 2;
        while (this.pos < this.source.length - 1 &&
               !(this.source[this.pos] === '*' && this.source[this.pos + 1] === '/')) {
          if (this.source[this.pos] === '\n') {
            this.line++;
            this.column = 1;
          }
          this.pos++;
        }
        this.pos += 2;
      } else {
        break;
      }
    }
  }

  private identifier(startLine: number, startColumn: number): Token {
    let value = '';
    while (this.pos < this.source.length && this.isAlphaNumeric(this.source[this.pos])) {
      value += this.source[this.pos];
      this.pos++;
      this.column++;
    }

    const keywords: Record<string, TokenType> = {
      'export': TokenType.Export,
      'function': TokenType.Function,
      'class': TokenType.Class,
      'const': TokenType.Const,
      'let': TokenType.Let,
      'var': TokenType.Var,
      'return': TokenType.Return,
      'if': TokenType.If,
      'else': TokenType.Else,
      'while': TokenType.While,
      'for': TokenType.For,
      'break': TokenType.Break,
      'continue': TokenType.Continue,
    };

    return {
      type: keywords[value] ?? TokenType.Identifier,
      value,
      line: startLine,
      column: startColumn,
    };
  }

  private number(startLine: number, startColumn: number): Token {
    let value = '';

    // Integer or float part
    while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
      value += this.source[this.pos];
      this.pos++;
      this.column++;
    }

    // Decimal part
    if (this.source[this.pos] === '.' && this.isDigit(this.source[this.pos + 1])) {
      value += this.source[this.pos];
      this.pos++;
      this.column++;
      while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
        value += this.source[this.pos];
        this.pos++;
        this.column++;
      }
    }

    // Exponent part
    if (this.source[this.pos] === 'e' || this.source[this.pos] === 'E') {
      value += this.source[this.pos];
      this.pos++;
      this.column++;
      if (this.source[this.pos] === '+' || this.source[this.pos] === '-') {
        value += this.source[this.pos];
        this.pos++;
        this.column++;
      }
      while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
        value += this.source[this.pos];
        this.pos++;
        this.column++;
      }
    }

    return { type: TokenType.Number, value, line: startLine, column: startColumn };
  }

  private string(quote: string, startLine: number, startColumn: number): Token {
    this.pos++; // Skip opening quote
    this.column++;
    let value = '';

    while (this.pos < this.source.length && this.source[this.pos] !== quote) {
      if (this.source[this.pos] === '\\') {
        this.pos++;
        this.column++;
        if (this.pos < this.source.length) {
          const escaped: Record<string, string> = {
            'n': '\n', 't': '\t', 'r': '\r', '\\': '\\', "'": "'", '"': '"', '`': '`'
          };
          value += escaped[this.source[this.pos]] ?? this.source[this.pos];
        }
      } else {
        value += this.source[this.pos];
      }
      if (this.source[this.pos] === '\n') {
        this.line++;
        this.column = 1;
      } else {
        this.column++;
      }
      this.pos++;
    }
    this.pos++; // Skip closing quote
    this.column++;

    return { type: TokenType.String, value, line: startLine, column: startColumn };
  }

  private operator(startLine: number, startColumn: number): Token {
    const twoChar = this.source.slice(this.pos, this.pos + 2);
    const threeChar = this.source.slice(this.pos, this.pos + 3);

    const threeCharOps: Record<string, TokenType> = {
      '===': TokenType.EqualEqualEqual,
      '!==': TokenType.NotEqualEqual,
      '>>>': TokenType.GreaterGreaterGreater,
    };

    if (threeCharOps[threeChar]) {
      this.pos += 3;
      this.column += 3;
      return { type: threeCharOps[threeChar], value: threeChar, line: startLine, column: startColumn };
    }

    const twoCharOps: Record<string, TokenType> = {
      '==': TokenType.EqualEqual,
      '!=': TokenType.NotEqual,
      '<=': TokenType.LessEqual,
      '>=': TokenType.GreaterEqual,
      '<<': TokenType.LessLess,
      '>>': TokenType.GreaterGreater,
      '&&': TokenType.AmpersandAmpersand,
      '||': TokenType.PipePipe,
      '+=': TokenType.PlusEqual,
      '-=': TokenType.MinusEqual,
      '*=': TokenType.StarEqual,
      '/=': TokenType.SlashEqual,
      '=>': TokenType.Arrow,
    };

    if (twoCharOps[twoChar]) {
      this.pos += 2;
      this.column += 2;
      return { type: twoCharOps[twoChar], value: twoChar, line: startLine, column: startColumn };
    }

    const oneCharOps: Record<string, TokenType> = {
      '+': TokenType.Plus,
      '-': TokenType.Minus,
      '*': TokenType.Star,
      '/': TokenType.Slash,
      '%': TokenType.Percent,
      '&': TokenType.Ampersand,
      '|': TokenType.Pipe,
      '^': TokenType.Caret,
      '<': TokenType.Less,
      '>': TokenType.Greater,
      '!': TokenType.Bang,
      '=': TokenType.Equal,
      '(': TokenType.LeftParen,
      ')': TokenType.RightParen,
      '{': TokenType.LeftBrace,
      '}': TokenType.RightBrace,
      '[': TokenType.LeftBracket,
      ']': TokenType.RightBracket,
      ';': TokenType.Semicolon,
      ':': TokenType.Colon,
      ',': TokenType.Comma,
      '.': TokenType.Dot,
      '?': TokenType.Question,
      '@': TokenType.At,
    };

    const char = this.source[this.pos];
    this.pos++;
    this.column++;

    return {
      type: oneCharOps[char] ?? TokenType.Error,
      value: char,
      line: startLine,
      column: startColumn,
    };
  }

  private isAlpha(char: string): boolean {
    return /[a-zA-Z_$]/.test(char);
  }

  private isDigit(char: string): boolean {
    return /[0-9]/.test(char);
  }

  private isAlphaNumeric(char: string): boolean {
    return this.isAlpha(char) || this.isDigit(char);
  }

  private isAtEnd(): boolean {
    return this.currentToken?.type === TokenType.EOF;
  }

  private check(type: TokenType): boolean {
    return this.currentToken?.type === type;
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private expect(type: TokenType, message: string): Token {
    if (this.check(type)) {
      return this.advance()!;
    }
    throw new Error(`${message} at line ${this.currentToken?.line}, column ${this.currentToken?.column}`);
  }

  // ============================================================================
  // Parser
  // ============================================================================

  private parseTopLevel(): ASTNode | null {
    // Handle decorators
    const decorators: DecoratorNode[] = [];
    while (this.check(TokenType.At)) {
      decorators.push(this.parseDecorator());
    }

    const exported = this.match(TokenType.Export);

    if (this.check(TokenType.Function)) {
      return this.parseFunction(exported, decorators);
    }

    if (this.check(TokenType.Class)) {
      return this.parseClass(exported, decorators);
    }

    if (this.check(TokenType.Const) || this.check(TokenType.Let) || this.check(TokenType.Var)) {
      return this.parseVariableDeclaration(exported);
    }

    // Skip unknown tokens
    if (!this.isAtEnd()) {
      this.advance();
    }
    return null;
  }

  private parseDecorator(): DecoratorNode {
    const line = this.currentToken!.line;
    this.expect(TokenType.At, 'Expected @');
    const name = this.expect(TokenType.Identifier, 'Expected decorator name').value;

    const args: ExpressionNode[] = [];
    if (this.match(TokenType.LeftParen)) {
      if (!this.check(TokenType.RightParen)) {
        do {
          args.push(this.parseExpression());
        } while (this.match(TokenType.Comma));
      }
      this.expect(TokenType.RightParen, 'Expected )');
    }

    return { kind: 'decorator', name, args, line };
  }

  private parseFunction(exported: boolean, decorators: DecoratorNode[]): FunctionNode {
    const line = this.currentToken!.line;
    this.expect(TokenType.Function, 'Expected function');
    const name = this.expect(TokenType.Identifier, 'Expected function name').value;

    this.expect(TokenType.LeftParen, 'Expected (');
    const params = this.parseParameterList();
    this.expect(TokenType.RightParen, 'Expected )');

    let returnType = 'void';
    if (this.match(TokenType.Colon)) {
      returnType = this.parseType();
    }

    this.expect(TokenType.LeftBrace, 'Expected {');
    const body = this.parseBlock();
    this.expect(TokenType.RightBrace, 'Expected }');

    return { kind: 'function', name, params, returnType, body, exported, decorators, line };
  }

  private parseClass(exported: boolean, decorators: DecoratorNode[]): ClassNode {
    const line = this.currentToken!.line;
    this.expect(TokenType.Class, 'Expected class');
    const name = this.expect(TokenType.Identifier, 'Expected class name').value;

    this.expect(TokenType.LeftBrace, 'Expected {');

    const methods: FunctionNode[] = [];
    const properties: VariableNode[] = [];

    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      const memberDecorators: DecoratorNode[] = [];
      while (this.check(TokenType.At)) {
        memberDecorators.push(this.parseDecorator());
      }

      if (this.check(TokenType.Identifier)) {
        const memberName = this.advance()!.value;

        if (this.check(TokenType.LeftParen)) {
          // Method
          this.expect(TokenType.LeftParen, 'Expected (');
          const params = this.parseParameterList();
          this.expect(TokenType.RightParen, 'Expected )');

          let returnType = 'void';
          if (this.match(TokenType.Colon)) {
            returnType = this.parseType();
          }

          this.expect(TokenType.LeftBrace, 'Expected {');
          const body = this.parseBlock();
          this.expect(TokenType.RightBrace, 'Expected }');

          methods.push({
            kind: 'function',
            name: memberName,
            params,
            returnType,
            body,
            exported: true,
            decorators: memberDecorators,
            line: this.currentToken!.line,
          });
        } else {
          // Property
          let type = 'i32';
          if (this.match(TokenType.Colon)) {
            type = this.parseType();
          }

          let initializer: ExpressionNode | undefined;
          if (this.match(TokenType.Equal)) {
            initializer = this.parseExpression();
          }

          this.match(TokenType.Semicolon);

          properties.push({
            kind: 'variable',
            name: memberName,
            type,
            initializer,
            mutable: true,
            line: this.currentToken!.line,
          });
        }
      } else {
        this.advance();
      }
    }

    this.expect(TokenType.RightBrace, 'Expected }');

    return { kind: 'class', name, methods, properties, exported, decorators, line };
  }

  private parseVariableDeclaration(exported: boolean): VariableNode {
    const line = this.currentToken!.line;
    const mutable = this.currentToken!.type !== TokenType.Const;
    this.advance(); // const/let/var

    const name = this.expect(TokenType.Identifier, 'Expected variable name').value;

    let type = 'i32';
    if (this.match(TokenType.Colon)) {
      type = this.parseType();
    }

    let initializer: ExpressionNode | undefined;
    if (this.match(TokenType.Equal)) {
      initializer = this.parseExpression();
    }

    this.match(TokenType.Semicolon);

    return { kind: 'variable', name, type, initializer, mutable, line };
  }

  private parseParameterList(): ParameterNode[] {
    const params: ParameterNode[] = [];

    if (!this.check(TokenType.RightParen)) {
      do {
        const name = this.expect(TokenType.Identifier, 'Expected parameter name').value;
        let type = 'i32';
        if (this.match(TokenType.Colon)) {
          type = this.parseType();
        }
        params.push({ name, type });
      } while (this.match(TokenType.Comma));
    }

    return params;
  }

  private parseType(): string {
    const token = this.advance();
    if (!token || token.type !== TokenType.Identifier) {
      return 'i32';
    }
    return token.value;
  }

  private parseBlock(): ASTNode[] {
    const statements: ASTNode[] = [];

    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      const stmt = this.parseStatement();
      if (stmt) statements.push(stmt);
    }

    return statements;
  }

  private parseStatement(): ASTNode | null {
    if (this.check(TokenType.Return)) {
      return this.parseReturn();
    }

    if (this.check(TokenType.If)) {
      return this.parseIf();
    }

    if (this.check(TokenType.While)) {
      return this.parseWhile();
    }

    if (this.check(TokenType.For)) {
      return this.parseFor();
    }

    if (this.check(TokenType.LeftBrace)) {
      this.advance();
      const body = this.parseBlock();
      this.expect(TokenType.RightBrace, 'Expected }');
      return { kind: 'block', statements: body, line: this.currentToken!.line };
    }

    if (this.check(TokenType.Const) || this.check(TokenType.Let) || this.check(TokenType.Var)) {
      return this.parseVariableDeclaration(false);
    }

    // Expression statement
    const expr = this.parseExpression();
    this.match(TokenType.Semicolon);
    return expr;
  }

  private parseReturn(): ReturnNode {
    const line = this.currentToken!.line;
    this.advance(); // return

    let value: ExpressionNode | undefined;
    if (!this.check(TokenType.Semicolon) && !this.check(TokenType.RightBrace)) {
      value = this.parseExpression();
    }

    this.match(TokenType.Semicolon);
    return { kind: 'return', value, line };
  }

  private parseIf(): IfNode {
    const line = this.currentToken!.line;
    this.advance(); // if

    this.expect(TokenType.LeftParen, 'Expected (');
    const condition = this.parseExpression();
    this.expect(TokenType.RightParen, 'Expected )');

    this.expect(TokenType.LeftBrace, 'Expected {');
    const thenBranch = this.parseBlock();
    this.expect(TokenType.RightBrace, 'Expected }');

    let elseBranch: ASTNode[] | undefined;
    if (this.match(TokenType.Else)) {
      if (this.check(TokenType.If)) {
        elseBranch = [this.parseIf()];
      } else {
        this.expect(TokenType.LeftBrace, 'Expected {');
        elseBranch = this.parseBlock();
        this.expect(TokenType.RightBrace, 'Expected }');
      }
    }

    return { kind: 'if', condition, thenBranch, elseBranch, line };
  }

  private parseWhile(): WhileNode {
    const line = this.currentToken!.line;
    this.advance(); // while

    this.expect(TokenType.LeftParen, 'Expected (');
    const condition = this.parseExpression();
    this.expect(TokenType.RightParen, 'Expected )');

    this.expect(TokenType.LeftBrace, 'Expected {');
    const body = this.parseBlock();
    this.expect(TokenType.RightBrace, 'Expected }');

    return { kind: 'while', condition, body, line };
  }

  private parseFor(): ForNode {
    const line = this.currentToken!.line;
    this.advance(); // for

    this.expect(TokenType.LeftParen, 'Expected (');

    let initializer: ASTNode | undefined;
    if (!this.check(TokenType.Semicolon)) {
      if (this.check(TokenType.Let) || this.check(TokenType.Const) || this.check(TokenType.Var)) {
        initializer = this.parseVariableDeclaration(false);
      } else {
        initializer = this.parseExpression();
        this.match(TokenType.Semicolon);
      }
    } else {
      this.advance(); // ;
    }

    let condition: ExpressionNode | undefined;
    if (!this.check(TokenType.Semicolon)) {
      condition = this.parseExpression();
    }
    this.expect(TokenType.Semicolon, 'Expected ;');

    let increment: ExpressionNode | undefined;
    if (!this.check(TokenType.RightParen)) {
      increment = this.parseExpression();
    }
    this.expect(TokenType.RightParen, 'Expected )');

    this.expect(TokenType.LeftBrace, 'Expected {');
    const body = this.parseBlock();
    this.expect(TokenType.RightBrace, 'Expected }');

    return { kind: 'for', initializer, condition, increment, body, line };
  }

  // Expression parsing with precedence climbing
  private parseExpression(): ExpressionNode {
    return this.parseAssignment();
  }

  private parseAssignment(): ExpressionNode {
    const expr = this.parseTernary();

    if (this.check(TokenType.Equal) || this.check(TokenType.PlusEqual) ||
        this.check(TokenType.MinusEqual) || this.check(TokenType.StarEqual) ||
        this.check(TokenType.SlashEqual)) {
      const operator = this.advance()!.value;
      const right = this.parseAssignment();
      return { kind: 'assignment', operator, left: expr, right, line: expr.line };
    }

    return expr;
  }

  private parseTernary(): ExpressionNode {
    const expr = this.parseOr();

    if (this.match(TokenType.Question)) {
      const consequent = this.parseExpression();
      this.expect(TokenType.Colon, 'Expected :');
      const alternate = this.parseTernary();
      return { kind: 'conditional', condition: expr, consequent, alternate, line: expr.line };
    }

    return expr;
  }

  private parseOr(): ExpressionNode {
    let expr = this.parseAnd();

    while (this.match(TokenType.PipePipe)) {
      const right = this.parseAnd();
      expr = { kind: 'binary', operator: '||', left: expr, right, line: expr.line };
    }

    return expr;
  }

  private parseAnd(): ExpressionNode {
    let expr = this.parseBitwiseOr();

    while (this.match(TokenType.AmpersandAmpersand)) {
      const right = this.parseBitwiseOr();
      expr = { kind: 'binary', operator: '&&', left: expr, right, line: expr.line };
    }

    return expr;
  }

  private parseBitwiseOr(): ExpressionNode {
    let expr = this.parseBitwiseXor();

    while (this.match(TokenType.Pipe)) {
      const right = this.parseBitwiseXor();
      expr = { kind: 'binary', operator: '|', left: expr, right, line: expr.line };
    }

    return expr;
  }

  private parseBitwiseXor(): ExpressionNode {
    let expr = this.parseBitwiseAnd();

    while (this.match(TokenType.Caret)) {
      const right = this.parseBitwiseAnd();
      expr = { kind: 'binary', operator: '^', left: expr, right, line: expr.line };
    }

    return expr;
  }

  private parseBitwiseAnd(): ExpressionNode {
    let expr = this.parseEquality();

    while (this.match(TokenType.Ampersand)) {
      const right = this.parseEquality();
      expr = { kind: 'binary', operator: '&', left: expr, right, line: expr.line };
    }

    return expr;
  }

  private parseEquality(): ExpressionNode {
    let expr = this.parseComparison();

    while (this.check(TokenType.EqualEqual) || this.check(TokenType.NotEqual) ||
           this.check(TokenType.EqualEqualEqual) || this.check(TokenType.NotEqualEqual)) {
      const operator = this.advance()!.value;
      const right = this.parseComparison();
      expr = { kind: 'binary', operator, left: expr, right, line: expr.line };
    }

    return expr;
  }

  private parseComparison(): ExpressionNode {
    let expr = this.parseShift();

    while (this.check(TokenType.Less) || this.check(TokenType.Greater) ||
           this.check(TokenType.LessEqual) || this.check(TokenType.GreaterEqual)) {
      const operator = this.advance()!.value;
      const right = this.parseShift();
      expr = { kind: 'binary', operator, left: expr, right, line: expr.line };
    }

    return expr;
  }

  private parseShift(): ExpressionNode {
    let expr = this.parseAdditive();

    while (this.check(TokenType.LessLess) || this.check(TokenType.GreaterGreater) ||
           this.check(TokenType.GreaterGreaterGreater)) {
      const operator = this.advance()!.value;
      const right = this.parseAdditive();
      expr = { kind: 'binary', operator, left: expr, right, line: expr.line };
    }

    return expr;
  }

  private parseAdditive(): ExpressionNode {
    let expr = this.parseMultiplicative();

    while (this.check(TokenType.Plus) || this.check(TokenType.Minus)) {
      const operator = this.advance()!.value;
      const right = this.parseMultiplicative();
      expr = { kind: 'binary', operator, left: expr, right, line: expr.line };
    }

    return expr;
  }

  private parseMultiplicative(): ExpressionNode {
    let expr = this.parseUnary();

    while (this.check(TokenType.Star) || this.check(TokenType.Slash) || this.check(TokenType.Percent)) {
      const operator = this.advance()!.value;
      const right = this.parseUnary();
      expr = { kind: 'binary', operator, left: expr, right, line: expr.line };
    }

    return expr;
  }

  private parseUnary(): ExpressionNode {
    if (this.check(TokenType.Bang) || this.check(TokenType.Minus) || this.check(TokenType.Plus)) {
      const operator = this.advance()!.value;
      const operand = this.parseUnary();
      return { kind: 'unary', operator, operand, prefix: true, line: operand.line };
    }

    return this.parsePostfix();
  }

  private parsePostfix(): ExpressionNode {
    let expr = this.parsePrimary();

    while (true) {
      if (this.match(TokenType.LeftParen)) {
        const args: ExpressionNode[] = [];
        if (!this.check(TokenType.RightParen)) {
          do {
            args.push(this.parseExpression());
          } while (this.match(TokenType.Comma));
        }
        this.expect(TokenType.RightParen, 'Expected )');
        expr = { kind: 'call', callee: expr, args, line: expr.line };
      } else if (this.match(TokenType.Dot)) {
        const property = this.expect(TokenType.Identifier, 'Expected property name').value;
        expr = { kind: 'member', object: expr, property, computed: false, line: expr.line };
      } else if (this.match(TokenType.LeftBracket)) {
        const index = this.parseExpression();
        this.expect(TokenType.RightBracket, 'Expected ]');
        if (index.kind === 'literal' && index.type === 'string') {
          expr = { kind: 'member', object: expr, property: String(index.value), computed: true, line: expr.line };
        }
      } else {
        break;
      }
    }

    return expr;
  }

  private parsePrimary(): ExpressionNode {
    const line = this.currentToken?.line ?? 1;

    if (this.match(TokenType.Number)) {
      const value = parseFloat(this.currentToken?.value ?? '');
      return { kind: 'literal', value, type: 'number', line };
    }

    if (this.match(TokenType.String)) {
      return { kind: 'literal', value: this.currentToken?.value ?? '', type: 'string', line };
    }

    if (this.currentToken?.type === TokenType.Identifier) {
      const value = this.currentToken.value;
      if (value === 'true' || value === 'false') {
        this.advance();
        return { kind: 'literal', value: value === 'true', type: 'boolean', line };
      }
      this.advance();
      return { kind: 'identifier', name: value, line };
    }

    if (this.match(TokenType.LeftParen)) {
      const expr = this.parseExpression();
      this.expect(TokenType.RightParen, 'Expected )');
      return expr;
    }

    throw new Error(`Unexpected token at line ${line}`);
  }

  // ============================================================================
  // Code Generation
  // ============================================================================

  private functionNodeToWASM(node: FunctionNode, className?: string): WASMFunctionDef {
    const name = className ? `${className}_${node.name}` : node.name;
    const params: WASMValueType[] = node.params.map(p => this.typeToWasm(p.type));
    const results: WASMValueType[] = node.returnType !== 'void' ? [this.typeToWasm(node.returnType)] : [];

    // Build scope for code generation
    const scope = new Map<string, { index: number; type: WASMValueType }>();
    let localIndex = 0;

    // Add parameters to scope
    for (const param of node.params) {
      scope.set(param.name, { index: localIndex++, type: this.typeToWasm(param.type) });
    }

    // Find all local variable declarations
    const locals: WASMValueType[] = [];
    this.collectLocals(node.body, scope, localIndex, locals);

    // Generate body instructions
    const body = this.generateStatements(node.body, scope, results.length > 0 ? results[0] : 'i32');

    return {
      name,
      signature: { params, results },
      locals,
      body,
      export: node.exported,
    };
  }

  private collectLocals(
    statements: ASTNode[],
    scope: Map<string, { index: number; type: WASMValueType }>,
    startIndex: number,
    locals: WASMValueType[]
  ): void {
    for (const stmt of statements) {
      if (stmt.kind === 'variable') {
        const type = this.typeToWasm(stmt.type);
        scope.set(stmt.name, { index: startIndex + locals.length, type });
        locals.push(type);
      } else if (stmt.kind === 'if') {
        this.collectLocals(stmt.thenBranch, scope, startIndex, locals);
        if (stmt.elseBranch) {
          this.collectLocals(stmt.elseBranch, scope, startIndex, locals);
        }
      } else if (stmt.kind === 'while') {
        this.collectLocals(stmt.body, scope, startIndex, locals);
      } else if (stmt.kind === 'for') {
        if (stmt.initializer?.kind === 'variable') {
          const type = this.typeToWasm(stmt.initializer.type);
          scope.set(stmt.initializer.name, { index: startIndex + locals.length, type });
          locals.push(type);
        }
        this.collectLocals(stmt.body, scope, startIndex, locals);
      } else if (stmt.kind === 'block') {
        this.collectLocals(stmt.statements, scope, startIndex, locals);
      }
    }
  }

  private generateStatements(
    statements: ASTNode[],
    scope: Map<string, { index: number; type: WASMValueType }>,
    returnType: WASMValueType
  ): WASMInstruction[] {
    const instructions: WASMInstruction[] = [];

    for (const stmt of statements) {
      instructions.push(...this.generateStatement(stmt, scope, returnType));
    }

    return instructions;
  }

  private generateStatement(
    stmt: ASTNode,
    scope: Map<string, { index: number; type: WASMValueType }>,
    returnType: WASMValueType
  ): WASMInstruction[] {
    switch (stmt.kind) {
      case 'return':
        return this.generateReturn(stmt, scope, returnType);
      case 'if':
        return this.generateIf(stmt, scope, returnType);
      case 'while':
        return this.generateWhile(stmt, scope, returnType);
      case 'for':
        return this.generateFor(stmt, scope, returnType);
      case 'variable':
        return this.generateVariableDecl(stmt, scope);
      case 'block':
        return this.generateStatements(stmt.statements, scope, returnType);
      default:
        if ('kind' in stmt && (stmt as ExpressionNode).kind) {
          const expr = this.generateExpression(stmt as ExpressionNode, scope, returnType);
          // Drop result if not used
          if (expr.length > 0) {
            expr.push({ opcode: WASMOpcode.Drop, operands: [] });
          }
          return expr;
        }
        return [];
    }
  }

  private generateReturn(
    stmt: ReturnNode,
    scope: Map<string, { index: number; type: WASMValueType }>,
    returnType: WASMValueType
  ): WASMInstruction[] {
    if (!stmt.value) {
      return [{ opcode: WASMOpcode.Return, operands: [] }];
    }

    const instructions = this.generateExpression(stmt.value, scope, returnType);
    instructions.push({ opcode: WASMOpcode.Return, operands: [] });
    return instructions;
  }

  private generateIf(
    stmt: IfNode,
    scope: Map<string, { index: number; type: WASMValueType }>,
    returnType: WASMValueType
  ): WASMInstruction[] {
    const instructions: WASMInstruction[] = [];

    // Generate condition
    instructions.push(...this.generateExpression(stmt.condition, scope, 'i32'));

    // If block
    instructions.push({ opcode: WASMOpcode.If, operands: [0x40] }); // void block type

    // Then branch
    instructions.push(...this.generateStatements(stmt.thenBranch, scope, returnType));

    // Else branch
    if (stmt.elseBranch) {
      instructions.push({ opcode: WASMOpcode.Else, operands: [] });
      instructions.push(...this.generateStatements(stmt.elseBranch, scope, returnType));
    }

    instructions.push({ opcode: WASMOpcode.End, operands: [] });

    return instructions;
  }

  private generateWhile(
    stmt: WhileNode,
    scope: Map<string, { index: number; type: WASMValueType }>,
    returnType: WASMValueType
  ): WASMInstruction[] {
    const instructions: WASMInstruction[] = [];

    // Block for break
    instructions.push({ opcode: WASMOpcode.Block, operands: [0x40] });

    // Loop for continue
    instructions.push({ opcode: WASMOpcode.Loop, operands: [0x40] });

    // Condition check - br_if 1 (to block end) if condition is false
    instructions.push(...this.generateExpression(stmt.condition, scope, 'i32'));
    instructions.push({ opcode: WASMOpcode.I32Eqz, operands: [] });
    instructions.push({ opcode: WASMOpcode.BrIf, operands: [1] });

    // Body
    instructions.push(...this.generateStatements(stmt.body, scope, returnType));

    // Jump back to loop start
    instructions.push({ opcode: WASMOpcode.Br, operands: [0] });

    instructions.push({ opcode: WASMOpcode.End, operands: [] }); // loop end
    instructions.push({ opcode: WASMOpcode.End, operands: [] }); // block end

    return instructions;
  }

  private generateFor(
    stmt: ForNode,
    scope: Map<string, { index: number; type: WASMValueType }>,
    returnType: WASMValueType
  ): WASMInstruction[] {
    const instructions: WASMInstruction[] = [];

    // Initializer
    if (stmt.initializer) {
      if (stmt.initializer.kind === 'variable') {
        instructions.push(...this.generateVariableDecl(stmt.initializer, scope));
      } else {
        instructions.push(...this.generateExpression(stmt.initializer as ExpressionNode, scope, 'i32'));
        instructions.push({ opcode: WASMOpcode.Drop, operands: [] });
      }
    }

    // Block for break
    instructions.push({ opcode: WASMOpcode.Block, operands: [0x40] });

    // Loop
    instructions.push({ opcode: WASMOpcode.Loop, operands: [0x40] });

    // Condition
    if (stmt.condition) {
      instructions.push(...this.generateExpression(stmt.condition, scope, 'i32'));
      instructions.push({ opcode: WASMOpcode.I32Eqz, operands: [] });
      instructions.push({ opcode: WASMOpcode.BrIf, operands: [1] });
    }

    // Body
    instructions.push(...this.generateStatements(stmt.body, scope, returnType));

    // Increment
    if (stmt.increment) {
      instructions.push(...this.generateExpression(stmt.increment, scope, 'i32'));
      instructions.push({ opcode: WASMOpcode.Drop, operands: [] });
    }

    // Loop back
    instructions.push({ opcode: WASMOpcode.Br, operands: [0] });

    instructions.push({ opcode: WASMOpcode.End, operands: [] });
    instructions.push({ opcode: WASMOpcode.End, operands: [] });

    return instructions;
  }

  private generateVariableDecl(
    stmt: VariableNode,
    scope: Map<string, { index: number; type: WASMValueType }>
  ): WASMInstruction[] {
    const local = scope.get(stmt.name);
    if (!local) return [];

    if (stmt.initializer) {
      const instructions = this.generateExpression(stmt.initializer, scope, local.type);
      instructions.push({ opcode: WASMOpcode.LocalSet, operands: [local.index] });
      return instructions;
    }

    return [];
  }

  private generateExpression(
    expr: ExpressionNode,
    scope: Map<string, { index: number; type: WASMValueType }>,
    expectedType: WASMValueType
  ): WASMInstruction[] {
    switch (expr.kind) {
      case 'literal':
        return this.generateLiteral(expr, expectedType);
      case 'identifier':
        return this.generateIdentifier(expr, scope);
      case 'binary':
        return this.generateBinary(expr, scope, expectedType);
      case 'unary':
        return this.generateUnary(expr, scope, expectedType);
      case 'call':
        return this.generateCall(expr, scope);
      case 'assignment':
        return this.generateAssignment(expr, scope);
      case 'conditional':
        return this.generateConditional(expr, scope, expectedType);
      default:
        return [];
    }
  }

  private generateLiteral(expr: LiteralNode, expectedType: WASMValueType): WASMInstruction[] {
    if (expr.type === 'number') {
      const value = expr.value as number;
      if (expectedType === 'f64') {
        return [{ opcode: WASMOpcode.F64Const, operands: [{ f64: value }] }];
      } else if (expectedType === 'f32') {
        return [{ opcode: WASMOpcode.F32Const, operands: [{ f32: value }] }];
      } else if (expectedType === 'i64') {
        return [{ opcode: WASMOpcode.I64Const, operands: [BigInt(Math.trunc(value))] }];
      } else {
        return [{ opcode: WASMOpcode.I32Const, operands: [Math.trunc(value)] }];
      }
    } else if (expr.type === 'boolean') {
      return [{ opcode: WASMOpcode.I32Const, operands: [expr.value ? 1 : 0] }];
    }
    return [];
  }

  private generateIdentifier(
    expr: IdentifierNode,
    scope: Map<string, { index: number; type: WASMValueType }>
  ): WASMInstruction[] {
    const local = scope.get(expr.name);
    if (local) {
      return [{ opcode: WASMOpcode.LocalGet, operands: [local.index] }];
    }
    return [];
  }

  private generateBinary(
    expr: BinaryExpressionNode,
    scope: Map<string, { index: number; type: WASMValueType }>,
    expectedType: WASMValueType
  ): WASMInstruction[] {
    const instructions: WASMInstruction[] = [];

    instructions.push(...this.generateExpression(expr.left, scope, expectedType));
    instructions.push(...this.generateExpression(expr.right, scope, expectedType));

    const opMap: Record<string, Record<string, number>> = {
      'i32': {
        '+': WASMOpcode.I32Add, '-': WASMOpcode.I32Sub, '*': WASMOpcode.I32Mul, '/': WASMOpcode.I32DivS,
        '%': WASMOpcode.I32RemS, '&': WASMOpcode.I32And, '|': WASMOpcode.I32Or, '^': WASMOpcode.I32Xor,
        '<<': WASMOpcode.I32Shl, '>>': WASMOpcode.I32ShrS, '>>>': WASMOpcode.I32ShrU,
        '==': WASMOpcode.I32Eq, '!=': WASMOpcode.I32Ne, '===': WASMOpcode.I32Eq, '!==': WASMOpcode.I32Ne,
        '<': WASMOpcode.I32LtS, '>': WASMOpcode.I32GtS, '<=': WASMOpcode.I32LeS, '>=': WASMOpcode.I32GeS,
      },
      'i64': {
        '+': WASMOpcode.I64Add, '-': WASMOpcode.I64Sub, '*': WASMOpcode.I64Mul,
      },
      'f32': {
        '+': WASMOpcode.F32Add, '-': WASMOpcode.F32Sub, '*': WASMOpcode.F32Mul, '/': WASMOpcode.F32Div,
      },
      'f64': {
        '+': WASMOpcode.F64Add, '-': WASMOpcode.F64Sub, '*': WASMOpcode.F64Mul, '/': WASMOpcode.F64Div,
      },
    };

    const ops = opMap[expectedType] ?? opMap['i32'];
    const opcode = ops[expr.operator];
    if (opcode !== undefined) {
      instructions.push({ opcode, operands: [] });
    }

    return instructions;
  }

  private generateUnary(
    expr: UnaryExpressionNode,
    scope: Map<string, { index: number; type: WASMValueType }>,
    expectedType: WASMValueType
  ): WASMInstruction[] {
    const instructions: WASMInstruction[] = [];

    if (expr.operator === '-') {
      // Negate: 0 - value
      if (expectedType === 'i32') {
        instructions.push({ opcode: WASMOpcode.I32Const, operands: [0] });
      } else if (expectedType === 'f64') {
        instructions.push({ opcode: WASMOpcode.F64Const, operands: [{ f64: 0 }] });
      }
      instructions.push(...this.generateExpression(expr.operand, scope, expectedType));
      if (expectedType === 'i32') {
        instructions.push({ opcode: WASMOpcode.I32Sub, operands: [] });
      } else if (expectedType === 'f64') {
        instructions.push({ opcode: WASMOpcode.F64Sub, operands: [] });
      }
    } else if (expr.operator === '!') {
      instructions.push(...this.generateExpression(expr.operand, scope, 'i32'));
      instructions.push({ opcode: WASMOpcode.I32Eqz, operands: [] });
    } else if (expr.operator === '+') {
      instructions.push(...this.generateExpression(expr.operand, scope, expectedType));
    }

    return instructions;
  }

  private generateCall(
    expr: CallExpressionNode,
    scope: Map<string, { index: number; type: WASMValueType }>
  ): WASMInstruction[] {
    const instructions: WASMInstruction[] = [];

    // Generate arguments
    for (const arg of expr.args) {
      instructions.push(...this.generateExpression(arg, scope, 'i32'));
    }

    // For now, we don't have function index resolution
    // This would require a symbol table of all functions
    return instructions;
  }

  private generateAssignment(
    expr: AssignmentExpressionNode,
    scope: Map<string, { index: number; type: WASMValueType }>
  ): WASMInstruction[] {
    if (expr.left.kind !== 'identifier') return [];

    const local = scope.get(expr.left.name);
    if (!local) return [];

    const instructions: WASMInstruction[] = [];

    if (expr.operator === '=') {
      instructions.push(...this.generateExpression(expr.right, scope, local.type));
    } else {
      // Compound assignment: a += b -> a = a + b
      instructions.push({ opcode: WASMOpcode.LocalGet, operands: [local.index] });
      instructions.push(...this.generateExpression(expr.right, scope, local.type));

      const opMap: Record<string, number> = {
        '+=': WASMOpcode.I32Add,
        '-=': WASMOpcode.I32Sub,
        '*=': WASMOpcode.I32Mul,
        '/=': WASMOpcode.I32DivS,
      };
      instructions.push({ opcode: opMap[expr.operator], operands: [] });
    }

    instructions.push({ opcode: WASMOpcode.LocalTee, operands: [local.index] });
    return instructions;
  }

  private generateConditional(
    expr: ConditionalExpressionNode,
    scope: Map<string, { index: number; type: WASMValueType }>,
    expectedType: WASMValueType
  ): WASMInstruction[] {
    const instructions: WASMInstruction[] = [];

    instructions.push(...this.generateExpression(expr.condition, scope, 'i32'));

    // if-then-else with result
    const blockType = expectedType === 'i32' ? 0x7F : expectedType === 'f64' ? 0x7C : 0x7F;
    instructions.push({ opcode: WASMOpcode.If, operands: [blockType] });
    instructions.push(...this.generateExpression(expr.consequent, scope, expectedType));
    instructions.push({ opcode: WASMOpcode.Else, operands: [] });
    instructions.push(...this.generateExpression(expr.alternate, scope, expectedType));
    instructions.push({ opcode: WASMOpcode.End, operands: [] });

    return instructions;
  }

  private variableNodeToGlobal(node: VariableNode): import('../runtime/wasm_types.ts').WASMGlobalDef {
    const type = this.typeToWasm(node.type);
    let init: WASMInstruction[];

    if (node.initializer && node.initializer.kind === 'literal' && node.initializer.type === 'number') {
      const value = node.initializer.value as number;
      if (type === 'i32') {
        init = [{ opcode: WASMOpcode.I32Const, operands: [Math.trunc(value)] }];
      } else if (type === 'f64') {
        init = [{ opcode: WASMOpcode.F64Const, operands: [{ f64: value }] }];
      } else {
        init = [{ opcode: WASMOpcode.I32Const, operands: [0] }];
      }
    } else {
      init = [{ opcode: WASMOpcode.I32Const, operands: [0] }];
    }

    return {
      name: node.name,
      type,
      mutable: node.mutable,
      init,
      export: false,
    };
  }

  private typeToWasm(type: string): WASMValueType {
    const typeMap: Record<string, WASMValueType> = {
      'number': 'f64',
      'i32': 'i32',
      'i64': 'i64',
      'f32': 'f32',
      'f64': 'f64',
      'int': 'i32',
      'float': 'f64',
      'bigint': 'i64',
      'boolean': 'i32',
      'bool': 'i32',
    };
    return typeMap[type.toLowerCase()] ?? 'i32';
  }
}

/**
 * Create a new WASM generator instance
 */
export function createWASMGenerator(events: EventEmitter): WASMGeneratorCore {
  return new WASMGeneratorCore(events);
}
