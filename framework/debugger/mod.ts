/**
 * Debugger Module
 *
 * Comprehensive debugging system for the Echelon framework.
 * Provides per-module debug levels, rich console output,
 * conditional breakpoints, request lifecycle reports,
 * and automatic framework integration.
 *
 * @example
 * ```ts
 * import { getDebugger, DebugLevel, DebugModule } from '@echelon/debugger';
 *
 * // Get the default debugger
 * const debug = getDebugger();
 *
 * // Configure debug levels
 * debug.setLevel(DebugLevel.DEBUG);
 * debug.setModuleLevel(DebugModule.ORM, DebugLevel.TRACE);
 *
 * // Log messages
 * debug.info(DebugModule.HTTP, 'Server starting on port 3000');
 * debug.debug(DebugModule.ROUTER, 'Route matched', { pattern: '/users/:id' });
 *
 * // Use presets
 * debug.httpOnly();  // Only HTTP, Router, Middleware
 * debug.ormOnly();   // Only ORM queries
 * debug.all();       // Everything at TRACE level
 * ```
 *
 * @example
 * ```ts
 * import { attachDebugger } from '@echelon/debugger';
 *
 * // Attach to application
 * const app = new Application();
 * attachDebugger(app.getEvents());
 * ```
 *
 * @module
 */

// ============================================================================
// Levels - Debug level enum and manager
// ============================================================================

export {
  DebugLevel,
  DebugModule,
  DEBUG_LEVEL_PRIORITY,
  DEBUG_LEVEL_NAMES,
  DebugLevels,
  isLevelEnabled,
  parseDebugLevel,
  parseDebugModule,
} from './levels.ts';

export type { DebugConfig } from './levels.ts';

// ============================================================================
// Output - Rich colored console output
// ============================================================================

export {
  Colors,
  Icons,
  colorize,
  getLevelColor,
  getLevelIcon,
  getModuleColor,
  getModuleIcon,
  DebugOutput,
  getDebugOutput,
  createDebugOutput,
} from './output.ts';

export type { OutputOptions, TimingEntry } from './output.ts';

// ============================================================================
// Debugger - Core debugger class
// ============================================================================

export {
  Debugger,
  getDebugger,
  createDebugger,
  debugLog,
  debugError,
} from './debugger.ts';

export type {
  DebugEventType,
  DebugEvent,
  DebugListener,
  DebugRequestContext,
  DebuggerOptions,
} from './debugger.ts';

// ============================================================================
// Breakpoint - Conditional breakpoints
// ============================================================================

export {
  BreakpointManager,
  getBreakpointManager,
  createBreakpointManager,
} from './breakpoint.ts';

export type {
  BreakpointConditionFn,
  BreakpointContext,
  BreakpointConfig,
  BreakpointAction,
  BreakpointCallbackContext,
  BreakpointCallback,
} from './breakpoint.ts';

// ============================================================================
// Report - Request lifecycle reports
// ============================================================================

export {
  ReportGenerator,
  getReportGenerator,
  createReportGenerator,
} from './report.ts';

export type {
  RequestReport,
  RequestSummary,
  PerformanceReport,
  ModulePerformance,
} from './report.ts';

// ============================================================================
// Attach - Application integration
// ============================================================================

export {
  DebugAttachment,
  getDebugAttachment,
  createDebugAttachment,
  attachDebugger,
} from './attach.ts';

export type {
  DebugContext,
  DebugEventEmitter,
  DebugMiddleware,
  AttachOptions,
} from './attach.ts';
