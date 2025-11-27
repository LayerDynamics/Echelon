/**
 * Environment Detection and Runtime Information
 *
 * Provides utilities for detecting the current runtime environment
 * and available features.
 */

export interface EnvironmentInfo {
  mode: 'development' | 'production' | 'test';
  isDenoDeploy: boolean;
  isDocker: boolean;
  isDevelopment: boolean;
  isProduction: boolean;
  isTest: boolean;
  hostname: string;
  pid: number;
}

export interface RuntimeInfo {
  denoVersion: string;
  v8Version: string;
  typescriptVersion: string;
  os: string;
  arch: string;
}

export interface FeatureFlags {
  // Core Deno features
  kv: boolean;
  cron: boolean;
  ffi: boolean;
  websocket: boolean;

  // Runtime features
  workers: boolean;
  wasm: boolean;
  signals: boolean;
  signalsExtended: boolean; // SIGUSR1/SIGUSR2 support

  // Legacy aliases (deprecated)
  /** @deprecated Use `kv` instead */
  hasKV: boolean;
  /** @deprecated Use `cron` instead */
  hasCron: boolean;
  /** @deprecated Use `ffi` instead */
  hasFFI: boolean;
}

/**
 * Environment detection and information
 */
export class Environment {
  private static _instance: Environment;
  private _info: EnvironmentInfo;
  private _runtime: RuntimeInfo;
  private _features: FeatureFlags;

  private constructor() {
    this._info = this.detectEnvironment();
    this._runtime = this.detectRuntime();
    this._features = this.detectFeatures();
  }

  /**
   * Get the singleton instance
   */
  static get instance(): Environment {
    if (!Environment._instance) {
      Environment._instance = new Environment();
    }
    return Environment._instance;
  }

  /**
   * Get environment information
   */
  get info(): EnvironmentInfo {
    return this._info;
  }

  /**
   * Get runtime information
   */
  get runtime(): RuntimeInfo {
    return this._runtime;
  }

  /**
   * Get available features
   */
  get features(): FeatureFlags {
    return this._features;
  }

  /**
   * Get an environment variable with optional default
   */
  static get(key: string, defaultValue?: string): string | undefined {
    return Deno.env.get(key) ?? defaultValue;
  }

  /**
   * Get a required environment variable (throws if not set)
   */
  static require(key: string): string {
    const value = Deno.env.get(key);
    if (value === undefined) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return value;
  }

  /**
   * Set an environment variable
   */
  static set(key: string, value: string): void {
    Deno.env.set(key, value);
  }

  /**
   * Get all environment variables as an object
   */
  static all(): Record<string, string> {
    return Deno.env.toObject();
  }

  /**
   * Check if running in development mode
   */
  static isDevelopment(): boolean {
    return Environment.instance.info.isDevelopment;
  }

  /**
   * Check if running in production mode
   */
  static isProduction(): boolean {
    return Environment.instance.info.isProduction;
  }

  /**
   * Check if running in test mode
   */
  static isTest(): boolean {
    return Environment.instance.info.isTest;
  }

  /**
   * Detect current environment
   */
  private detectEnvironment(): EnvironmentInfo {
    const denoEnv = Deno.env.get('DENO_ENV') ?? 'development';
    const isDenoDeploy = Deno.env.get('DENO_DEPLOYMENT_ID') !== undefined;
    const isDocker = Deno.env.get('DOCKER') === 'true';

    return {
      mode: denoEnv as 'development' | 'production' | 'test',
      isDenoDeploy,
      isDocker,
      isDevelopment: denoEnv === 'development',
      isProduction: denoEnv === 'production',
      isTest: denoEnv === 'test',
      hostname: Deno.hostname(),
      pid: Deno.pid,
    };
  }

  /**
   * Detect runtime information
   */
  private detectRuntime(): RuntimeInfo {
    return {
      denoVersion: Deno.version.deno,
      v8Version: Deno.version.v8,
      typescriptVersion: Deno.version.typescript,
      os: Deno.build.os,
      arch: Deno.build.arch,
    };
  }

  /**
   * Detect available features
   */
  private detectFeatures(): FeatureFlags {
    const hasKV = typeof Deno.openKv === 'function';
    const hasCron = typeof (Deno as unknown as { cron?: unknown }).cron === 'function';
    const hasFFI = typeof Deno.dlopen === 'function';
    const hasWebSocket = typeof WebSocket !== 'undefined';
    const hasWorkers = typeof Worker !== 'undefined';
    const hasWasm = typeof WebAssembly !== 'undefined';
    const hasSignals = typeof Deno.addSignalListener === 'function';
    // SIGUSR1/SIGUSR2 not available on Windows
    const hasSignalsExtended = hasSignals && Deno.build.os !== 'windows';

    return {
      // New feature flags
      kv: hasKV,
      cron: hasCron,
      ffi: hasFFI,
      websocket: hasWebSocket,
      workers: hasWorkers,
      wasm: hasWasm,
      signals: hasSignals,
      signalsExtended: hasSignalsExtended,

      // Legacy aliases for backward compatibility
      hasKV,
      hasCron,
      hasFFI,
    };
  }
}
