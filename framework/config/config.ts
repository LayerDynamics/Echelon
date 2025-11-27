/**
 * Configuration Management
 *
 * Loads and manages application configuration from multiple sources.
 */

import { Environment } from '../runtime/environment.ts';

export interface ConfigOptions {
  port?: number;
  host?: string;
  env?: string;
  debug?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  database?: {
    path?: string;
  };
  session?: {
    secret?: string;
    maxAge?: number;
  };
  cors?: {
    origins?: string[];
    credentials?: boolean;
  };
  [key: string]: unknown;
}

const DEFAULT_CONFIG: ConfigOptions = {
  port: 8000,
  host: '0.0.0.0',
  env: 'development',
  debug: false,
  logLevel: 'info',
  database: {
    path: undefined, // Use default Deno KV path
  },
  session: {
    maxAge: 86400 * 7, // 7 days
  },
  cors: {
    origins: ['*'],
    credentials: false,
  },
};

/**
 * Configuration manager
 */
export class Config {
  private config: ConfigOptions;

  constructor(options: ConfigOptions = {}) {
    this.config = this.mergeConfig(DEFAULT_CONFIG, options);
  }

  /**
   * Get a configuration value
   */
  get<T>(key: string, defaultValue?: T): T {
    const value = this.getNestedValue(this.config, key);
    return (value ?? defaultValue) as T;
  }

  /**
   * Set a configuration value
   */
  set(key: string, value: unknown): void {
    this.setNestedValue(this.config, key, value);
  }

  /**
   * Check if a configuration key exists
   */
  has(key: string): boolean {
    return this.getNestedValue(this.config, key) !== undefined;
  }

  /**
   * Get all configuration
   */
  all(): ConfigOptions {
    return { ...this.config };
  }

  /**
   * Get environment-specific configuration
   */
  forEnv(env: string): ConfigOptions {
    const envConfig = this.config[env] as ConfigOptions | undefined;
    if (envConfig) {
      return this.mergeConfig(this.config, envConfig);
    }
    return this.config;
  }

  /**
   * Merge configurations
   */
  private mergeConfig(base: ConfigOptions, override: ConfigOptions): ConfigOptions {
    const result = { ...base };

    for (const [key, value] of Object.entries(override)) {
      if (value !== undefined) {
        if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
          result[key] = this.mergeConfig(
            (base[key] as ConfigOptions) ?? {},
            value as ConfigOptions
          );
        } else {
          result[key] = value;
        }
      }
    }

    return result;
  }

  /**
   * Get nested value by path
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current, key) => {
      return current && typeof current === 'object'
        ? (current as Record<string, unknown>)[key]
        : undefined;
    }, obj as unknown);
  }

  /**
   * Set nested value by path
   */
  private setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    const last = parts.pop()!;
    let current = obj;

    for (const part of parts) {
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    current[last] = value;
  }
}

/**
 * Load configuration from environment and config file
 */
export async function loadConfig(configPath?: string): Promise<Config> {
  let fileConfig: ConfigOptions = {};

  // Try to load config file
  if (configPath) {
    try {
      const content = await Deno.readTextFile(configPath);
      fileConfig = JSON.parse(content);
    } catch {
      // Config file not found or invalid, use defaults
    }
  } else {
    // Try default locations
    for (const path of ['./config/app.json', './config.json', './deno.json']) {
      try {
        const content = await Deno.readTextFile(path);
        const parsed = JSON.parse(content);
        if (parsed.echelon) {
          fileConfig = parsed.echelon;
          break;
        }
      } catch {
        continue;
      }
    }
  }

  // Override with environment variables
  const envConfig: ConfigOptions = {
    port: Environment.get('PORT') ? parseInt(Environment.get('PORT')!) : undefined,
    host: Environment.get('HOST'),
    env: Environment.get('DENO_ENV'),
    debug: Environment.get('DEBUG') === 'true',
    logLevel: Environment.get('LOG_LEVEL') as ConfigOptions['logLevel'],
    session: {
      secret: Environment.get('SESSION_SECRET'),
    },
  };

  // Merge all configurations
  const config = new Config(fileConfig);
  for (const [key, value] of Object.entries(envConfig)) {
    if (value !== undefined) {
      config.set(key, value);
    }
  }

  return config;
}

// Default config instance
let defaultConfig: Config | null = null;

/**
 * Get the default config instance
 */
export function getConfig(): Config {
  if (!defaultConfig) {
    defaultConfig = new Config();
  }
  return defaultConfig;
}
