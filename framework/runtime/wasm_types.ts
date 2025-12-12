/**
 * WASM Type Definitions
 *
 * Shared types for the WASM runtime and generator subsystems.
 */

// ============================================================================
// Core WASM Types
// ============================================================================

/**
 * WASM value types
 */
export type WASMValueType = 'i32' | 'i64' | 'f32' | 'f64' | 'v128' | 'funcref' | 'externref';

/**
 * WASM source types for module loading
 *
 * - 'file': Load from local filesystem
 * - 'url': Load from HTTP/HTTPS URL
 * - 'bytes': Load from raw Uint8Array
 * - 'base64': Load from base64-encoded string
 * - 'native': Load via Deno 2.1+ native import (dynamic import)
 */
export type WASMSourceType = 'file' | 'url' | 'bytes' | 'base64' | 'native';

/**
 * WASM source descriptor
 */
export interface WASMSource {
  type: WASMSourceType;
  value: string | Uint8Array;
  moduleId?: string;
}

/**
 * WASM module metadata
 */
export interface WASMModuleInfo {
  id: string;
  name?: string;
  source: WASMSourceType;
  sourcePath?: string;
  size: number;
  exports: WASMExportInfo[];
  imports: WASMImportInfo[];
  loadedAt: Date;
  lastExecuted?: Date;
  executionCount: number;
}

/**
 * WASM export information
 */
export interface WASMExportInfo {
  name: string;
  kind: 'function' | 'table' | 'memory' | 'global';
  signature?: WASMFunctionSignature;
}

/**
 * WASM import information
 */
export interface WASMImportInfo {
  module: string;
  name: string;
  kind: 'function' | 'table' | 'memory' | 'global';
  signature?: WASMFunctionSignature;
}

/**
 * WASM function signature
 */
export interface WASMFunctionSignature {
  params: WASMValueType[];
  results: WASMValueType[];
}

// ============================================================================
// WASM Module Types
// ============================================================================

/**
 * Loaded WASM module wrapper
 */
export interface WASMModule {
  id: string;
  info: WASMModuleInfo;
  compiledModule: WebAssembly.Module;
  instance?: WebAssembly.Instance;
  memory?: WebAssembly.Memory;
  sandbox?: string;
}

/**
 * WASM instantiation options
 */
export interface WASMInstantiationOptions {
  imports?: WebAssembly.Imports;
  memory?: WebAssembly.Memory;
  table?: WebAssembly.Table;
  sandboxId?: string;
  timeout?: number;
  enableWASI?: boolean;
  wasiOptions?: {
    args?: string[];
    env?: Record<string, string>;
    preopenedDirectories?: Map<string, string>;
    allowRead?: boolean;
    allowWrite?: boolean;
  };
}

// ============================================================================
// Execution Types
// ============================================================================

/**
 * Execution result wrapper
 */
export interface WASMExecutionResult<T = unknown> {
  success: boolean;
  value?: T;
  error?: Error;
  duration: number;
  gasUsed?: number;
  memoryUsed: number;
}

/**
 * Execution options
 */
export interface WASMExecutionOptions {
  timeout?: number;
  gasLimit?: number;
  memoryLimit?: number;
  sandboxId?: string;
}

/**
 * Host function type
 */
// deno-lint-ignore no-explicit-any
export type WASMHostFunction = (...args: any[]) => any;

/**
 * Host function descriptor
 */
export interface WASMHostFunctionDescriptor {
  name: string;
  module: string;
  func: WASMHostFunction;
  signature: WASMFunctionSignature;
  async?: boolean;
}

// ============================================================================
// Memory Types
// ============================================================================

/**
 * Memory configuration
 */
export interface WASMMemoryConfig {
  initial: number;  // Initial pages (64KB each)
  maximum?: number; // Maximum pages
  shared?: boolean; // Shared memory for threading
}

/**
 * Memory statistics
 */
export interface WASMMemoryStats {
  allocated: number;    // Bytes allocated
  used: number;         // Bytes in use
  available: number;    // Bytes available
  pageCount: number;    // Number of pages
  maxPages?: number;    // Maximum pages allowed
  moduleStats?: Map<string, WASMModuleMemoryStats>;
}

/**
 * Per-module memory statistics
 */
export interface WASMModuleMemoryStats {
  moduleId: string;
  allocated: number;
  used: number;
  peakUsage: number;
  allocations: number;
  frees: number;
}

// ============================================================================
// Sandbox Types
// ============================================================================

/**
 * WASM capabilities that can be granted/denied
 */
