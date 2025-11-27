/**
 * Debug Output
 *
 * Rich colored console output with icons, timing waterfalls,
 * and beautiful formatting for developer experience.
 */

import { DebugLevel, DebugModule, DEBUG_LEVEL_NAMES } from './levels.ts';

// ============================================================================
// ANSI Color Codes
// ============================================================================

export const Colors = {
  // Reset
  reset: '\x1b[0m',

  // Styles
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',

  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  // Bright foreground colors
  brightBlack: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',

  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
} as const;

// ============================================================================
// Icons (ASCII-safe symbols)
// ============================================================================

export const Icons = {
  // Status icons
  success: '[OK]',
  error: '[ERR]',
  warning: '[WARN]',
  info: '[i]',
  debug: '[DBG]',
  trace: '[TRC]',

  // Module icons
  http: '[HTTP]',
  router: '[RTR]',
  middleware: '[MID]',
  controller: '[CTL]',
  orm: '[ORM]',
  auth: '[AUTH]',
  cache: '[CACHE]',
  view: '[VIEW]',
  jobs: '[JOB]',
  search: '[SRCH]',
  plugin: '[PLG]',
  api: '[API]',
  config: '[CFG]',
  security: '[SEC]',

  // Action icons
  start: '>>',
  stop: '||',
  pause: '|>',
  request: '->',
  response: '<-',
  time: '[T]',
  memory: '[M]',
  database: '[DB]',
  lock: '[+]',
  unlock: '[-]',
  cache_hit: '[HIT]',
  cache_miss: '[MISS]',

  // Tree/structure icons
  branch: '|--',
  lastBranch: '`--',
  vertical: '|',
  horizontal: '-',
  corner: '`-',
  arrow: '->',
  dot: '*',
} as const;

// ============================================================================
// Color Helpers
// ============================================================================

/**
 * Apply color to text
 */
export function colorize(text: string, ...colors: string[]): string {
  return colors.join('') + text + Colors.reset;
}

/**
 * Get color for debug level
 */
export function getLevelColor(level: DebugLevel): string {
  switch (level) {
    case DebugLevel.ERROR:
      return Colors.red;
    case DebugLevel.WARN:
      return Colors.yellow;
    case DebugLevel.INFO:
      return Colors.green;
    case DebugLevel.DEBUG:
      return Colors.cyan;
    case DebugLevel.TRACE:
      return Colors.magenta;
    default:
      return Colors.white;
  }
}

/**
 * Get icon for debug level
 */
export function getLevelIcon(level: DebugLevel): string {
  switch (level) {
    case DebugLevel.ERROR:
      return Icons.error;
    case DebugLevel.WARN:
      return Icons.warning;
    case DebugLevel.INFO:
      return Icons.info;
    case DebugLevel.DEBUG:
      return Icons.debug;
    case DebugLevel.TRACE:
      return Icons.trace;
    default:
      return Icons.dot;
  }
}

/**
 * Get color for module
 */
export function getModuleColor(module: DebugModule): string {
  switch (module) {
    case DebugModule.HTTP:
      return Colors.brightCyan;
    case DebugModule.ROUTER:
      return Colors.brightBlue;
    case DebugModule.MIDDLEWARE:
      return Colors.brightYellow;
    case DebugModule.CONTROLLER:
      return Colors.brightGreen;
    case DebugModule.ORM:
      return Colors.brightMagenta;
    case DebugModule.AUTH:
      return Colors.brightRed;
    case DebugModule.CACHE:
      return Colors.cyan;
    case DebugModule.VIEW:
      return Colors.green;
    case DebugModule.JOBS:
      return Colors.yellow;
    case DebugModule.SEARCH:
      return Colors.blue;
    case DebugModule.PLUGIN:
      return Colors.magenta;
    case DebugModule.API:
      return Colors.brightWhite;
    case DebugModule.CONFIG:
      return Colors.dim;
    case DebugModule.SECURITY:
      return Colors.red;
    default:
      return Colors.white;
  }
}

/**
 * Get icon for module
 */
export function getModuleIcon(module: DebugModule): string {
  switch (module) {
    case DebugModule.HTTP:
      return Icons.http;
    case DebugModule.ROUTER:
      return Icons.router;
    case DebugModule.MIDDLEWARE:
      return Icons.middleware;
    case DebugModule.CONTROLLER:
      return Icons.controller;
    case DebugModule.ORM:
      return Icons.orm;
    case DebugModule.AUTH:
      return Icons.auth;
    case DebugModule.CACHE:
      return Icons.cache;
    case DebugModule.VIEW:
      return Icons.view;
    case DebugModule.JOBS:
      return Icons.jobs;
    case DebugModule.SEARCH:
      return Icons.search;
    case DebugModule.PLUGIN:
      return Icons.plugin;
    case DebugModule.API:
      return Icons.api;
    case DebugModule.CONFIG:
      return Icons.config;
    case DebugModule.SECURITY:
      return Icons.security;
    default:
      return Icons.dot;
  }
}

