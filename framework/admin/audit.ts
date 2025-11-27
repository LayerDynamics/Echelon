/**
 * Admin Audit Logging
 *
 * Provides comprehensive audit logging for all admin actions.
 * Supports persistence via Deno KV, filtering, retention policies,
 * and viewing endpoints.
 */

import { getKV } from '../orm/kv.ts';
import { getLogger } from '../telemetry/logger.ts';
import type { EchelonRequest } from '../http/request.ts';
import type { EchelonResponse } from '../http/response.ts';

const logger = getLogger();

// ============================================================================
// Types
// ============================================================================

/**
 * Audit action categories
 */
export type AuditActionCategory =
  | 'auth'           // Authentication actions (login, logout, etc.)
  | 'user'           // User management actions
  | 'data'           // Data operations (CRUD)
  | 'config'         // Configuration changes
  | 'system'         // System operations
  | 'security'       // Security-related actions
  | 'access'         // Access control changes
  | 'export'         // Data exports
  | 'import';        // Data imports

/**
 * Audit action types
 */
export type AuditActionType =
  // Auth actions
  | 'login'
  | 'logout'
  | 'login_failed'
  | 'password_change'
  | 'password_reset'
  | 'session_expired'
  // User actions
  | 'user_create'
  | 'user_update'
  | 'user_delete'
  | 'user_disable'
  | 'user_enable'
  | 'role_assign'
  | 'role_revoke'
  // Data actions
  | 'record_create'
  | 'record_update'
  | 'record_delete'
  | 'bulk_create'
  | 'bulk_update'
  | 'bulk_delete'
  // Config actions
  | 'config_update'
  | 'feature_toggle'
  // System actions
  | 'system_start'
  | 'system_stop'
  | 'cache_clear'
  | 'job_trigger'
  // Security actions
  | 'permission_grant'
  | 'permission_revoke'
  | 'ip_block'
  | 'ip_unblock'
  // Export/Import
  | 'export_data'
  | 'import_data'
  // Generic
  | 'custom';

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  category: AuditActionCategory;
  action: AuditActionType;
  userId?: string;
  username?: string;
  ipAddress?: string;
  userAgent?: string;
  resource?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  changes?: AuditChange[];
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Audit change record (before/after values)
 */
export interface AuditChange {
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
}

/**
 * Audit log query filters
 */
export interface AuditLogFilter {
  userId?: string;
  username?: string;
  category?: AuditActionCategory;
  action?: AuditActionType;
  resource?: string;
  resourceId?: string;
  success?: boolean;
  startDate?: Date;
  endDate?: Date;
  ipAddress?: string;
}

/**
 * Audit log query options
 */
export interface AuditLogQueryOptions {
  filter?: AuditLogFilter;
  limit?: number;
  offset?: number;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Audit log retention policy
 */
export interface AuditRetentionPolicy {
  maxAge?: number;           // Max age in days
  maxEntries?: number;       // Max total entries
  minEntries?: number;       // Minimum entries to keep regardless of age
  categories?: Record<AuditActionCategory, number>;  // Per-category retention in days
}

/**
 * Audit logger configuration
 */
export interface AuditLoggerConfig {
  enabled?: boolean;
  kvPrefix?: string;
  retention?: AuditRetentionPolicy;
  sensitiveFields?: string[];  // Fields to redact in logs
  asyncWrite?: boolean;        // Write logs asynchronously
  batchSize?: number;          // Number of entries to batch before flushing
  flushInterval?: number;      // Milliseconds between automatic flushes
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: Required<AuditLoggerConfig> = {
  enabled: true,
  kvPrefix: 'audit',
  retention: {
    maxAge: 90,            // 90 days default
    maxEntries: 100000,    // 100k entries max
    minEntries: 1000,      // Keep at least 1000 entries
  },
  sensitiveFields: ['password', 'token', 'secret', 'key', 'credential'],
  asyncWrite: true,
  batchSize: 10,           // Batch 10 entries before flushing
  flushInterval: 1000,     // Flush every 1 second
};

const KV_KEYS = {
  ENTRY: (id: string) => ['audit', 'entry', id],
  BY_USER: (userId: string, timestamp: number, id: string) => ['audit', 'by_user', userId, timestamp, id],
  BY_CATEGORY: (category: string, timestamp: number, id: string) => ['audit', 'by_category', category, timestamp, id],
  BY_RESOURCE: (resource: string, resourceId: string, timestamp: number, id: string) =>
    ['audit', 'by_resource', resource, resourceId, timestamp, id],
  BY_TIME: (timestamp: number, id: string) => ['audit', 'by_time', timestamp, id],
  STATS: () => ['audit', 'stats'],
};

// ============================================================================
// AuditLogger Class
// ============================================================================

/**
 * Audit logger for admin actions
 */
export class AuditLogger {
  private config: Required<AuditLoggerConfig>;
  private writeQueue: AuditLogEntry[] = [];
  private flushTimer: number | null = null;
  private isProcessing = false;

