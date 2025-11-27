/**
 * Debug Reports
 *
 * Generates comprehensive reports for request lifecycles,
 * performance analysis, and debugging summaries.
 */

import { DebugLevel, DebugModule, DEBUG_LEVEL_NAMES } from './levels.ts';
import {
  DebugOutput,
  TimingEntry,
  getDebugOutput,
  Icons,
} from './output.ts';
import { DebugEvent, DebugRequestContext } from './debugger.ts';

// ============================================================================
// Report Types
// ============================================================================

export interface RequestReport {
  id: string;
  method: string;
  url: string;
  status: number;
  duration: number;
  startTime: number;
  endTime: number;
  events: DebugEvent[];
  timings: TimingEntry[];
  metadata: Record<string, unknown>;
  summary: RequestSummary;
}

export interface RequestSummary {
  totalEvents: number;
  eventsByLevel: Record<string, number>;
  eventsByModule: Record<string, number>;
  slowestOperation?: TimingEntry;
  errors: DebugEvent[];
  warnings: DebugEvent[];
}

export interface PerformanceReport {
  totalRequests: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
  slowRequests: RequestReport[];
  errorRequests: RequestReport[];
  moduleBreakdown: Record<string, ModulePerformance>;
}

export interface ModulePerformance {
  module: DebugModule;
  totalTime: number;
  averageTime: number;
  callCount: number;
  percentage: number;
}

// ============================================================================
// Report Generator
// ============================================================================

export class ReportGenerator {
  private output: DebugOutput;
  private requestHistory: RequestReport[] = [];
  private maxHistory: number = 1000;

  constructor(output?: DebugOutput) {
    this.output = output ?? getDebugOutput();
  }

  // ==========================================================================
  // Request Report Generation
  // ==========================================================================

  /**
   * Generate a report for a completed request
   */
  generateRequestReport(
    ctx: DebugRequestContext,
    status: number,
    endTime: number = Date.now(),
  ): RequestReport {
    const duration = endTime - ctx.startTime;

    const summary = this.generateSummary(ctx.events, ctx.timings);

    const report: RequestReport = {
      id: ctx.id,
      method: ctx.method,
      url: ctx.url,
      status,
      duration,
      startTime: ctx.startTime,
      endTime,
      events: [...ctx.events],
      timings: [...ctx.timings],
      metadata: Object.fromEntries(ctx.metadata),
      summary,
    };

    // Add to history
    this.requestHistory.push(report);
    if (this.requestHistory.length > this.maxHistory) {
      this.requestHistory.shift();
    }

    return report;
  }

  /**
   * Generate summary from events and timings
   */
  private generateSummary(
    events: DebugEvent[],
    timings: TimingEntry[],
  ): RequestSummary {
    const eventsByLevel: Record<string, number> = {};
    const eventsByModule: Record<string, number> = {};
    const errors: DebugEvent[] = [];
    const warnings: DebugEvent[] = [];

    for (const event of events) {
      // Count by level
      const levelName = DEBUG_LEVEL_NAMES[event.level];
      eventsByLevel[levelName] = (eventsByLevel[levelName] ?? 0) + 1;

      // Count by module
      eventsByModule[event.module] = (eventsByModule[event.module] ?? 0) + 1;

      // Collect errors and warnings
      if (event.level === DebugLevel.ERROR) {
        errors.push(event);
      } else if (event.level === DebugLevel.WARN) {
        warnings.push(event);
      }
    }

    // Find slowest operation
    let slowestOperation: TimingEntry | undefined;
    let maxDuration = 0;

    const findSlowest = (entries: TimingEntry[]) => {
      for (const entry of entries) {
        const dur = entry.duration ?? 0;
        if (dur > maxDuration) {
          maxDuration = dur;
          slowestOperation = entry;
        }
        findSlowest(entry.children);
      }
    };
    findSlowest(timings);

    return {
      totalEvents: events.length,
      eventsByLevel,
      eventsByModule,
      slowestOperation,
      errors,
      warnings,
    };
  }

  // ==========================================================================
  // Performance Report Generation
  // ==========================================================================

  /**
   * Generate a performance report from request history
   */
  generatePerformanceReport(requests?: RequestReport[]): PerformanceReport {
    const reports = requests ?? this.requestHistory;

    if (reports.length === 0) {
      return this.emptyPerformanceReport();
    }

    const durations = reports.map((r) => r.duration).sort((a, b) => a - b);

    const totalRequests = reports.length;
    const averageDuration = durations.reduce((a, b) => a + b, 0) / totalRequests;
    const minDuration = durations[0];
    const maxDuration = durations[durations.length - 1];

    const p50Duration = this.percentile(durations, 50);
    const p95Duration = this.percentile(durations, 95);
    const p99Duration = this.percentile(durations, 99);

    // Slow requests (> p95)
    const slowRequests = reports
      .filter((r) => r.duration > p95Duration)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);

