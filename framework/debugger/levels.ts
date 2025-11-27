/**
 * Debug Levels
 *
 * Defines debug levels and per-module filtering for granular control
 * over debugging output.
 */

/**
 * Debug verbosity levels (0 = off, 5 = most verbose)
 */
export enum DebugLevel {
  OFF = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
  TRACE = 5,
}

/**
 * Framework modules that can be individually debugged
 */
export enum DebugModule {
  ALL = '*',
  HTTP = 'http',
  ROUTER = 'router',
  MIDDLEWARE = 'middleware',
  CONTROLLER = 'controller',
  ORM = 'orm',
  AUTH = 'auth',
  CACHE = 'cache',
  VIEW = 'view',
  JOBS = 'jobs',
  SEARCH = 'search',
  PLUGIN = 'plugin',
  API = 'api',
  CONFIG = 'config',
  SECURITY = 'security',
}

/**
 * Debug level priority for comparison
 */
export const DEBUG_LEVEL_PRIORITY: Record<DebugLevel, number> = {
  [DebugLevel.OFF]: 0,
  [DebugLevel.ERROR]: 1,
  [DebugLevel.WARN]: 2,
  [DebugLevel.INFO]: 3,
  [DebugLevel.DEBUG]: 4,
  [DebugLevel.TRACE]: 5,
};

/**
 * Debug level names for display
 */
export const DEBUG_LEVEL_NAMES: Record<DebugLevel, string> = {
  [DebugLevel.OFF]: 'OFF',
  [DebugLevel.ERROR]: 'ERROR',
  [DebugLevel.WARN]: 'WARN',
  [DebugLevel.INFO]: 'INFO',
  [DebugLevel.DEBUG]: 'DEBUG',
  [DebugLevel.TRACE]: 'TRACE',
};

/**
 * Debug configuration options
 */
export interface DebugConfig {
  globalLevel: DebugLevel;
  modules: Map<DebugModule, DebugLevel>;
  includeTimestamps: boolean;
  includeStackTraces: boolean;
  maxObjectDepth: number;
  truncateStringsAt: number;
}

/**
 * Default debug configuration
 */
const DEFAULT_CONFIG: DebugConfig = {
  globalLevel: DebugLevel.DEBUG,
  modules: new Map(),
  includeTimestamps: true,
  includeStackTraces: true,
  maxObjectDepth: 3,
  truncateStringsAt: 500,
};

/**
 * Debug levels manager for granular control
 */
export class DebugLevels {
  private config: DebugConfig;

