/**
 * Layer 12: Plugin/Extension Architecture
 *
 * Enable third-party code to extend core functionality.
 *
 * Responsibilities:
 * - Enable extensibility without modifying core
 * - Provide stable APIs and hooks
 * - Support plugin ecosystem
 * - Manage dependencies and versions
 * - Ensure security and sandboxing
 * - WASM code generation
 */

export { PluginManager, type Plugin, type PluginContext } from './plugin.ts';
export { EventEmitter, type EventHandler } from './events.ts';

// WASM Generator exports
export {
  WASMGeneratorCore,
  createWASMGenerator,
  type WASMGenerationResult,
} from './wasm_generator.ts';

export {
  WASMCompiler,
  type WATCompilerOptions,
  type BuildConfig,
  type BuildResult,
} from './wasm_compiler.ts';

export {
  WASMCodegen,
  WASMModuleBuilder,
} from './wasm_codegen.ts';

export {
  WASMOptimizer,
  type OptimizationStats,
} from './wasm_optimizer.ts';

// WASM Generator Types
export type {
  WASMGeneratorSource,
  WASMGeneratorOptions,
  WASMCompilationResult,
  WASMCompilationError,
  WASMCompilationWarning,
  WASMCompilationStats,
  WASMSourceMap,
  WASMOptimizationLevel,
  WASMTemplate,
  WASMTemplateParameter,
  WASMModuleDef,
  WASMFunctionDef,
  WASMGlobalDef,
  WASMImportDef,
  WASMExportDef,
  WASMInstruction,
  WASMTableConfig,
} from '../runtime/wasm_types.ts';