    // Error requests
    const errorRequests = reports
      .filter((r) => r.status >= 400)
      .slice(-10);

    // Module breakdown
    const moduleBreakdown = this.calculateModuleBreakdown(reports);

    return {
      totalRequests,
      averageDuration,
      minDuration,
      maxDuration,
      p50Duration,
      p95Duration,
      p99Duration,
      slowRequests,
      errorRequests,
      moduleBreakdown,
    };
  }

  /**
   * Calculate percentile
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  /**
   * Calculate module performance breakdown
   */
  private calculateModuleBreakdown(
    reports: RequestReport[],
  ): Record<string, ModulePerformance> {
    const moduleStats: Map<DebugModule, { totalTime: number; count: number }> = new Map();

    for (const report of reports) {
      const addTimings = (entries: TimingEntry[]) => {
        for (const entry of entries) {
          const existing = moduleStats.get(entry.module) ?? { totalTime: 0, count: 0 };
          existing.totalTime += entry.duration ?? 0;
          existing.count++;
          moduleStats.set(entry.module, existing);
          addTimings(entry.children);
        }
      };
      addTimings(report.timings);
    }

    const totalTime = Array.from(moduleStats.values())
      .reduce((sum, s) => sum + s.totalTime, 0);

    const result: Record<string, ModulePerformance> = {};
    for (const [module, stats] of moduleStats) {
      result[module] = {
        module,
        totalTime: stats.totalTime,
        averageTime: stats.count > 0 ? stats.totalTime / stats.count : 0,
        callCount: stats.count,
        percentage: totalTime > 0 ? (stats.totalTime / totalTime) * 100 : 0,
      };
    }

    return result;
  }

  /**
   * Empty performance report
   */
  private emptyPerformanceReport(): PerformanceReport {
    return {
      totalRequests: 0,
      averageDuration: 0,
      minDuration: 0,
      maxDuration: 0,
      p50Duration: 0,
      p95Duration: 0,
      p99Duration: 0,
      slowRequests: [],
      errorRequests: [],
      moduleBreakdown: {},
    };
  }

  // ==========================================================================
  // Report Formatting
  // ==========================================================================

  /**
   * Format a request report as a string
   */
  formatRequestReport(report: RequestReport): string {
    const lines: string[] = [];

    lines.push(this.output.formatHeader(`Request Report: ${report.id.slice(0, 8)}...`));
    lines.push('');

    // Basic info
    lines.push(`${Icons.request} ${report.method} ${report.url}`);
    lines.push(`${Icons.response} Status: ${report.status}`);
    lines.push(`${Icons.time} Duration: ${this.output.formatDuration(report.duration)}`);
    lines.push('');

    // Summary stats
    lines.push('--- Summary ---');
    lines.push(`Total Events: ${report.summary.totalEvents}`);

    if (Object.keys(report.summary.eventsByLevel).length > 0) {
      lines.push('Events by Level:');
      for (const [level, count] of Object.entries(report.summary.eventsByLevel)) {
        lines.push(`  ${level}: ${count}`);
      }
    }

    if (Object.keys(report.summary.eventsByModule).length > 0) {
      lines.push('Events by Module:');
      for (const [module, count] of Object.entries(report.summary.eventsByModule)) {
        lines.push(`  ${module}: ${count}`);
      }
    }

    if (report.summary.slowestOperation) {
      const slow = report.summary.slowestOperation;
      lines.push(`Slowest Operation: ${slow.name} (${this.output.formatDuration(slow.duration ?? 0)})`);
    }

    // Errors
    if (report.summary.errors.length > 0) {
      lines.push('');
      lines.push('--- Errors ---');
      for (const error of report.summary.errors.slice(0, 5)) {
        lines.push(`  [${error.module}] ${error.message}`);
      }
    }

    // Warnings
    if (report.summary.warnings.length > 0) {
      lines.push('');
      lines.push('--- Warnings ---');
      for (const warning of report.summary.warnings.slice(0, 5)) {
        lines.push(`  [${warning.module}] ${warning.message}`);
      }
    }

    // Timing waterfall
    if (report.timings.length > 0) {
      lines.push('');
      lines.push(this.output.formatWaterfall(report.timings, 'Timing Breakdown'));
    }

    lines.push('');
    lines.push(this.output.formatFooter());

    return lines.join('\n');
  }

  /**
   * Format a performance report as a string
   */
  formatPerformanceReport(report: PerformanceReport): string {
    const lines: string[] = [];

    lines.push(this.output.formatHeader('Performance Report'));
    lines.push('');

    // Overview
    lines.push('--- Overview ---');
    lines.push(`Total Requests: ${report.totalRequests}`);
    lines.push(`Average Duration: ${this.output.formatDuration(report.averageDuration)}`);
    lines.push(`Min Duration: ${this.output.formatDuration(report.minDuration)}`);
    lines.push(`Max Duration: ${this.output.formatDuration(report.maxDuration)}`);
    lines.push('');

    // Percentiles
    lines.push('--- Percentiles ---');
    lines.push(`P50: ${this.output.formatDuration(report.p50Duration)}`);
    lines.push(`P95: ${this.output.formatDuration(report.p95Duration)}`);
    lines.push(`P99: ${this.output.formatDuration(report.p99Duration)}`);
    lines.push('');

    // Module breakdown
    if (Object.keys(report.moduleBreakdown).length > 0) {
      lines.push('--- Module Breakdown ---');
      const headers = ['Module', 'Total Time', 'Avg Time', 'Calls', '%'];
      const rows = Object.values(report.moduleBreakdown)
        .sort((a, b) => b.totalTime - a.totalTime)
        .map((m) => [
          m.module,
          `${m.totalTime.toFixed(1)}ms`,
          `${m.averageTime.toFixed(2)}ms`,
          m.callCount,
          `${m.percentage.toFixed(1)}%`,
        ]);
      lines.push(this.output.formatTable(headers, rows));
      lines.push('');
    }

    // Slow requests
    if (report.slowRequests.length > 0) {
      lines.push('--- Slow Requests ---');
      for (const req of report.slowRequests.slice(0, 5)) {
        lines.push(`  ${req.method} ${req.url} - ${this.output.formatDuration(req.duration)}`);
      }
      lines.push('');
    }

    // Error requests
    if (report.errorRequests.length > 0) {
      lines.push('--- Error Requests ---');
      for (const req of report.errorRequests.slice(0, 5)) {
        lines.push(`  ${req.method} ${req.url} - ${req.status}`);
      }
      lines.push('');
    }

    lines.push(this.output.formatFooter());

    return lines.join('\n');
  }

  // ==========================================================================
  // Report Output
  // ==========================================================================

  /**
   * Print a request report to console
   */
  printRequestReport(report: RequestReport): void {
    console.log(this.formatRequestReport(report));
  }

  /**
   * Print a performance report to console
   */
  printPerformanceReport(report?: PerformanceReport): void {
    const perfReport = report ?? this.generatePerformanceReport();
    console.log(this.formatPerformanceReport(perfReport));
  }

  // ==========================================================================
  // History Management
  // ==========================================================================

  /**
   * Get request history
   */
  getHistory(): RequestReport[] {
    return [...this.requestHistory];
  }

  /**
   * Get recent requests
   */
  getRecentRequests(count: number = 10): RequestReport[] {
    return this.requestHistory.slice(-count);
  }

  /**
   * Get slow requests
   */
  getSlowRequests(thresholdMs: number): RequestReport[] {
    return this.requestHistory.filter((r) => r.duration > thresholdMs);
  }

  /**
   * Get error requests
   */
  getErrorRequests(): RequestReport[] {
    return this.requestHistory.filter((r) => r.status >= 400);
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.requestHistory = [];
  }

  /**
   * Set max history size
   */
  setMaxHistory(max: number): void {
    this.maxHistory = max;
    while (this.requestHistory.length > max) {
      this.requestHistory.shift();
    }
  }

  // ==========================================================================
  // Export
  // ==========================================================================

  /**
   * Export request report as JSON
   */
  exportRequestReportJson(report: RequestReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Export performance report as JSON
   */
  exportPerformanceReportJson(report?: PerformanceReport): string {
    const perfReport = report ?? this.generatePerformanceReport();
    return JSON.stringify(perfReport, null, 2);
  }

  /**
   * Export all history as JSON
   */
  exportHistoryJson(): string {
    return JSON.stringify(this.requestHistory, null, 2);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultReportGenerator: ReportGenerator | null = null;

/**
 * Get the default report generator
 */
export function getReportGenerator(): ReportGenerator {
  if (!defaultReportGenerator) {
    defaultReportGenerator = new ReportGenerator();
  }
  return defaultReportGenerator;
}

/**
 * Create a new report generator
 */
export function createReportGenerator(output?: DebugOutput): ReportGenerator {
  return new ReportGenerator(output);
}