// ============================================================================
// Output Formatter Options
// ============================================================================

export interface OutputOptions {
  useColors: boolean;
  useIcons: boolean;
  includeTimestamp: boolean;
  timestampFormat: 'iso' | 'time' | 'relative';
  maxWidth: number;
  indentSize: number;
  maxObjectDepth: number;
  truncateAt: number;
}

const DEFAULT_OPTIONS: OutputOptions = {
  useColors: true,
  useIcons: true,
  includeTimestamp: true,
  timestampFormat: 'time',
  maxWidth: 120,
  indentSize: 2,
  maxObjectDepth: 3,
  truncateAt: 500,
};

// ============================================================================
// Timing Entry for Waterfall
// ============================================================================

export interface TimingEntry {
  name: string;
  module: DebugModule;
  startTime: number;
  endTime?: number;
  duration?: number;
  children: TimingEntry[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Debug Output Formatter
// ============================================================================

export class DebugOutput {
  private options: OutputOptions;
  private startTime: number;

  constructor(options?: Partial<OutputOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.startTime = Date.now();
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Update output options
   */
  configure(options: Partial<OutputOptions>): this {
    Object.assign(this.options, options);
    return this;
  }

  /**
   * Get current options
   */
  getOptions(): OutputOptions {
    return { ...this.options };
  }

  /**
   * Disable colors (for non-TTY output)
   */
  disableColors(): this {
    this.options.useColors = false;
    return this;
  }

  /**
   * Enable colors
   */
  enableColors(): this {
    this.options.useColors = true;
    return this;
  }

  // ==========================================================================
  // Timestamp Formatting
  // ==========================================================================

  /**
   * Format timestamp based on configured format
   */
  formatTimestamp(date: Date = new Date()): string {
    switch (this.options.timestampFormat) {
      case 'iso':
        return date.toISOString();
      case 'time':
        return date.toTimeString().split(' ')[0] + '.' + String(date.getMilliseconds()).padStart(3, '0');
      case 'relative':
        return `+${Date.now() - this.startTime}ms`;
      default:
        return date.toISOString();
    }
  }

  // ==========================================================================
  // Basic Formatting
  // ==========================================================================

  /**
   * Apply color if colors are enabled
   */
  private applyColor(text: string, color: string): string {
    if (!this.options.useColors) return text;
    return colorize(text, color);
  }

  /**
   * Get icon if icons are enabled
   */
  private getIcon(icon: string): string {
    if (!this.options.useIcons) return '';
    return icon + ' ';
  }

  /**
   * Truncate string if too long
   */
  truncate(text: string, maxLength?: number): string {
    const limit = maxLength ?? this.options.truncateAt;
    if (text.length <= limit) return text;
    return text.slice(0, limit - 3) + '...';
  }

  /**
   * Create indent string
   */
  indent(level: number): string {
    return ' '.repeat(level * this.options.indentSize);
  }

  // ==========================================================================
  // Log Line Formatting
  // ==========================================================================

  /**
   * Format a complete debug log line
   */
  formatLogLine(
    level: DebugLevel,
    module: DebugModule,
    message: string,
    data?: unknown,
  ): string {
    const parts: string[] = [];

    // Timestamp
    if (this.options.includeTimestamp) {
      const timestamp = this.applyColor(
        `[${this.formatTimestamp()}]`,
        Colors.dim,
      );
      parts.push(timestamp);
    }

    // Level badge
    const levelIcon = this.getIcon(getLevelIcon(level));
    const levelName = DEBUG_LEVEL_NAMES[level].padEnd(5);
    const levelBadge = this.applyColor(
      levelIcon + levelName,
      getLevelColor(level),
    );
    parts.push(levelBadge);

    // Module badge
    const moduleIcon = this.getIcon(getModuleIcon(module));
    const moduleName = `[${module}]`.padEnd(14);
    const moduleBadge = this.applyColor(
      moduleIcon + moduleName,
      getModuleColor(module),
    );
    parts.push(moduleBadge);

    // Message
    parts.push(message);

    // Data (if provided)
    if (data !== undefined) {
      parts.push(this.formatValue(data));
    }

    return parts.join(' ');
  }

  /**
   * Format a header line (for grouping)
   */
  formatHeader(title: string, icon?: string): string {
    const width = this.options.maxWidth;
    const iconPart = icon ? this.getIcon(icon) : '';
    const titlePart = ` ${iconPart}${title} `;
    const lineLength = Math.max(0, (width - titlePart.length) / 2);
    const line = '='.repeat(Math.floor(lineLength));

    return this.applyColor(
      `+${line}${titlePart}${line}+`,
      Colors.bold + Colors.cyan,
    );
  }

  /**
   * Format a footer line
   */
  formatFooter(summary?: string): string {
    const width = this.options.maxWidth;
    const summaryPart = summary ? ` ${summary} ` : '';
    const lineLength = Math.max(0, (width - summaryPart.length) / 2);
    const line = '='.repeat(Math.floor(lineLength));

    return this.applyColor(
      `+${line}${summaryPart}${line}+`,
      Colors.bold + Colors.cyan,
    );
  }

  /**
   * Format a separator line
   */
  formatSeparator(char: string = '-'): string {
    return this.applyColor(char.repeat(this.options.maxWidth), Colors.dim);
  }

  // ==========================================================================
  // Value Formatting
  // ==========================================================================

  /**
   * Format any value for display
   */
  formatValue(value: unknown, depth: number = 0): string {
    if (depth > this.options.maxObjectDepth) {
      return this.applyColor('[Max depth reached]', Colors.dim);
    }

    if (value === null) {
      return this.applyColor('null', Colors.yellow);
    }

    if (value === undefined) {
      return this.applyColor('undefined', Colors.dim);
    }

    if (typeof value === 'string') {
      return this.applyColor(
        `"${this.truncate(value)}"`,
        Colors.green,
      );
    }

    if (typeof value === 'number') {
      return this.applyColor(String(value), Colors.yellow);
    }

    if (typeof value === 'boolean') {
      return this.applyColor(String(value), Colors.magenta);
    }

    if (typeof value === 'function') {
      return this.applyColor(`[Function: ${value.name || 'anonymous'}]`, Colors.cyan);
    }

    if (value instanceof Error) {
      return this.formatError(value);
    }

    if (value instanceof Date) {
      return this.applyColor(value.toISOString(), Colors.blue);
    }

    if (value instanceof Map) {
      return this.formatMap(value, depth);
    }

    if (value instanceof Set) {
      return this.formatSet(value, depth);
    }

    if (Array.isArray(value)) {
      return this.formatArray(value, depth);
    }

    if (typeof value === 'object') {
      return this.formatObject(value as Record<string, unknown>, depth);
    }

    return String(value);
  }

  /**
   * Format an object
   */
  formatObject(obj: Record<string, unknown>, depth: number = 0): string {
    const entries = Object.entries(obj);
    if (entries.length === 0) {
      return '{}';
    }

    if (depth >= this.options.maxObjectDepth) {
      return this.applyColor(`{...${entries.length} keys}`, Colors.dim);
    }

    const formatted = entries.map(([key, val]) => {
      const keyStr = this.applyColor(key, Colors.cyan);
      const valStr = this.formatValue(val, depth + 1);
      return `${keyStr}: ${valStr}`;
    });

    if (formatted.join(', ').length < 60) {
      return `{ ${formatted.join(', ')} }`;
    }

    const indentStr = this.indent(depth + 1);
    return `{\n${indentStr}${formatted.join(`,\n${indentStr}`)}\n${this.indent(depth)}}`;
  }

  /**
   * Format an array
   */
  formatArray(arr: unknown[], depth: number = 0): string {
    if (arr.length === 0) {
      return '[]';
    }

    if (depth >= this.options.maxObjectDepth) {
      return this.applyColor(`[...${arr.length} items]`, Colors.dim);
    }

    const formatted = arr.map((val) => this.formatValue(val, depth + 1));

    if (formatted.join(', ').length < 60) {
      return `[${formatted.join(', ')}]`;
    }

    const indentStr = this.indent(depth + 1);
    return `[\n${indentStr}${formatted.join(`,\n${indentStr}`)}\n${this.indent(depth)}]`;
  }

  /**
   * Format a Map
   */
  formatMap(map: Map<unknown, unknown>, depth: number = 0): string {
    if (map.size === 0) {
      return 'Map(0) {}';
    }

    if (depth >= this.options.maxObjectDepth) {
      return this.applyColor(`Map(${map.size}) {...}`, Colors.dim);
    }

    const entries = Array.from(map.entries()).map(([key, val]) => {
      const keyStr = this.formatValue(key, depth + 1);
      const valStr = this.formatValue(val, depth + 1);
      return `${keyStr} => ${valStr}`;
    });

    return `Map(${map.size}) { ${entries.join(', ')} }`;
  }

  /**
   * Format a Set
   */
  formatSet(set: Set<unknown>, depth: number = 0): string {
    if (set.size === 0) {
      return 'Set(0) {}';
    }

    if (depth >= this.options.maxObjectDepth) {
      return this.applyColor(`Set(${set.size}) {...}`, Colors.dim);
    }

    const values = Array.from(set.values()).map((val) =>
      this.formatValue(val, depth + 1)
    );

    return `Set(${set.size}) { ${values.join(', ')} }`;
  }

  /**
   * Format an Error
   */
  formatError(error: Error): string {
    const parts: string[] = [];
    parts.push(this.applyColor(`${error.name}: ${error.message}`, Colors.red));

    if (error.stack) {
      const stackLines = error.stack.split('\n').slice(1, 6);
      parts.push(
        this.applyColor(stackLines.join('\n'), Colors.dim),
      );
    }

    return parts.join('\n');
  }

  // ==========================================================================
  // Timing Waterfall
  // ==========================================================================

  /**
   * Format a timing entry as a waterfall bar
   */
  formatTimingBar(
    entry: TimingEntry,
    totalDuration: number,
    barWidth: number = 40,
  ): string {
    const duration = entry.duration ?? (entry.endTime ? entry.endTime - entry.startTime : 0);
    const percentage = totalDuration > 0 ? (duration / totalDuration) * 100 : 0;
    const filledWidth = Math.round((percentage / 100) * barWidth);
    const emptyWidth = barWidth - filledWidth;

    const bar = this.applyColor('#'.repeat(filledWidth), getModuleColor(entry.module)) +
      this.applyColor('.'.repeat(emptyWidth), Colors.dim);

    const durationStr = this.formatDuration(duration);
    const percentStr = `${percentage.toFixed(1)}%`.padStart(6);

    return `${bar} ${durationStr} ${percentStr}`;
  }

  /**
   * Format complete timing waterfall
   */
  formatWaterfall(entries: TimingEntry[], title?: string): string {
    const lines: string[] = [];

    if (title) {
      lines.push(this.formatHeader(title, Icons.time));
    }

    const totalDuration = entries.reduce((sum, e) => {
      return sum + (e.duration ?? (e.endTime ? e.endTime - e.startTime : 0));
    }, 0);

    // Find max name length for alignment
    const maxNameLen = Math.max(...entries.map((e) => e.name.length), 20);

    for (const entry of entries) {
      const icon = this.getIcon(getModuleIcon(entry.module));
      const name = entry.name.padEnd(maxNameLen);
      const bar = this.formatTimingBar(entry, totalDuration);
      lines.push(`  ${icon}${this.applyColor(name, getModuleColor(entry.module))} ${bar}`);

      // Format children with indentation
      for (const child of entry.children) {
        const childIcon = this.getIcon(getModuleIcon(child.module));
        const childName = `  ${Icons.branch} ${child.name}`.padEnd(maxNameLen);
        const childBar = this.formatTimingBar(child, totalDuration, 30);
        lines.push(`    ${childIcon}${this.applyColor(childName, Colors.dim)} ${childBar}`);
      }
    }

    lines.push(
      this.applyColor(
        `  Total: ${this.formatDuration(totalDuration)}`,
        Colors.bold,
      ),
    );

    if (title) {
      lines.push(this.formatFooter());
    }

    return lines.join('\n');
  }

  /**
   * Format duration in human readable form
   */
  formatDuration(ms: number): string {
    if (ms < 1) {
      return this.applyColor(`${(ms * 1000).toFixed(0)}us`, Colors.green);
    }
    if (ms < 100) {
      return this.applyColor(`${ms.toFixed(2)}ms`, Colors.green);
    }
    if (ms < 1000) {
      return this.applyColor(`${ms.toFixed(1)}ms`, Colors.yellow);
    }
    return this.applyColor(`${(ms / 1000).toFixed(2)}s`, Colors.red);
  }

  // ==========================================================================
  // Request/Response Formatting
  // ==========================================================================

  /**
   * Format HTTP request summary
   */
  formatRequest(
    method: string,
    url: string,
    headers?: Record<string, string>,
  ): string {
    const methodColors: Record<string, string> = {
      GET: Colors.green,
      POST: Colors.blue,
      PUT: Colors.yellow,
      PATCH: Colors.cyan,
      DELETE: Colors.red,
    };

    const methodColor = methodColors[method] ?? Colors.white;
    const lines: string[] = [];

    lines.push(
      `${this.getIcon(Icons.request)}${this.applyColor(method.padEnd(7), methodColor + Colors.bold)} ${url}`,
    );

    if (headers) {
      const importantHeaders = ['content-type', 'authorization', 'accept', 'user-agent'];
      for (const [key, value] of Object.entries(headers)) {
        if (importantHeaders.includes(key.toLowerCase())) {
          const maskedValue = key.toLowerCase() === 'authorization'
            ? value.slice(0, 10) + '...'
            : value;
          lines.push(
            `  ${this.applyColor(key, Colors.dim)}: ${maskedValue}`,
          );
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Format HTTP response summary
   */
  formatResponse(
    status: number,
    duration: number,
    size?: number,
  ): string {
    let statusColor: string = Colors.green;
    if (status >= 400) statusColor = Colors.red;
    else if (status >= 300) statusColor = Colors.yellow;

    const parts: string[] = [];
    parts.push(
      `${this.getIcon(Icons.response)}${this.applyColor(String(status), statusColor + Colors.bold)}`,
    );
    parts.push(this.formatDuration(duration));

    if (size !== undefined) {
      parts.push(this.formatBytes(size));
    }

    return parts.join(' ');
  }

  /**
   * Format byte size
   */
  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  }

  // ==========================================================================
  // Table Formatting
  // ==========================================================================

  /**
   * Format data as a table
   */
  formatTable(
    headers: string[],
    rows: (string | number | boolean)[][],
  ): string {
    // Calculate column widths
    const colWidths = headers.map((h, i) => {
      const maxRowWidth = Math.max(...rows.map((r) => String(r[i] ?? '').length));
      return Math.max(h.length, maxRowWidth);
    });

    const lines: string[] = [];

    // Header
    const headerRow = headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ');
    lines.push(this.applyColor(headerRow, Colors.bold));

    // Separator
    const separator = colWidths.map((w) => '-'.repeat(w)).join('-+-');
    lines.push(this.applyColor(separator, Colors.dim));

    // Rows
    for (const row of rows) {
      const formattedRow = row.map((cell, i) => String(cell ?? '').padEnd(colWidths[i])).join(' | ');
      lines.push(formattedRow);
    }

    return lines.join('\n');
  }

  // ==========================================================================
  // Box Drawing
  // ==========================================================================

  /**
   * Draw content in a box
   */
  formatBox(content: string, title?: string): string {
    const lines = content.split('\n');
    const maxLen = Math.max(...lines.map((l) => l.length), title?.length ?? 0);
    const width = Math.min(maxLen + 2, this.options.maxWidth - 4);

    const result: string[] = [];

    // Top border
    const topBorder = title
      ? `+-- ${title} ${'-'.repeat(Math.max(0, width - title.length - 5))}+`
      : `+${'-'.repeat(width)}+`;
    result.push(this.applyColor(topBorder, Colors.dim));

    // Content
    for (const line of lines) {
      const paddedLine = line.padEnd(width - 2);
      result.push(`${this.applyColor('|', Colors.dim)} ${paddedLine} ${this.applyColor('|', Colors.dim)}`);
    }

    // Bottom border
    result.push(this.applyColor(`+${'-'.repeat(width)}+`, Colors.dim));

    return result.join('\n');
  }

  // ==========================================================================
  // Progress Indicators
  // ==========================================================================

  /**
   * Format a progress bar
   */
  formatProgress(current: number, total: number, width: number = 30): string {
    const percentage = total > 0 ? (current / total) * 100 : 0;
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;

    const bar = this.applyColor('#'.repeat(filled), Colors.green) +
      this.applyColor('.'.repeat(empty), Colors.dim);

    return `[${bar}] ${percentage.toFixed(0)}%`;
  }

  /**
   * Format a spinner frame (for animation)
   */
  formatSpinner(frame: number): string {
    const frames = ['|', '/', '-', '\\'];
    return this.applyColor(frames[frame % frames.length], Colors.cyan);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultOutput: DebugOutput | null = null;

/**
 * Get the default debug output instance
 */
export function getDebugOutput(): DebugOutput {
  if (!defaultOutput) {
    defaultOutput = new DebugOutput();
  }
  return defaultOutput;
}

/**
 * Create a new debug output instance
 */
export function createDebugOutput(options?: Partial<OutputOptions>): DebugOutput {
  return new DebugOutput(options);
}