  constructor(config: AuditLoggerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Log an audit event
   */
  async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<string> {
    if (!this.config.enabled) {
      return '';
    }

    const fullEntry: AuditLogEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date(),
      details: this.redactSensitiveFields(entry.details),
    };

    if (this.config.asyncWrite) {
      this.queueWrite(fullEntry);
    } else {
      await this.writeEntry(fullEntry);
    }

    logger.debug('Audit log created', {
      id: fullEntry.id,
      category: fullEntry.category,
      action: fullEntry.action,
      userId: fullEntry.userId,
    });

    return fullEntry.id;
  }

  /**
   * Log from an HTTP request context
   */
  async logFromRequest(
    req: EchelonRequest,
    action: AuditActionType,
    category: AuditActionCategory,
    details?: Record<string, unknown>
  ): Promise<string> {
    return this.log({
      category,
      action,
      userId: req?.state?.get?.('userId') as string | undefined,
      username: req?.state?.get?.('username') as string | undefined,
      ipAddress: this.getClientIP(req),
      userAgent: req?.headers?.get?.('user-agent') ?? undefined,
      success: true,
      details,
    });
  }

  /**
   * Log an error event
   */
  async logError(
    action: AuditActionType,
    category: AuditActionCategory,
    error: Error | string,
    req?: EchelonRequest,
    details?: Record<string, unknown>
  ): Promise<string> {
    return this.log({
      category,
      action,
      userId: req?.state?.get('userId') as string | undefined,
      username: req?.state?.get('username') as string | undefined,
      ipAddress: req ? this.getClientIP(req) : undefined,
      userAgent: req?.headers.get('user-agent') ?? undefined,
      success: false,
      error: error instanceof Error ? error.message : error,
      details,
    });
  }

  /**
   * Log data changes
   */
  async logDataChange(
    action: AuditActionType,
    resource: string,
    resourceId: string,
    changes: AuditChange[],
    req?: EchelonRequest
  ): Promise<string> {
    return this.log({
      category: 'data',
      action,
      resource,
      resourceId,
      changes: this.redactChanges(changes),
      userId: req?.state?.get('userId') as string | undefined,
      username: req?.state?.get('username') as string | undefined,
      ipAddress: req ? this.getClientIP(req) : undefined,
      userAgent: req?.headers.get('user-agent') ?? undefined,
      success: true,
    });
  }