  constructor(config?: Partial<DebugConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      modules: config?.modules ?? new Map(),
    };
  }

  /**
   * Check if a log should be output for given module and level
   */
  shouldLog(module: DebugModule, level: DebugLevel): boolean {
    if (this.config.globalLevel === DebugLevel.OFF) return false;

    const effectiveLevel = this.getEffectiveLevel(module);
    return DEBUG_LEVEL_PRIORITY[level] <= DEBUG_LEVEL_PRIORITY[effectiveLevel];
  }

  /**
   * Get the effective debug level for a module
   */
  getEffectiveLevel(module: DebugModule): DebugLevel {
    // Check module-specific level first
    const moduleLevel = this.config.modules.get(module);
    if (moduleLevel !== undefined) {
      return moduleLevel;
    }

    // Check ALL module level
    const allLevel = this.config.modules.get(DebugModule.ALL);
    if (allLevel !== undefined) {
      return allLevel;
    }

    // Fall back to global level
    return this.config.globalLevel;
  }

  /**
   * Set the global debug level
   */
  setLevel(level: DebugLevel): this {
    this.config.globalLevel = level;
    return this;
  }

  /**
   * Set the debug level for a specific module
   */
  setModuleLevel(module: DebugModule, level: DebugLevel): this {
    this.config.modules.set(module, level);
    return this;
  }

  /**
   * Remove module-specific level (fall back to global)
   */
  clearModuleLevel(module: DebugModule): this {
    this.config.modules.delete(module);
    return this;
  }

  /**
   * Get the global level
   */
  getGlobalLevel(): DebugLevel {
    return this.config.globalLevel;
  }

  /**
   * Get the configuration
   */
  getConfig(): DebugConfig {
    return { ...this.config, modules: new Map(this.config.modules) };
  }

  /**
   * Update configuration options
   */
  configure(options: Partial<Omit<DebugConfig, 'modules'>>): this {
    if (options.globalLevel !== undefined) this.config.globalLevel = options.globalLevel;
    if (options.includeTimestamps !== undefined) this.config.includeTimestamps = options.includeTimestamps;
    if (options.includeStackTraces !== undefined) this.config.includeStackTraces = options.includeStackTraces;
    if (options.maxObjectDepth !== undefined) this.config.maxObjectDepth = options.maxObjectDepth;
    if (options.truncateStringsAt !== undefined) this.config.truncateStringsAt = options.truncateStringsAt;
    return this;
  }

  /**
   * Check if timestamps should be included
   */
  shouldIncludeTimestamps(): boolean {
    return this.config.includeTimestamps;
  }

  /**
   * Check if stack traces should be included
   */
  shouldIncludeStackTraces(): boolean {
    return this.config.includeStackTraces;
  }

  /**
   * Get max object depth for formatting
   */
  getMaxObjectDepth(): number {
    return this.config.maxObjectDepth;
  }

  /**
   * Get string truncation limit
   */
  getTruncateAt(): number {
    return this.config.truncateStringsAt;
  }

  // ============================================================================
  // Preset Configurations
  // ============================================================================

  /**
   * Create a preset for HTTP-only debugging
   */
  static httpOnly(): DebugLevels {
    const levels = new DebugLevels({ globalLevel: DebugLevel.OFF });
    levels.setModuleLevel(DebugModule.HTTP, DebugLevel.TRACE);
    levels.setModuleLevel(DebugModule.ROUTER, DebugLevel.DEBUG);
    levels.setModuleLevel(DebugModule.MIDDLEWARE, DebugLevel.DEBUG);
    return levels;
  }

  /**
   * Create a preset for ORM-only debugging
   */
  static ormOnly(): DebugLevels {
    const levels = new DebugLevels({ globalLevel: DebugLevel.OFF });
    levels.setModuleLevel(DebugModule.ORM, DebugLevel.TRACE);
    return levels;
  }

  /**
   * Create a preset for Auth-only debugging
   */
  static authOnly(): DebugLevels {
    const levels = new DebugLevels({ globalLevel: DebugLevel.OFF });
    levels.setModuleLevel(DebugModule.AUTH, DebugLevel.TRACE);
    return levels;
  }

  /**
   * Create a preset focused on performance (timing info)
   */
  static performance(): DebugLevels {
    const levels = new DebugLevels({ globalLevel: DebugLevel.INFO });
    levels.configure({ includeStackTraces: false });
    return levels;
  }

  /**
   * Create a preset for errors only
   */
  static errors(): DebugLevels {
    return new DebugLevels({ globalLevel: DebugLevel.ERROR });
  }

  /**
   * Create a preset for full debugging (all modules, trace level)
   */
  static all(): DebugLevels {
    return new DebugLevels({ globalLevel: DebugLevel.TRACE });
  }
}

/**
 * Check if a level is enabled given current and target levels
 */
export function isLevelEnabled(currentLevel: DebugLevel, targetLevel: DebugLevel): boolean {
  return DEBUG_LEVEL_PRIORITY[targetLevel] <= DEBUG_LEVEL_PRIORITY[currentLevel];
}

/**
 * Parse a debug level from string
 */
export function parseDebugLevel(value: string): DebugLevel {
  const upper = value.toUpperCase();
  switch (upper) {
    case 'OFF':
      return DebugLevel.OFF;
    case 'ERROR':
      return DebugLevel.ERROR;
    case 'WARN':
      return DebugLevel.WARN;
    case 'INFO':
      return DebugLevel.INFO;
    case 'DEBUG':
      return DebugLevel.DEBUG;
    case 'TRACE':
      return DebugLevel.TRACE;
    default:
      return DebugLevel.DEBUG;
  }
}

/**
 * Parse a debug module from string
 */
export function parseDebugModule(value: string): DebugModule {
  const lower = value.toLowerCase();
  const moduleValues = Object.values(DebugModule);
  if (moduleValues.includes(lower as DebugModule)) {
    return lower as DebugModule;
  }
  return DebugModule.ALL;
}
