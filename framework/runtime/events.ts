/**
 * Runtime Events
 *
 * Event types and payloads emitted by the runtime layer.
 * These events provide observability into runtime operations.
 */

import type { PermissionDescriptor } from './permissions.ts';

// ============================================================================
// Event Constants
// ============================================================================

/**
 * Runtime event type constants
 */
export const RuntimeEvents = {
  // GC Events (simulated via memory monitoring)
  GC_START: 'runtime:gc:start',
  GC_END: 'runtime:gc:end',

  // Module Events
  MODULE_LOAD: 'runtime:module:load',
  MODULE_UNLOAD: 'runtime:module:unload',

  // Permission Events
  PERMISSION_CHECK: 'runtime:permission:check',
  PERMISSION_DENIED: 'runtime:permission:denied',
  PERMISSION_GRANTED: 'runtime:permission:granted',

  // Worker Events
  WORKER_SPAWN: 'runtime:worker:spawn',
  WORKER_TERMINATE: 'runtime:worker:terminate',
  WORKER_TASK_START: 'runtime:worker:task:start',
  WORKER_TASK_COMPLETE: 'runtime:worker:task:complete',
  WORKER_TASK_ERROR: 'runtime:worker:task:error',

  // Signal Events
  SIGNAL_RECEIVED: 'runtime:signal:received',
  CONFIG_RELOAD: 'runtime:config:reload',
  DEBUG_DUMP: 'runtime:debug:dump',

  // Startup Events
  STARTUP_PHASE_START: 'runtime:startup:phase:start',
  STARTUP_PHASE_END: 'runtime:startup:phase:end',
  STARTUP_COMPLETE: 'runtime:startup:complete',

  // Lifecycle Events
  RESTART_REQUESTED: 'runtime:restart:requested',
  RESTART_COMPLETE: 'runtime:restart:complete',

  // Metrics Events
  METRICS_COLLECTED: 'runtime:metrics:collected',
  MEMORY_WARNING: 'runtime:memory:warning',
} as const;

export type RuntimeEventType = typeof RuntimeEvents[keyof typeof RuntimeEvents];

// ============================================================================
// Event Payload Types
// ============================================================================

/**
 * GC event payload
 */
export interface GCEventPayload {
  type: 'minor' | 'major';
  heapBefore?: number;
  heapAfter?: number;
  duration?: number;
  timestamp: Date;
}

/**
 * Module load event payload
 */
export interface ModuleLoadEventPayload {
  moduleId: string;
  path?: string;
  duration: number;
  timestamp: Date;
}

/**
 * Permission check event payload
 */
export interface PermissionCheckEventPayload {
  permission: PermissionDescriptor;
  result: Deno.PermissionState;
  duration: number;
  timestamp: Date;
}

/**
 * Worker spawn event payload
 */
export interface WorkerSpawnEventPayload {
  workerId: string;
  scriptUrl?: string;
  totalWorkers: number;
  timestamp: Date;
}

/**
 * Worker terminate event payload
 */
export interface WorkerTerminateEventPayload {
  workerId: string;
  reason: string;
  tasksCompleted: number;
  timestamp: Date;
}

/**
 * Worker task event payload
 */
export interface WorkerTaskEventPayload {
  taskId: string;
  workerId: string;
  type: string;
  duration?: number;
  error?: Error;
  timestamp: Date;
}

/**
 * Signal received event payload
 */
export interface SignalEventPayload {
  signal: string;
  timestamp: Date;
}

/**
 * Startup phase type
 */
export type StartupPhase =
  | 'init'
  | 'config'
  | 'permissions'
  | 'database'
  | 'wasm'
  | 'plugins'
  | 'routes'
  | 'middleware'
  | 'server'
  | 'ready';

/**
 * Startup phase event payload
 */
export interface StartupPhaseEventPayload {
  phase: StartupPhase;
  duration?: number;
  success: boolean;
  error?: Error;
  timestamp: Date;
}

/**
 * Startup complete event payload
 */
export interface StartupCompleteEventPayload {
  totalDuration: number;
  phases: Array<{
    phase: StartupPhase;
    duration: number;
    success: boolean;
  }>;
  timestamp: Date;
}

/**
 * Restart event payload
 */
export interface RestartEventPayload {
  reason?: string;
  timestamp: Date;
}

/**
 * Debug dump event payload
 */
export interface DebugDumpEventPayload {
  memory: Deno.MemoryUsage;
  cpuUsage: { user: number; system: number; percentage: number };
  eventLoopLag: number;
  workerPool: {
    activeWorkers: number;
    queuedTasks: number;
    completedTasks: number;
  };
  uptime: number;
  timestamp: Date;
}

/**
 * Memory warning event payload
 */
export interface MemoryWarningEventPayload {
  heapUsed: number;
  heapLimit: number;
  percentUsed: number;
  threshold: number;
  timestamp: Date;
}

// ============================================================================
// Event Payload Union Type
// ============================================================================

export type RuntimeEventPayload =
  | GCEventPayload
  | ModuleLoadEventPayload
  | PermissionCheckEventPayload
  | WorkerSpawnEventPayload
  | WorkerTerminateEventPayload
  | WorkerTaskEventPayload
  | SignalEventPayload
  | StartupPhaseEventPayload
  | StartupCompleteEventPayload
  | RestartEventPayload
  | DebugDumpEventPayload
  | MemoryWarningEventPayload;