  /**
   * Query audit logs
   */
  async query(options: AuditLogQueryOptions = {}): Promise<{
    entries: AuditLogEntry[];
    total: number;
    hasMore: boolean;
  }> {
    const kv = await getKV();
    const filter = options.filter ?? {};
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    const sortOrder = options.sortOrder ?? 'desc';

    const entries: AuditLogEntry[] = [];
    const listOptions: Deno.KvListOptions = {
      limit: limit + offset + 1,
      reverse: sortOrder === 'desc',
    };

    // Choose the best index based on filters
    let prefix: Deno.KvKey;
    if (filter.userId) {
      prefix = ['audit', 'by_user', filter.userId];
    } else if (filter.category) {
      prefix = ['audit', 'by_category', filter.category];
    } else if (filter.resource && filter.resourceId) {
      prefix = ['audit', 'by_resource', filter.resource, filter.resourceId];
    } else {
      prefix = ['audit', 'by_time'];
    }

    // Fetch entries using KVStore wrapper
    const items = await kv.list<string>(prefix, listOptions);
    let skipped = 0;

    for (const item of items) {
      // Skip offset entries
      if (skipped < offset) {
        skipped++;
        continue;
      }

      // Stop at limit
      if (entries.length >= limit + 1) break;

      // Fetch full entry
      const entryId = item.value;
      const entry = await kv.get<AuditLogEntry>(KV_KEYS.ENTRY(entryId));

      if (entry) {
        // Apply additional filters
        if (this.matchesFilter(entry, filter)) {
          entries.push(entry);
        }
      }
    }

    const hasMore = entries.length > limit;
    if (hasMore) {
      entries.pop();
    }

    return {
      entries,
      total: entries.length,
      hasMore,
    };
  }

  /**
   * Get a single audit entry by ID
   */
  async getEntry(id: string): Promise<AuditLogEntry | null> {
    const kv = await getKV();
    return await kv.get<AuditLogEntry>(KV_KEYS.ENTRY(id));
  }

  /**
   * Get audit statistics
   */
  async getStats(): Promise<{
    totalEntries: number;
    entriesByCategory: Record<string, number>;
    entriesByAction: Record<string, number>;
    recentFailures: number;
    oldestEntry?: Date;
    newestEntry?: Date;
  }> {
    const kv = await getKV();
    const stats = await kv.get<{
      totalEntries: number;
      entriesByCategory: Record<string, number>;
      entriesByAction: Record<string, number>;
      recentFailures: number;
      oldestTimestamp?: number;
      newestTimestamp?: number;
    }>(KV_KEYS.STATS());

    const defaultStats: {
      totalEntries: number;
      entriesByCategory: Record<string, number>;
      entriesByAction: Record<string, number>;
      recentFailures: number;
      oldestTimestamp?: number;
      newestTimestamp?: number;
    } = {
      totalEntries: 0,
      entriesByCategory: {},
      entriesByAction: {},
      recentFailures: 0,
    };

    const finalStats = stats ?? defaultStats;

    return {
      totalEntries: finalStats.totalEntries,
      entriesByCategory: finalStats.entriesByCategory,
      entriesByAction: finalStats.entriesByAction,
      recentFailures: finalStats.recentFailures,
      oldestEntry: finalStats.oldestTimestamp ? new Date(finalStats.oldestTimestamp) : undefined,
      newestEntry: finalStats.newestTimestamp ? new Date(finalStats.newestTimestamp) : undefined,
    };
  }

  /**
   * Apply retention policy and cleanup old entries
   */
  async applyRetention(): Promise<{ deleted: number; retained: number }> {
    const kv = await getKV();
    const retention = this.config.retention;
    const now = Date.now();
    let deleted = 0;
    let retained = 0;

    // Get all entries sorted by time
    const items = await kv.list<string>(['audit', 'by_time']);
    const entries: { id: string; timestamp: number }[] = items.map(item => ({
      id: item.value,
      timestamp: item.key[2] as number,
    }));

    // Sort oldest first
    entries.sort((a, b) => a.timestamp - b.timestamp);

    // Check max entries limit
    const entriesToDelete: string[] = [];

    if (retention.maxEntries && entries.length > retention.maxEntries) {
      const excess = entries.length - retention.maxEntries;
      const protectedCount = retention.minEntries ?? 0;

      for (let i = 0; i < excess && i < entries.length - protectedCount; i++) {
        entriesToDelete.push(entries[i].id);
      }
    }

    // Check max age
    if (retention.maxAge) {
      const maxAgeMs = retention.maxAge * 24 * 60 * 60 * 1000;
      const cutoff = now - maxAgeMs;
      const protectedCount = retention.minEntries ?? 0;

      for (const entry of entries) {
        if (entry.timestamp < cutoff && !entriesToDelete.includes(entry.id)) {
          // Check if we'd go below minimum
          if (entries.length - entriesToDelete.length > protectedCount) {
            entriesToDelete.push(entry.id);
          }
        }
      }
    }

    // Delete entries
    for (const id of entriesToDelete) {
      await this.deleteEntry(id);
      deleted++;
    }

    retained = entries.length - deleted;

    logger.info('Audit retention applied', { deleted, retained });

    return { deleted, retained };
  }

