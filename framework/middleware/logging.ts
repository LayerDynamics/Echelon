/**
 * Logging Middleware
 *
 * Request/response logging for monitoring and debugging.
 */

import type { LegacyMiddleware } from '../http/types.ts';

export interface LoggingOptions {
  logRequest?: boolean;
  logResponse?: boolean;
  logBody?: boolean;
  logHeaders?: boolean;
  excludePaths?: string[];
  format?: 'json' | 'text';
}

const DEFAULT_OPTIONS: LoggingOptions = {
  logRequest: true,
  logResponse: true,
  logBody: false,
  logHeaders: false,
  excludePaths: ['/health', '/ready', '/favicon.ico'],
  format: 'text',
};

/**
 * Create logging middleware
 */
export function loggingMiddleware(options: LoggingOptions = {}): LegacyMiddleware {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return async (req, res, next) => {
    // Skip excluded paths
    if (opts.excludePaths!.some((path) => req.path.startsWith(path))) {
      return await next();
    }

    const startTime = performance.now();

    // Log request
    if (opts.logRequest) {
      logRequest(req, opts);
    }

    // Continue with request
    const response = await next();

    // Calculate duration
    const duration = performance.now() - startTime;

    // Log response
    if (opts.logResponse) {
      logResponse(req, response, duration, opts);
    }

    return response;
  };
}

/**
 * Log incoming request
 */
function logRequest(
  req: { method: string; path: string; ip: string; headers: Headers },
  opts: LoggingOptions
): void {
  if (opts.format === 'json') {
    const logEntry: Record<string, unknown> = {
      type: 'request',
      method: req.method,
      path: req.path,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    };

    if (opts.logHeaders) {
      logEntry.headers = Object.fromEntries(req.headers.entries());
    }

    console.log(JSON.stringify(logEntry));
  } else {
    console.log(`→ ${req.method} ${req.path} [${req.ip}]`);
  }
}

/**
 * Log outgoing response
 */
function logResponse(
  req: { method: string; path: string },
  response: Response | void,
  duration: number,
  opts: LoggingOptions
): void {
  const status = response instanceof Response ? response.status : 200;

  if (opts.format === 'json') {
    const logEntry = {
      type: 'response',
      method: req.method,
      path: req.path,
      status,
      duration: Math.round(duration * 100) / 100,
      timestamp: new Date().toISOString(),
    };

    console.log(JSON.stringify(logEntry));
  } else {
    const statusColor = getStatusColor(status);
    console.log(
      `← ${req.method} ${req.path} ${statusColor}${status}\x1b[0m ${duration.toFixed(2)}ms`
    );
  }
}

/**
 * Get ANSI color code for status
 */
function getStatusColor(status: number): string {
  if (status >= 500) return '\x1b[31m'; // Red
  if (status >= 400) return '\x1b[33m'; // Yellow
  if (status >= 300) return '\x1b[36m'; // Cyan
  if (status >= 200) return '\x1b[32m'; // Green
  return '\x1b[0m'; // Reset
}
