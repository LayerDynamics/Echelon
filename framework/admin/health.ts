/**
 * Health Check
 *
 * System health monitoring and status checks.
 */

import { getKV } from '../orm/kv.ts';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: Record<string, CheckResult>;
  version?: string;
}

export interface CheckResult {
  status: 'pass' | 'warn' | 'fail';
  message?: string;
  duration?: number;
  timestamp?: string;
}

export type HealthChecker = () => Promise<CheckResult>;

/**
 * Health check manager
 */
export class HealthCheck {
  private checks = new Map<string, HealthChecker>();
  private version?: string;

  constructor(version?: string) {
    this.version = version;
    this.registerDefaultChecks();
  }

  /**
   * Register a health check
   */
  register(name: string, checker: HealthChecker): this {
    this.checks.set(name, checker);
    return this;
  }

  /**
   * Run all health checks
   */
  async check(): Promise<HealthStatus> {
    const results: Record<string, CheckResult> = {};
    let hasFailure = false;
    let hasWarning = false;

    for (const [name, checker] of this.checks) {
      const start = performance.now();

      try {
        const result = await checker();
        result.duration = performance.now() - start;
        result.timestamp = new Date().toISOString();
        results[name] = result;

        if (result.status === 'fail') hasFailure = true;
        if (result.status === 'warn') hasWarning = true;
      } catch (error) {
        results[name] = {
          status: 'fail',
          message: (error as Error).message,
          duration: performance.now() - start,
          timestamp: new Date().toISOString(),
        };
        hasFailure = true;
      }
    }

    return {
      status: hasFailure ? 'unhealthy' : hasWarning ? 'degraded' : 'healthy',
      timestamp: new Date().toISOString(),
      checks: results,
      version: this.version,
    };
  }

  /**
   * Run a quick liveness check
   */
  async liveness(): Promise<{ status: 'ok' | 'error' }> {
    return { status: 'ok' };
  }

  /**
   * Run a readiness check
   */
  async readiness(): Promise<{ status: 'ready' | 'not_ready'; message?: string }> {
    const health = await this.check();

    if (health.status === 'unhealthy') {
      return {
        status: 'not_ready',
        message: 'One or more health checks failed',
      };
    }

    return { status: 'ready' };
  }

  /**
   * Register default health checks
   */
  private registerDefaultChecks(): void {
    // KV database check
    this.register('database', async () => {
      try {
        const kv = await getKV();
        await kv.get(['__health_check__']);
        return { status: 'pass', message: 'KV store accessible' };
      } catch (error) {
        return { status: 'fail', message: (error as Error).message };
      }
    });

    // Memory check
    this.register('memory', async () => {
      const memory = Deno.memoryUsage();
      const heapUsedPercent = (memory.heapUsed / memory.heapTotal) * 100;

      if (heapUsedPercent > 90) {
        return { status: 'fail', message: `Heap usage critical: ${heapUsedPercent.toFixed(1)}%` };
      }
      if (heapUsedPercent > 75) {
        return { status: 'warn', message: `Heap usage high: ${heapUsedPercent.toFixed(1)}%` };
      }

      return { status: 'pass', message: `Heap usage: ${heapUsedPercent.toFixed(1)}%` };
    });
  }
}

/**
 * Create health check routes
 */
export function healthRoutes(health: HealthCheck) {
  return {
    '/health': async () => {
      const status = await health.check();
      return new Response(JSON.stringify(status), {
        status: status.status === 'healthy' ? 200 : status.status === 'degraded' ? 200 : 503,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    '/health/live': async () => {
      const status = await health.liveness();
      return new Response(JSON.stringify(status), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    '/health/ready': async () => {
      const status = await health.readiness();
      return new Response(JSON.stringify(status), {
        status: status.status === 'ready' ? 200 : 503,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  };
}