  /**
   * Delete a single audit entry
   */
  private async deleteEntry(id: string): Promise<void> {
    const kv = await getKV();
    const rawKv = kv.raw;  // Get raw Deno.Kv for atomic operations
    const entry = await this.getEntry(id);
    if (!entry) return;

    const timestamp = entry.timestamp.getTime();
    const atomic = rawKv.atomic();

    // Delete main entry
    atomic.delete(KV_KEYS.ENTRY(id));

    // Delete from time index
    atomic.delete(KV_KEYS.BY_TIME(timestamp, id));

    // Delete from user index
    if (entry.userId) {
      atomic.delete(KV_KEYS.BY_USER(entry.userId, timestamp, id));
    }

    // Delete from category index
    atomic.delete(KV_KEYS.BY_CATEGORY(entry.category, timestamp, id));

    // Delete from resource index
    if (entry.resource && entry.resourceId) {
      atomic.delete(KV_KEYS.BY_RESOURCE(entry.resource, entry.resourceId, timestamp, id));
    }

    await atomic.commit();
  }

  /**
   * Flush pending writes
   */
  async flush(): Promise<void> {
    if (this.writeQueue.length === 0) return;

    const entries = [...this.writeQueue];
    this.writeQueue = [];

    for (const entry of entries) {
      await this.writeEntry(entry);
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Queue an entry for async writing
   */
  private queueWrite(entry: AuditLogEntry): void {
    this.writeQueue.push(entry);

    // Schedule flush if not already scheduled
    if (!this.flushTimer && !this.isProcessing) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.processQueue();
      }, 100);
    }
  }

  /**
   * Process the write queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.writeQueue.length === 0) return;

    this.isProcessing = true;
    try {
      await this.flush();
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Write an entry to KV store
   */
  private async writeEntry(entry: AuditLogEntry): Promise<void> {
    const kv = await getKV();
    const rawKv = kv.raw;  // Get raw Deno.Kv for atomic operations
    const timestamp = entry.timestamp.getTime();
    const atomic = rawKv.atomic();

    // Store main entry
    atomic.set(KV_KEYS.ENTRY(entry.id), entry);

    // Index by time
    atomic.set(KV_KEYS.BY_TIME(timestamp, entry.id), entry.id);

    // Index by user
    if (entry.userId) {
      atomic.set(KV_KEYS.BY_USER(entry.userId, timestamp, entry.id), entry.id);
    }

    // Index by category
    atomic.set(KV_KEYS.BY_CATEGORY(entry.category, timestamp, entry.id), entry.id);

    // Index by resource
    if (entry.resource && entry.resourceId) {
      atomic.set(KV_KEYS.BY_RESOURCE(entry.resource, entry.resourceId, timestamp, entry.id), entry.id);
    }

    await atomic.commit();

    // Update stats (async, don't await)
    this.updateStats(entry).catch(err => {
      logger.warn('Failed to update audit stats', { error: err.message });
    });
  }