export type WASMCapability =
  | 'memory'          // Access to shared memory
  | 'threads'         // Multi-threading (SharedArrayBuffer)
  | 'simd'            // SIMD instructions
  | 'bulk-memory'     // Bulk memory operations
  | 'reference-types' // Reference types
  | 'tail-call'       // Tail call optimization
  | 'exception-handling' // Exception handling
  | 'host-functions'  // Call host functions
  | 'file-read'       // Read file system (via host)
  | 'file-write'      // Write file system (via host)
  | 'network'         // Network access (via host)
  | 'env'             // Environment variables (via host)
  | 'kv-read'         // Read from Deno KV (via host)
  | 'kv-write'        // Write to Deno KV (via host)
  | 'crypto'          // Crypto operations (via host)
  | 'console';        // Console logging (via host)

/**
 * Default capabilities (restrictive)
 */
export const DEFAULT_WASM_CAPABILITIES: WASMCapability[] = [
  'memory',
  'bulk-memory',
  'console',
];

/**
 * CPU limit configuration
 */
export interface WASMCPULimit {
  maxInstructions?: number; // Max instructions per execution
  maxCallDepth?: number;    // Max call stack depth
  interruptInterval?: number; // Check interval for timeouts
}

/**
 * Sandbox configuration
 */
export interface WASMSandboxConfig {
  id?: string;
  memoryLimit: number;            // Max memory in bytes
  cpuLimit?: WASMCPULimit;
  timeLimit?: number;             // Max execution time in ms
  capabilities: WASMCapability[];
  allowedHostFunctions?: string[];
  deniedHostFunctions?: string[];
}

/**
 * Sandbox instance
 */
export interface WASMSandbox {
  id: string;
  config: WASMSandboxConfig;
  modules: Set<string>;
  memory?: WebAssembly.Memory;
  createdAt: Date;
  lastActivity?: Date;
  executionCount: number;
  totalExecutionTime: number;
}

/**
 * Sandbox violation event
 */
export interface WASMSandboxViolation {
  sandboxId: string;
  moduleId?: string;
  type: 'memory' | 'time' | 'cpu' | 'capability';
  message: string;
  timestamp: Date;
}

// ============================================================================
// Generator Types
// ============================================================================

/**
 * Generator source types
 */
export type WASMGeneratorSourceType = 'typescript' | 'rust' | 'wat' | 'template';

/**
 * Generator source descriptor
 */
export interface WASMGeneratorSource {
  type: WASMGeneratorSourceType;
  code: string;
  options?: WASMGeneratorOptions;
}

/**
 * Generator options
 */
export interface WASMGeneratorOptions {
  optimize?: boolean;
  optimizationLevel?: WASMOptimizationLevel;
  debug?: boolean;
  sourceMap?: boolean;
  validate?: boolean;
  memoryConfig?: WASMMemoryConfig;
}

/**
 * Optimization levels
 */
export type WASMOptimizationLevel = 'none' | 'size' | 'speed' | 'aggressive';

/**
 * Compilation result
 */
export interface WASMCompilationResult {
  success: boolean;
  wasm?: Uint8Array;
  sourceMap?: WASMSourceMap;
  errors?: WASMCompilationError[];
  warnings?: WASMCompilationWarning[];
  stats?: WASMCompilationStats;
}

/**
 * Compilation error
 */
export interface WASMCompilationError {
  message: string;
  line?: number;
  column?: number;
  source?: string;
}

/**
 * Compilation warning
 */
export interface WASMCompilationWarning {
  message: string;
  line?: number;
  column?: number;
  source?: string;
}

/**
 * Compilation statistics
 */
export interface WASMCompilationStats {
  sourceSize: number;
  outputSize: number;
  compilationTime: number;
  optimizationTime?: number;
  functionCount: number;
  exportCount: number;
}

/**
 * Source map for debugging
 */
export interface WASMSourceMap {
  version: number;
  file: string;
  sources: string[];
  sourcesContent?: string[];
  names: string[];
  mappings: string;
}

// ============================================================================
// Codegen Types
// ============================================================================

/**
 * WASM instruction opcodes (subset)
 */
export enum WASMOpcode {
  // Control
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

  // Parametric
  Drop = 0x1A,
  Select = 0x1B,

  // Variable
  LocalGet = 0x20,
  LocalSet = 0x21,
  LocalTee = 0x22,
  GlobalGet = 0x23,
  GlobalSet = 0x24,

  // Memory
  I32Load = 0x28,
  I64Load = 0x29,
  F32Load = 0x2A,
  F64Load = 0x2B,
  I32Store = 0x36,
  I64Store = 0x37,
  F32Store = 0x38,
  F64Store = 0x39,
  MemorySize = 0x3F,
  MemoryGrow = 0x40,

  // Numeric - i32
  I32Const = 0x41,
  I32Eqz = 0x45,
  I32Eq = 0x46,
  I32Ne = 0x47,
  I32LtS = 0x48,
  I32LtU = 0x49,
  I32GtS = 0x4A,
  I32GtU = 0x4B,
  I32LeS = 0x4C,
  I32LeU = 0x4D,
  I32GeS = 0x4E,
  I32GeU = 0x4F,
  I32Add = 0x6A,
  I32Sub = 0x6B,
  I32Mul = 0x6C,
  I32DivS = 0x6D,
  I32DivU = 0x6E,
  I32RemS = 0x6F,
  I32RemU = 0x70,
  I32And = 0x71,
  I32Or = 0x72,
  I32Xor = 0x73,
  I32Shl = 0x74,
  I32ShrS = 0x75,
  I32ShrU = 0x76,

