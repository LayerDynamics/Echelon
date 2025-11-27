/**
 * Structured Logging
 *
 * JSON-structured logging with levels and context.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface LoggerOptions {
  level?: LogLevel;
  format?: 'json' | 'pretty';
  context?: Record<string, unknown>;
  output?: (entry: LogEntry) => void;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Structured logger
 */
export class Logger {
  private level: LogLevel;
  private format: 'json' | 'pretty';
  private context: Record<string, unknown>;
  private output: (entry: LogEntry) => void;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? 'info';
    this.format = options.format ?? 'json';
    this.context = options.context ?? {};
    this.output = options.output ?? this.defaultOutput.bind(this);
  }

  /**
   * Log at debug level
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  /**
   * Log at info level
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  /**
   * Log at warn level
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  /**
   * Log at error level
   */
  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log('error', message, context, error);
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, unknown>): Logger {
    return new Logger({
      level: this.level,
      format: this.format,
      context: { ...this.context, ...context },
      output: this.output,
    });
  }

  /**
   * Set the log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Check if a level is enabled
   */
  isLevelEnabled(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): void {
    if (!this.isLevelEnabled(level)) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: { ...this.context, ...context },
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    this.output(entry);
  }

  /**
   * Default output handler
   */
  private defaultOutput(entry: LogEntry): void {
    if (this.format === 'json') {
      console.log(JSON.stringify(entry));
    } else {
      this.prettyPrint(entry);
    }
  }

  /**
   * Pretty print for development
   */
  private prettyPrint(entry: LogEntry): void {
    const colors: Record<LogLevel, string> = {
      debug: '\x1b[36m', // Cyan
      info: '\x1b[32m', // Green
      warn: '\x1b[33m', // Yellow
      error: '\x1b[31m', // Red
    };
    const reset = '\x1b[0m';
    const dim = '\x1b[2m';

    const timestamp = dim + entry.timestamp + reset;
    const level = colors[entry.level] + entry.level.toUpperCase().padEnd(5) + reset;

    let output = `${timestamp} ${level} ${entry.message}`;

    if (entry.context && Object.keys(entry.context).length > 0) {
      output += ` ${dim}${JSON.stringify(entry.context)}${reset}`;
    }

    console.log(output);

    if (entry.error?.stack) {
      console.log(dim + entry.error.stack + reset);
    }
  }
}

/**
 * Request logger middleware context
 */
export interface RequestLogContext {
  requestId: string;
  method: string;
  path: string;
  userAgent?: string;
  ip?: string;
  userId?: string;
}

/**
 * Create a request logger
 */
export function createRequestLogger(baseLogger: Logger, context: RequestLogContext): Logger {
  return baseLogger.child({
    requestId: context.requestId,
    method: context.method,
    path: context.path,
    userAgent: context.userAgent,
    ip: context.ip,
    userId: context.userId,
  });
}

// Default logger instance
let defaultLogger: Logger | null = null;

/**
 * Get the default logger
 */
export function getLogger(): Logger {
  if (!defaultLogger) {
    const env = Deno.env.get('DENO_ENV') ?? 'development';
    defaultLogger = new Logger({
      level: env === 'production' ? 'info' : 'debug',
      format: env === 'production' ? 'json' : 'pretty',
    });
  }
  return defaultLogger;
}

/**
 * Set the default logger
 */
export function setLogger(logger: Logger): void {
  defaultLogger = logger;
}

/**
 * Convenience logging functions using default logger
 */
export const log = {
  debug: (message: string, context?: Record<string, unknown>) =>
    getLogger().debug(message, context),
  info: (message: string, context?: Record<string, unknown>) =>
    getLogger().info(message, context),
  warn: (message: string, context?: Record<string, unknown>) =>
    getLogger().warn(message, context),
  error: (message: string, error?: Error, context?: Record<string, unknown>) =>
    getLogger().error(message, error, context),
};