  /**
   * Update statistics
   */
  private async updateStats(entry: AuditLogEntry): Promise<void> {
    const kv = await getKV();
    const rawKv = kv.raw;  // Get raw Deno.Kv for atomic operations
    const statsKey = KV_KEYS.STATS();

    // Retry loop for atomic updates
    for (let i = 0; i < 3; i++) {
      const result = await rawKv.get<{
        totalEntries: number;
        entriesByCategory: Record<string, number>;
        entriesByAction: Record<string, number>;
        recentFailures: number;
        oldestTimestamp?: number;
        newestTimestamp?: number;
      }>(statsKey);

      const stats = result.value ?? {
        totalEntries: 0,
        entriesByCategory: {},
        entriesByAction: {},
        recentFailures: 0,
      };

      stats.totalEntries++;
      stats.entriesByCategory[entry.category] = (stats.entriesByCategory[entry.category] ?? 0) + 1;
      stats.entriesByAction[entry.action] = (stats.entriesByAction[entry.action] ?? 0) + 1;

      if (!entry.success) {
        stats.recentFailures++;
      }

      const timestamp = entry.timestamp.getTime();
      if (!stats.oldestTimestamp || timestamp < stats.oldestTimestamp) {
        stats.oldestTimestamp = timestamp;
      }
      if (!stats.newestTimestamp || timestamp > stats.newestTimestamp) {
        stats.newestTimestamp = timestamp;
      }

      const commitResult = await rawKv.atomic()
        .check(result)
        .set(statsKey, stats)
        .commit();

      if (commitResult.ok) break;
    }
  }

  /**
   * Check if entry matches filter
   */
  private matchesFilter(entry: AuditLogEntry, filter: AuditLogFilter): boolean {
    if (filter.userId && entry.userId !== filter.userId) return false;
    if (filter.username && entry.username !== filter.username) return false;
    if (filter.category && entry.category !== filter.category) return false;
    if (filter.action && entry.action !== filter.action) return false;
    if (filter.resource && entry.resource !== filter.resource) return false;
    if (filter.resourceId && entry.resourceId !== filter.resourceId) return false;
    if (filter.success !== undefined && entry.success !== filter.success) return false;
    if (filter.ipAddress && entry.ipAddress !== filter.ipAddress) return false;

    if (filter.startDate && entry.timestamp < filter.startDate) return false;
    if (filter.endDate && entry.timestamp > filter.endDate) return false;

    return true;
  }

  /**
   * Redact sensitive fields from details
   */
  private redactSensitiveFields(details?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!details) return undefined;

    const redacted = { ...details };
    for (const field of this.config.sensitiveFields) {
      if (field in redacted) {
        redacted[field] = '[REDACTED]';
      }
    }
    return redacted;
  }

  /**
   * Redact sensitive values from changes
   */
  private redactChanges(changes: AuditChange[]): AuditChange[] {
    return changes.map(change => {
      if (this.config.sensitiveFields.includes(change.field)) {
        return {
          field: change.field,
          oldValue: change.oldValue !== undefined ? '[REDACTED]' : undefined,
          newValue: change.newValue !== undefined ? '[REDACTED]' : undefined,
        };
      }
      return change;
    });
  }

  /**
   * Extract client IP from request
   */
  private getClientIP(req: EchelonRequest): string {
    // Safety check for missing headers
    if (!req?.headers?.get) {
      return 'unknown';
    }

    // Check common proxy headers
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }

    const realIP = req.headers.get('x-real-ip');
    if (realIP) {
      return realIP;
    }

    // Fall back to connection info if available
    return req.headers.get('cf-connecting-ip') ?? 'unknown';
  }
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Create audit log route handlers
 */