  // Numeric - i64
  I64Const = 0x42,
  I64Add = 0x7C,
  I64Sub = 0x7D,
  I64Mul = 0x7E,

  // Numeric - f32
  F32Const = 0x43,
  F32Add = 0x92,
  F32Sub = 0x93,
  F32Mul = 0x94,
  F32Div = 0x95,

  // Numeric - f64
  F64Const = 0x44,
  F64Add = 0xA0,
  F64Sub = 0xA1,
  F64Mul = 0xA2,
  F64Div = 0xA3,
}

/**
 * WASM instruction
 */
export interface WASMInstruction {
  opcode: WASMOpcode;
  operands: unknown[];
}

/**
 * WASM function definition
 */
export interface WASMFunctionDef {
  name?: string;
  signature: WASMFunctionSignature;
  locals: WASMValueType[];
  body: WASMInstruction[];
  export?: boolean;
}

/**
 * WASM global definition
 */
export interface WASMGlobalDef {
  name?: string;
  type: WASMValueType;
  mutable: boolean;
  init: WASMInstruction[];
  export?: boolean;
}

/**
 * WASM module definition for codegen
 */
export interface WASMModuleDef {
  functions: WASMFunctionDef[];
  globals: WASMGlobalDef[];
  memory?: WASMMemoryConfig;
  tables?: WASMTableConfig[];
  imports: WASMImportDef[];
  exports: WASMExportDef[];
  start?: number; // Start function index
}

/**
 * WASM table configuration
 */
export interface WASMTableConfig {
  elementType: 'funcref' | 'externref';
  initial: number;
  maximum?: number;
}

/**
 * WASM import definition
 */
export interface WASMImportDef {
  module: string;
  name: string;
  kind: 'function' | 'table' | 'memory' | 'global';
  type: WASMFunctionSignature | WASMTableConfig | WASMMemoryConfig | { type: WASMValueType; mutable: boolean };
}

/**
 * WASM export definition
 */
export interface WASMExportDef {
  name: string;
  kind: 'function' | 'table' | 'memory' | 'global';
  index: number;
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Validation result
 */
export interface WASMValidationResult {
  valid: boolean;
  errors: WASMValidationError[];
  warnings: WASMValidationWarning[];
}

/**
 * Validation error
 */
export interface WASMValidationError {
  code: string;
  message: string;
  offset?: number;
}

/**
 * Validation warning
 */
export interface WASMValidationWarning {
  code: string;
  message: string;
  offset?: number;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * WASM event types
 */
export const WASMEvents = {
  // Runtime events
  RUNTIME_INIT: 'wasm:runtime:init',
  RUNTIME_READY: 'wasm:runtime:ready',
  RUNTIME_SHUTDOWN: 'wasm:runtime:shutdown',
  RUNTIME_ERROR: 'wasm:runtime:error',

  // Module events
  MODULE_LOADING: 'wasm:module:loading',
  MODULE_LOADED: 'wasm:module:loaded',
  MODULE_INSTANTIATED: 'wasm:module:instantiated',
  MODULE_UNLOADED: 'wasm:module:unloaded',
  MODULE_ERROR: 'wasm:module:error',

  // Execution events
  EXEC_START: 'wasm:exec:start',
  EXEC_COMPLETE: 'wasm:exec:complete',
  EXEC_ERROR: 'wasm:exec:error',
  EXEC_TIMEOUT: 'wasm:exec:timeout',

  // Generator events
  GEN_START: 'wasm:gen:start',
  GEN_COMPLETE: 'wasm:gen:complete',
  GEN_ERROR: 'wasm:gen:error',

  // Sandbox events
  SANDBOX_CREATED: 'wasm:sandbox:created',
  SANDBOX_DESTROYED: 'wasm:sandbox:destroyed',
  SANDBOX_VIOLATION: 'wasm:sandbox:violation',

  // Memory events
  MEMORY_ALLOCATED: 'wasm:memory:allocated',
  MEMORY_LIMIT_REACHED: 'wasm:memory:limit',
  MEMORY_FREED: 'wasm:memory:freed',
} as const;

export type WASMEventType = typeof WASMEvents[keyof typeof WASMEvents];

// ============================================================================
// Template Types
// ============================================================================

/**
 * WASM template definition
 */
export interface WASMTemplate {
  name: string;
  description?: string;
  parameters: WASMTemplateParameter[];
  generate: (params: Record<string, unknown>) => WASMModuleDef;
}

/**
 * Template parameter definition
 */
export interface WASMTemplateParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  required?: boolean;
  default?: unknown;
  description?: string;
}
