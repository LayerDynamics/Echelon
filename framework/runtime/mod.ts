/**
 * Layer 0: Runtime & Execution Environment
 *
 * The foundational runtime upon which the entire Echelon stack is built.
 * Represents the bridge between the operating system and application code.
 *
 * This layer defines:
 * - What executes our code (Deno/V8)
 * - How code is loaded and run (ES Modules, TypeScript)
 * - Memory and resource management (V8 GC)
 * - Concurrency model (Event loop, async/await)
 * - Security boundaries (Permission system)
 * - Process lifecycle (Startup, shutdown, signals)
 * - WebAssembly execution (WASM Runtime)
 */

export {
  checkPermissions,
  requestPermission,
  queryPermission,
  type PermissionDescriptor,
} from './permissions.ts';

// Aliases for compatibility
export { checkPermissions as checkPermission } from './permissions.ts';
export { requestPermission as requirePermission } from './permissions.ts';

// PermissionManager class for compatibility
export class PermissionManager {
  static async check(permissions: PermissionDescriptor[]): Promise<void> {
    const { checkPermissions } = await import('./permissions.ts');
    return checkPermissions(permissions);
  }

  static async request(permission: PermissionDescriptor): Promise<boolean> {
    const { requestPermission } = await import('./permissions.ts');
    return requestPermission(permission);
  }

  static async query(permission: PermissionDescriptor): Promise<Deno.PermissionState> {
    const { queryPermission } = await import('./permissions.ts');
    return queryPermission(permission);
  }
}

import type { PermissionDescriptor } from './permissions.ts';
export {
  Lifecycle,
  type LifecycleHook,
  type ConfigReloadHook,
  type LifecycleEvents,
  type LifecycleOptions,
} from './lifecycle.ts';
export {
  Environment,
  type EnvironmentInfo,
  type RuntimeInfo,
  type FeatureFlags,
} from './environment.ts';
export {
  Runtime,
  getRuntime,
  RuntimeEvents,
  type EchelonRuntime,
  type CpuUsage,
  type CreateWorkerOptions,
  type StartupReport,
  type StartupPhase,
  type RuntimeMetricsSnapshot,
  type CpuUsageInfo,
  type PoolStats,
} from './runtime.ts';

// Runtime Events
export {
  RuntimeEvents as RuntimeEventTypes,
  type RuntimeEventPayload,
  type StartupPhaseEventPayload,
  type StartupCompleteEventPayload,
  type MemoryWarningEventPayload,
  type WorkerSpawnEventPayload,
  type WorkerTerminateEventPayload,
  type SignalEventPayload,
  type DebugDumpEventPayload,
} from './events.ts';

// Startup Tracking
export {
  StartupTracker,
  getStartupTracker,
  resetStartupTracker,
  type PhaseInfo,
  type PhaseEventListener,
  type CompleteEventListener,
} from './startup_tracker.ts';

// Runtime Metrics
export {
  RuntimeMetricsCollector,
  getRuntimeMetrics,
  resetRuntimeMetrics,
  type RuntimeMetricsConfig,
  type MemorySnapshot,
  type MetricsEventListener,
} from './runtime_metrics.ts';

// Signal Handling
export {
  SignalHandlerManager,
  getSignalHandler,
  resetSignalHandler,
  type HandledSignal,
  type SignalHandler,
  type ConfigReloadHandler,
  type DebugDumpHandler,
  type SignalHandlerConfig,
} from './signals.ts';

// Worker Pool
export {
  WorkerPool,
  getWorkerPool,
  resetWorkerPool,
  type WorkerTask,
  type WorkerPoolConfig,
  type WorkerState,
  type TaskResult,
  type WorkerEventListener,
} from './worker_pool.ts';

// WASM Runtime exports
export {
  WASMRuntimeCore,
  createWASMRuntime,
  type WASMRuntimeConfig,
} from './wasm_runtime.ts';

export {
  WASMModuleLoader,
  type WASMLoaderOptions,
} from './wasm_module_loader.ts';

export {
  WASMExecutor,
  TimeoutError,
  type ImportConfig,
} from './wasm_executor.ts';

export { WASMMemoryManager } from './wasm_memory.ts';

export { WASMSandboxManager } from './wasm_sandbox.ts';

// WASM Types
export type {
  WASMValueType,
  WASMSourceType,
  WASMSource,
  WASMModule,
  WASMModuleInfo,
  WASMExportInfo,
  WASMImportInfo,
  WASMFunctionSignature,
  WASMInstantiationOptions,
  WASMExecutionResult,
  WASMExecutionOptions,
  WASMHostFunction,
  WASMHostFunctionDescriptor,
  WASMMemoryConfig,
  WASMMemoryStats,
  WASMModuleMemoryStats,
  WASMCapability,
  WASMCPULimit,
  WASMSandbox,
  WASMSandboxConfig,
  WASMSandboxViolation,
  WASMValidationResult,
  WASMEventType,
} from './wasm_types.ts';

export {
  WASMEvents,
  WASMOpcode,
  DEFAULT_WASM_CAPABILITIES,
} from './wasm_types.ts';