export function createAuditRoutes(auditLogger: AuditLogger) {
  return {
    /**
     * List audit logs with filtering
     */
    async list(req: EchelonRequest, res: EchelonResponse): Promise<Response> {
      const url = new URL(req.url);
      const params = url.searchParams;

      const filter: AuditLogFilter = {};
      if (params.has('userId')) filter.userId = params.get('userId')!;
      if (params.has('username')) filter.username = params.get('username')!;
      if (params.has('category')) filter.category = params.get('category') as AuditActionCategory;
      if (params.has('action')) filter.action = params.get('action') as AuditActionType;
      if (params.has('resource')) filter.resource = params.get('resource')!;
      if (params.has('success')) filter.success = params.get('success') === 'true';
      if (params.has('startDate')) filter.startDate = new Date(params.get('startDate')!);
      if (params.has('endDate')) filter.endDate = new Date(params.get('endDate')!);

      const options: AuditLogQueryOptions = {
        filter,
        limit: parseInt(params.get('limit') ?? '50', 10),
        offset: parseInt(params.get('offset') ?? '0', 10),
        sortOrder: (params.get('sort') as 'asc' | 'desc') ?? 'desc',
      };

      const result = await auditLogger.query(options);

      // Log this access
      await auditLogger.logFromRequest(req, 'custom', 'access', {
        resource: 'audit_logs',
        action: 'list',
        filter,
      });

      return res.json(result);
    },

    /**
     * Get a single audit entry
     */
    async get(req: EchelonRequest, res: EchelonResponse): Promise<Response> {
      const id = req.params.id;
      if (!id) {
        return res.badRequest('Missing audit entry ID');
      }

      const entry = await auditLogger.getEntry(id);
      if (!entry) {
        return res.notFound('Audit entry not found');
      }

      return res.json(entry);
    },

    /**
     * Get audit statistics
     */
    async stats(_req: EchelonRequest, res: EchelonResponse): Promise<Response> {
      const stats = await auditLogger.getStats();
      return res.json(stats);
    },

    /**
     * Trigger retention cleanup
     */
    async cleanup(req: EchelonRequest, res: EchelonResponse): Promise<Response> {
      const result = await auditLogger.applyRetention();

      await auditLogger.logFromRequest(req, 'custom', 'system', {
        resource: 'audit_logs',
        action: 'cleanup',
        ...result,
      });

      return res.json({
        success: true,
        ...result,
      });
    },

    /**
     * Export audit logs
     */
    async export(req: EchelonRequest, res: EchelonResponse): Promise<Response> {
      const url = new URL(req.url);
      const format = url.searchParams.get('format') ?? 'json';

      // Get all matching entries (up to a reasonable limit)
      const result = await auditLogger.query({ limit: 10000 });

      await auditLogger.logFromRequest(req, 'export_data', 'export', {
        resource: 'audit_logs',
        format,
        count: result.entries.length,
      });

      if (format === 'csv') {
        const csv = auditEntriesToCSV(result.entries);
        return new Response(csv, {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename="audit_log.csv"',
          },
        });
      }

      return res.json(result.entries);
    },
  };
}

/**
 * Convert audit entries to CSV format
 */
function auditEntriesToCSV(entries: AuditLogEntry[]): string {
  const headers = [
    'id',
    'timestamp',
    'category',
    'action',
    'userId',
    'username',
    'ipAddress',
    'resource',
    'resourceId',
    'success',
    'error',
  ];

  const rows = entries.map(entry => [
    entry.id,
    entry.timestamp.toISOString(),
    entry.category,
    entry.action,
    entry.userId ?? '',
    entry.username ?? '',
    entry.ipAddress ?? '',
    entry.resource ?? '',
    entry.resourceId ?? '',
    entry.success ? 'true' : 'false',
    entry.error ?? '',
  ]);

  return [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
  ].join('\n');
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new audit logger instance
 */
export function createAuditLogger(config?: AuditLoggerConfig): AuditLogger {
  return new AuditLogger(config);
}

// ============================================================================
// Global Instance
// ============================================================================

let globalAuditLogger: AuditLogger | null = null;

/**
 * Get the global audit logger instance
 */
export function getAuditLogger(): AuditLogger {
  if (!globalAuditLogger) {
    globalAuditLogger = new AuditLogger();
  }
  return globalAuditLogger;
}

/**
 * Set the global audit logger instance
 */
export function setAuditLogger(logger: AuditLogger): void {
  globalAuditLogger = logger;
}
