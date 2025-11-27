/**
 * Admin Data Import/Export Module
 *
 * Provides comprehensive data management capabilities:
 * - Export KV data to JSON/CSV formats
 * - Import data with validation and conflict resolution
 * - Bulk operations with confirmation tokens
 * - Data migration utilities
 * - Backup/restore functionality
 */

import { KVStore, getKV } from '../orm/kv.ts';
import { getLogger, Logger } from '../telemetry/logger.ts';
import { AuditLogger } from './audit.ts';
import type { EchelonRequest } from '../http/request.ts';
import type { EchelonResponse } from '../http/response.ts';
import type { RouteHandler, Context } from '../http/types.ts';

const logger: Logger = getLogger();

// ============================================================================
// Types
// ============================================================================

export type ExportFormat = 'json' | 'csv' | 'ndjson';

export interface ExportOptions {
  format?: ExportFormat;
  prefix?: Deno.KvKey;
  includeMetadata?: boolean;
  compress?: boolean;
  limit?: number;
  filter?: (key: Deno.KvKey, value: unknown) => boolean;
}

export interface ExportResult {
  success: boolean;
  format: ExportFormat;
  recordCount: number;
  data?: string | Uint8Array;
  error?: string;
  exportedAt: Date;
  prefix?: Deno.KvKey;
}

export interface ImportOptions {
  format?: ExportFormat;
  validateSchema?: boolean;
  onConflict?: 'skip' | 'replace' | 'error' | 'merge';
  dryRun?: boolean;
  batchSize?: number;
  transform?: (key: Deno.KvKey, value: unknown) => { key: Deno.KvKey; value: unknown } | null;
}

export interface ImportResult {
  success: boolean;
  totalRecords: number;
  imported: number;
  skipped: number;
  errors: Array<{ key: string; error: string }>;
  dryRun: boolean;
  importedAt: Date;
}

export interface BulkDeleteOptions {
  prefix: Deno.KvKey;
  filter?: (key: Deno.KvKey, value: unknown) => boolean;
  confirmationToken?: string;
  dryRun?: boolean;
  batchSize?: number;
}

export interface BulkDeleteResult {
  success: boolean;
  deleted: number;
  confirmationToken?: string;
  requiresConfirmation: boolean;
  dryRun: boolean;
  deletedAt?: Date;
}

export interface MigrationDefinition {
  id: string;
  name: string;
  version: number;
  up: (kv: KVStore) => Promise<void>;
  down: (kv: KVStore) => Promise<void>;
}

export interface MigrationStatus {
  id: string;
  name: string;
  version: number;
  appliedAt: Date;
  success: boolean;
  error?: string;
}

export interface BackupMetadata {
  id: string;
  createdAt: Date;
  recordCount: number;
  sizeBytes: number;
  compressed: boolean;
  checksum: string;
  prefix?: Deno.KvKey;
  description?: string;
}

export interface RestoreOptions {
  backupId: string;
  clearExisting?: boolean;
  prefix?: Deno.KvKey;
  validateChecksum?: boolean;
}

export interface RestoreResult {
  success: boolean;
  recordCount: number;
  restoredAt: Date;
  errors: Array<{ key: string; error: string }>;
}

export interface DataRecord {
  key: Deno.KvKey;
  value: unknown;
  versionstamp?: string;
}

// ============================================================================
// Data Manager Class
// ============================================================================

export class DataManager {
  private kv!: KVStore;
  private auditLogger?: AuditLogger;
  private initialized = false;
  private migrations: Map<string, MigrationDefinition> = new Map();

  constructor(kv?: KVStore, auditLogger?: AuditLogger) {
    if (kv) {
      this.kv = kv;
      this.initialized = true;
    }
    this.auditLogger = auditLogger;
  }

  /**
   * Initialize the data manager
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.kv = await getKV();
    this.initialized = true;
    logger.info('DataManager initialized');
  }

  /**
   * Ensure initialization
   */
  private async ensureInit(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  // ==========================================================================
  // Export Methods
  // ==========================================================================

  /**
   * Export data from KV store
   */
  async export(options: ExportOptions = {}): Promise<ExportResult> {
    await this.ensureInit();

    const format = options.format ?? 'json';
    const prefix = options.prefix ?? [];
    const includeMetadata = options.includeMetadata ?? true;

    try {
      const records: DataRecord[] = [];
      const entries = await this.kv.list<unknown>(prefix, { limit: options.limit });

      for (const entry of entries) {
        if (options.filter && !options.filter(entry.key, entry.value)) {
          continue;
        }

        const record: DataRecord = {
          key: entry.key,
          value: entry.value,
        };

        records.push(record);
      }

      let data: string;

      switch (format) {
        case 'json':
          data = this.toJSON(records, includeMetadata);
          break;
        case 'csv':
          data = this.toCSV(records);
          break;
        case 'ndjson':
          data = this.toNDJSON(records);
          break;
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      let finalData: string | Uint8Array = data;

      if (options.compress) {
        finalData = await this.compress(data);
      }

      logger.info('Data export completed', { format, recordCount: records.length });

      return {
        success: true,
        format,
        recordCount: records.length,
        data: finalData,
        exportedAt: new Date(),
        prefix,
      };
    } catch (error) {
      logger.error('Data export failed', error as Error);
      return {
        success: false,
        format,
        recordCount: 0,
        error: (error as Error).message,
        exportedAt: new Date(),
        prefix,
      };
    }
  }

  /**
   * Convert records to JSON format
   */
  private toJSON(records: DataRecord[], includeMetadata: boolean): string {
    const output = {
      ...(includeMetadata && {
        metadata: {
          exportedAt: new Date().toISOString(),
          recordCount: records.length,
          version: '1.0',
        },
      }),
      records,
    };
    return JSON.stringify(output, null, 2);
  }

  /**
   * Convert records to CSV format
   */
  private toCSV(records: DataRecord[]): string {
    const lines: string[] = ['key,value'];

    for (const record of records) {
      const keyStr = JSON.stringify(record.key);
      const valueStr = JSON.stringify(record.value);
      lines.push(`${this.escapeCSV(keyStr)},${this.escapeCSV(valueStr)}`);
    }

    return lines.join('\n');
  }

  /**
   * Convert records to NDJSON (Newline Delimited JSON) format
   */
  private toNDJSON(records: DataRecord[]): string {
    return records.map((r) => JSON.stringify(r)).join('\n');
  }

  /**
   * Escape CSV value
   */
  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Compress data using CompressionStream
   */
  private async compress(data: string): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const stream = new Blob([encoder.encode(data)]).stream();
    const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
    const chunks: Uint8Array[] = [];

    const reader = compressedStream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  /**
   * Decompress data
   */
  private async decompress(data: Uint8Array): Promise<string> {
    const stream = new Blob([data as BlobPart]).stream();
    const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
    const chunks: Uint8Array[] = [];

    const reader = decompressedStream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return new TextDecoder().decode(result);
  }

  // ==========================================================================
  // Import Methods
  // ==========================================================================

  /**
   * Import data into KV store
   */
  async import(data: string | Uint8Array, options: ImportOptions = {}): Promise<ImportResult> {
    await this.ensureInit();

    const format = options.format ?? 'json';
    const onConflict = options.onConflict ?? 'skip';
    const dryRun = options.dryRun ?? false;
    const batchSize = options.batchSize ?? 100;

    const result: ImportResult = {
      success: true,
      totalRecords: 0,
      imported: 0,
      skipped: 0,
      errors: [],
      dryRun,
      importedAt: new Date(),
    };

    try {
      // Decompress if needed
      let stringData: string;
      if (data instanceof Uint8Array) {
        try {
          stringData = await this.decompress(data);
        } catch {
          stringData = new TextDecoder().decode(data);
        }
      } else {
        stringData = data;
      }

      // Parse records based on format
      let records: DataRecord[];
      switch (format) {
        case 'json':
          records = this.parseJSON(stringData);
          break;
        case 'csv':
          records = this.parseCSV(stringData);
          break;
        case 'ndjson':
          records = this.parseNDJSON(stringData);
          break;
        default:
          throw new Error(`Unsupported import format: ${format}`);
      }

      result.totalRecords = records.length;

      // Process in batches
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);

        for (const record of batch) {
          try {
            // Apply transform if provided
            let finalRecord = record;
            if (options.transform) {
              const transformed = options.transform(record.key, record.value);
              if (transformed === null) {
                result.skipped++;
                continue;
              }
              finalRecord = { key: transformed.key, value: transformed.value };
            }

            // Check for existing value
            const existing = await this.kv.get<unknown>(finalRecord.key);

            if (existing !== null) {
              switch (onConflict) {
                case 'skip':
                  result.skipped++;
                  continue;
                case 'error':
                  throw new Error(`Key already exists: ${JSON.stringify(finalRecord.key)}`);
                case 'merge':
                  if (
                    typeof existing === 'object' &&
                    existing !== null &&
                    typeof finalRecord.value === 'object' &&
                    finalRecord.value !== null
                  ) {
                    finalRecord = {
                      key: finalRecord.key,
                      value: { ...existing, ...finalRecord.value },
                    };
                  }
                  break;
                case 'replace':
                  // Continue with replacement
                  break;
              }
            }

            // Import the record
            if (!dryRun) {
              await this.kv.set(finalRecord.key, finalRecord.value);
            }

            result.imported++;
          } catch (error) {
            result.errors.push({
              key: JSON.stringify(record.key),
              error: (error as Error).message,
            });
          }
        }
      }

      if (result.errors.length > 0) {
        result.success = false;
      }

      logger.info('Data import completed', {
        format,
        total: result.totalRecords,
        imported: result.imported,
        skipped: result.skipped,
        errors: result.errors.length,
        dryRun,
      });

      return result;
    } catch (error) {
      logger.error('Data import failed', error as Error);
      result.success = false;
      result.errors.push({
        key: 'parse',
        error: (error as Error).message,
      });
      return result;
    }
  }

  /**
   * Parse JSON format
   */
  private parseJSON(data: string): DataRecord[] {
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed.records && Array.isArray(parsed.records)) {
      return parsed.records;
    }
    throw new Error('Invalid JSON format: expected array or object with records array');
  }

  /**
   * Parse CSV format
   */
  private parseCSV(data: string): DataRecord[] {
    const lines = data.split('\n').filter((line) => line.trim());
    const records: DataRecord[] = [];

    // Skip header
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      if (values.length >= 2) {
        try {
          records.push({
            key: JSON.parse(values[0]),
            value: JSON.parse(values[1]),
          });
        } catch {
          logger.warn('Failed to parse CSV line', { line: i });
        }
      }
    }

    return records;
  }

  /**
   * Parse a single CSV line handling quoted values
   */
  private parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current);
    return values;
  }

  /**
   * Parse NDJSON format
   */
  private parseNDJSON(data: string): DataRecord[] {
    const lines = data.split('\n').filter((line) => line.trim());
    return lines.map((line) => JSON.parse(line));
  }

  // ==========================================================================
  // Bulk Delete Methods
  // ==========================================================================

  /**
   * Perform bulk delete operation
   */
  async bulkDelete(options: BulkDeleteOptions): Promise<BulkDeleteResult> {
    await this.ensureInit();

    const dryRun = options.dryRun ?? false;
    const batchSize = options.batchSize ?? 100;

    try {
      // Get all matching entries
      const entries = await this.kv.list<unknown>(options.prefix);

      const toDelete: Deno.KvKey[] = [];

      for (const entry of entries) {
        if (options.filter && !options.filter(entry.key, entry.value)) {
          continue;
        }
        toDelete.push(entry.key);
      }

      // If no confirmation token and not dry run, generate one
      if (!dryRun && !options.confirmationToken && toDelete.length > 0) {
        const token = crypto.randomUUID();

        // Store pending deletion info temporarily
        await this.kv.set(['_admin', 'pending_delete', token], {
          keys: toDelete,
          createdAt: new Date().toISOString(),
          count: toDelete.length,
          prefix: options.prefix,
        }, { expireIn: 5 * 60 * 1000 }); // 5 minute expiry

        return {
          success: true,
          deleted: 0,
          confirmationToken: token,
          requiresConfirmation: true,
          dryRun: false,
        };
      }

      // Verify confirmation token
      if (options.confirmationToken) {
        const pending = await this.kv.get<{
          keys: Deno.KvKey[];
          count: number;
        }>(['_admin', 'pending_delete', options.confirmationToken]);

        if (!pending) {
          return {
            success: false,
            deleted: 0,
            requiresConfirmation: false,
            dryRun: false,
          };
        }

        // Use stored keys instead
        toDelete.length = 0;
        toDelete.push(...pending.keys);

        // Delete the pending record
        await this.kv.delete(['_admin', 'pending_delete', options.confirmationToken]);
      }

      if (dryRun) {
        return {
          success: true,
          deleted: toDelete.length,
          requiresConfirmation: false,
          dryRun: true,
        };
      }

      // Delete in batches using atomic operations
      let deleted = 0;

      for (let i = 0; i < toDelete.length; i += batchSize) {
        const batch = toDelete.slice(i, i + batchSize);
        const atomic = this.kv.atomic();

        for (const key of batch) {
          atomic.delete(key);
        }

        await atomic.commit();
        deleted += batch.length;
      }

      logger.info('Bulk delete completed', {
        prefix: options.prefix,
        deleted,
      });

      return {
        success: true,
        deleted,
        requiresConfirmation: false,
        dryRun: false,
        deletedAt: new Date(),
      };
    } catch (error) {
      logger.error('Bulk delete failed', error as Error);
      return {
        success: false,
        deleted: 0,
        requiresConfirmation: false,
        dryRun,
      };
    }
  }

  // ==========================================================================
  // Migration Methods
  // ==========================================================================

  /**
   * Register a migration
   */
  registerMigration(migration: MigrationDefinition): void {
    this.migrations.set(migration.id, migration);
  }

  /**
   * Get applied migrations
   */
  async getAppliedMigrations(): Promise<MigrationStatus[]> {
    await this.ensureInit();

    const entries = await this.kv.list<MigrationStatus>(['_migrations']);
    return entries.map((e) => e.value);
  }

  /**
   * Apply pending migrations
   */
  async migrate(): Promise<{ applied: string[]; errors: Array<{ id: string; error: string }> }> {
    await this.ensureInit();

    const applied: string[] = [];
    const errors: Array<{ id: string; error: string }> = [];

    const appliedMigrations = await this.getAppliedMigrations();
    const appliedIds = new Set(appliedMigrations.map((m) => m.id));

    // Sort migrations by version
    const pendingMigrations = Array.from(this.migrations.values())
      .filter((m) => !appliedIds.has(m.id))
      .sort((a, b) => a.version - b.version);

    for (const migration of pendingMigrations) {
      try {
        logger.info('Applying migration', { id: migration.id, name: migration.name });

        await migration.up(this.kv);

        const status: MigrationStatus = {
          id: migration.id,
          name: migration.name,
          version: migration.version,
          appliedAt: new Date(),
          success: true,
        };

        await this.kv.set(['_migrations', migration.id], status);
        applied.push(migration.id);

        logger.info('Migration applied', { id: migration.id });
      } catch (error) {
        const errorMessage = (error as Error).message;
        errors.push({ id: migration.id, error: errorMessage });

        const status: MigrationStatus = {
          id: migration.id,
          name: migration.name,
          version: migration.version,
          appliedAt: new Date(),
          success: false,
          error: errorMessage,
        };

        await this.kv.set(['_migrations', migration.id], status);

        logger.error('Migration failed', error as Error, { id: migration.id });
        break; // Stop on first error
      }
    }

    return { applied, errors };
  }

  /**
   * Rollback the last migration
   */
  async rollback(): Promise<{ rolledBack: string | null; error?: string }> {
    await this.ensureInit();

    const appliedMigrations = await this.getAppliedMigrations();

    if (appliedMigrations.length === 0) {
      return { rolledBack: null };
    }

    // Get the last successful migration
    const successfulMigrations = appliedMigrations
      .filter((m) => m.success)
      .sort((a, b) => b.version - a.version);

    if (successfulMigrations.length === 0) {
      return { rolledBack: null };
    }

    const lastMigration = successfulMigrations[0];
    const migrationDef = this.migrations.get(lastMigration.id);

    if (!migrationDef) {
      return {
        rolledBack: null,
        error: `Migration definition not found: ${lastMigration.id}`,
      };
    }

    try {
      logger.info('Rolling back migration', { id: lastMigration.id });

      await migrationDef.down(this.kv);
      await this.kv.delete(['_migrations', lastMigration.id]);

      logger.info('Migration rolled back', { id: lastMigration.id });

      return { rolledBack: lastMigration.id };
    } catch (error) {
      logger.error('Rollback failed', error as Error, { id: lastMigration.id });
      return { rolledBack: null, error: (error as Error).message };
    }
  }

  // ==========================================================================
  // Backup/Restore Methods
  // ==========================================================================

  /**
   * Create a backup
   */
  async createBackup(options: {
    prefix?: Deno.KvKey;
    description?: string;
    compress?: boolean;
  } = {}): Promise<BackupMetadata> {
    await this.ensureInit();

    const backupId = crypto.randomUUID();
    const compress = options.compress ?? true;

    // Export all data
    const exportResult = await this.export({
      format: 'ndjson',
      prefix: options.prefix,
      compress,
    });

    if (!exportResult.success || !exportResult.data) {
      throw new Error(`Backup export failed: ${exportResult.error}`);
    }

    const data = exportResult.data;
    const dataBytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;

    // Calculate checksum
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBytes as BufferSource);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const checksum = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    // Store backup data
    await this.kv.set(['_backups', backupId, 'data'], dataBytes);

    // Store backup metadata
    const metadata: BackupMetadata = {
      id: backupId,
      createdAt: new Date(),
      recordCount: exportResult.recordCount,
      sizeBytes: dataBytes.length,
      compressed: compress,
      checksum,
      prefix: options.prefix,
      description: options.description,
    };

    await this.kv.set(['_backups', backupId, 'metadata'], metadata);

    logger.info('Backup created', { id: backupId, recordCount: metadata.recordCount });

    return metadata;
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<BackupMetadata[]> {
    await this.ensureInit();

    const entries = await this.kv.list<BackupMetadata>(['_backups']);

    // Filter to only get metadata entries
    const metadataEntries = entries.filter((e) => {
      const keyParts = e.key;
      return keyParts[keyParts.length - 1] === 'metadata';
    });

    return metadataEntries.map((e) => e.value).sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Get backup metadata
   */
  async getBackup(backupId: string): Promise<BackupMetadata | null> {
    await this.ensureInit();
    return await this.kv.get<BackupMetadata>(['_backups', backupId, 'metadata']);
  }

  /**
   * Restore from backup
   */
  async restore(options: RestoreOptions): Promise<RestoreResult> {
    await this.ensureInit();

    const validateChecksum = options.validateChecksum ?? true;

    const result: RestoreResult = {
      success: true,
      recordCount: 0,
      restoredAt: new Date(),
      errors: [],
    };

    try {
      // Get backup metadata
      const metadata = await this.kv.get<BackupMetadata>([
        '_backups',
        options.backupId,
        'metadata',
      ]);

      if (!metadata) {
        throw new Error(`Backup not found: ${options.backupId}`);
      }

      // Get backup data
      const data = await this.kv.get<Uint8Array>(['_backups', options.backupId, 'data']);

      if (!data) {
        throw new Error(`Backup data not found: ${options.backupId}`);
      }

      // Validate checksum
      if (validateChecksum) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', data as BufferSource);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const checksum = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

        if (checksum !== metadata.checksum) {
          throw new Error('Backup checksum mismatch - data may be corrupted');
        }
      }

      // Clear existing data if requested
      if (options.clearExisting && options.prefix) {
        await this.bulkDelete({
          prefix: options.prefix,
          confirmationToken: 'internal-restore',
        });
      }

      // Import the backup
      const importResult = await this.import(data, {
        format: 'ndjson',
        onConflict: 'replace',
      });

      result.recordCount = importResult.imported;
      result.success = importResult.success;
      result.errors = importResult.errors;

      logger.info('Backup restored', {
        id: options.backupId,
        recordCount: result.recordCount,
      });

      return result;
    } catch (error) {
      logger.error('Restore failed', error as Error);
      result.success = false;
      result.errors.push({
        key: 'restore',
        error: (error as Error).message,
      });
      return result;
    }
  }

  /**
   * Delete a backup
   */
  async deleteBackup(backupId: string): Promise<boolean> {
    await this.ensureInit();

    try {
      await this.kv.delete(['_backups', backupId, 'data']);
      await this.kv.delete(['_backups', backupId, 'metadata']);

      logger.info('Backup deleted', { id: backupId });
      return true;
    } catch (error) {
      logger.error('Backup deletion failed', error as Error, { id: backupId });
      return false;
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get data statistics
   */
  async getStats(prefix?: Deno.KvKey): Promise<{
    totalRecords: number;
    prefixes: Map<string, number>;
    estimatedSizeBytes: number;
  }> {
    await this.ensureInit();

    const entries = await this.kv.list<unknown>(prefix ?? []);

    let totalRecords = 0;
    let estimatedSize = 0;
    const prefixes = new Map<string, number>();

    for (const entry of entries) {
      totalRecords++;

      // Count by first key segment
      const firstSegment = String(entry.key[0]);
      prefixes.set(firstSegment, (prefixes.get(firstSegment) ?? 0) + 1);

      // Estimate size
      const valueStr = JSON.stringify(entry.value);
      const keyStr = JSON.stringify(entry.key);
      estimatedSize += new TextEncoder().encode(keyStr + valueStr).length;
    }

    return {
      totalRecords,
      prefixes,
      estimatedSizeBytes: estimatedSize,
    };
  }

  /**
   * Clone data from one prefix to another
   */
  async clonePrefix(
    sourcePrefix: Deno.KvKey,
    targetPrefix: Deno.KvKey,
    options: { overwrite?: boolean } = {}
  ): Promise<{ copied: number; skipped: number }> {
    await this.ensureInit();

    const entries = await this.kv.list<unknown>(sourcePrefix);
    let copied = 0;
    let skipped = 0;

    for (const entry of entries) {
      // Build target key by replacing prefix
      const relativePath = entry.key.slice(sourcePrefix.length);
      const targetKey: Deno.KvKey = [...targetPrefix, ...relativePath];

      // Check if target exists
      const existing = await this.kv.get<unknown>(targetKey);

      if (existing !== null && !options.overwrite) {
        skipped++;
        continue;
      }

      await this.kv.set(targetKey, entry.value);
      copied++;
    }

    logger.info('Prefix cloned', { sourcePrefix, targetPrefix, copied, skipped });

    return { copied, skipped };
  }
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Create data management route handlers
 */
export function createDataRoutes(dataManager: DataManager, auditLogger?: AuditLogger): {
  export: RouteHandler;
  import: RouteHandler;
  bulkDelete: RouteHandler;
  confirmDelete: RouteHandler;
  backup: RouteHandler;
  listBackups: RouteHandler;
  restore: RouteHandler;
  stats: RouteHandler;
  migrate: RouteHandler;
  rollback: RouteHandler;
} {
  return {
    export: async (ctx: Context): Promise<Response> => {
      const prefix = ctx.query.get('prefix');
      const format = (ctx.query.get('format') as ExportFormat) ?? 'json';
      const compress = ctx.query.get('compress') === 'true';

      const result = await dataManager.export({
        format,
        prefix: prefix ? prefix.split(',') : undefined,
        compress,
      });

      if (auditLogger && ctx.state.get('user')) {
        await auditLogger.log({
          userId: (ctx.state.get('user') as { id: string }).id,
          action: 'export_data',
          category: 'export',
          details: { format, prefix, recordCount: result.recordCount },
          ipAddress: ctx.header('x-forwarded-for') ?? 'unknown',
          userAgent: ctx.header('user-agent') ?? 'unknown',
          resource: 'data',
          success: result.success,
        });
      }

      if (!result.success) {
        return new Response(JSON.stringify({ error: result.error }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const contentType = format === 'json'
        ? 'application/json'
        : format === 'csv'
          ? 'text/csv'
          : 'application/x-ndjson';

      // Convert Uint8Array to proper body type
      const responseBody = result.data instanceof Uint8Array
        ? result.data as BodyInit
        : result.data;

      return new Response(responseBody, {
        status: 200,
        headers: {
          'Content-Type': compress ? 'application/gzip' : contentType,
          'Content-Disposition': `attachment; filename="export.${format}${compress ? '.gz' : ''}"`,
        },
      });
    },

    import: async (ctx: Context): Promise<Response> => {
      const format = (ctx.query.get('format') as ExportFormat) ?? 'json';
      const onConflict = (ctx.query.get('onConflict') as ImportOptions['onConflict']) ?? 'skip';
      const dryRun = ctx.query.get('dryRun') === 'true';

      const body = await ctx.request.arrayBuffer();
      const data = new Uint8Array(body);

      const result = await dataManager.import(data, {
        format,
        onConflict,
        dryRun,
      });

      if (auditLogger && ctx.state.get('user')) {
        await auditLogger.log({
          userId: (ctx.state.get('user') as { id: string }).id,
          action: 'import_data',
          category: 'import',
          details: {
            format,
            onConflict,
            dryRun,
            totalRecords: result.totalRecords,
            imported: result.imported,
          },
          ipAddress: ctx.header('x-forwarded-for') ?? 'unknown',
          userAgent: ctx.header('user-agent') ?? 'unknown',
          resource: 'data',
          success: result.success,
        });
      }

      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 400,
        headers: { 'Content-Type': 'application/json' },
      });
    },

    bulkDelete: async (ctx: Context): Promise<Response> => {
      const prefix = ctx.query.get('prefix');
      const dryRun = ctx.query.get('dryRun') === 'true';

      if (!prefix) {
        return new Response(JSON.stringify({ error: 'prefix is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const result = await dataManager.bulkDelete({
        prefix: prefix.split(','),
        dryRun,
      });

      if (auditLogger && ctx.state.get('user')) {
        await auditLogger.log({
          userId: (ctx.state.get('user') as { id: string }).id,
          action: 'bulk_delete',
          category: 'data',
          details: { prefix, dryRun, requiresConfirmation: result.requiresConfirmation },
          ipAddress: ctx.header('x-forwarded-for') ?? 'unknown',
          userAgent: ctx.header('user-agent') ?? 'unknown',
          resource: 'data',
          success: result.success,
        });
      }

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },

    confirmDelete: async (ctx: Context): Promise<Response> => {
      const token = ctx.query.get('token');

      if (!token) {
        return new Response(JSON.stringify({ error: 'confirmation token is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const result = await dataManager.bulkDelete({
        prefix: [], // Will be loaded from stored token
        confirmationToken: token,
      });

      if (auditLogger && ctx.state.get('user')) {
        await auditLogger.log({
          userId: (ctx.state.get('user') as { id: string }).id,
          action: 'bulk_delete',
          category: 'data',
          details: { confirmationToken: token, deleted: result.deleted },
          ipAddress: ctx.header('x-forwarded-for') ?? 'unknown',
          userAgent: ctx.header('user-agent') ?? 'unknown',
          resource: 'data',
          success: result.success,
        });
      }

      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 400,
        headers: { 'Content-Type': 'application/json' },
      });
    },

    backup: async (ctx: Context): Promise<Response> => {
      const prefix = ctx.query.get('prefix');
      const description = ctx.query.get('description');
      const compress = ctx.query.get('compress') !== 'false';

      const metadata = await dataManager.createBackup({
        prefix: prefix ? prefix.split(',') : undefined,
        description: description ?? undefined,
        compress,
      });

      if (auditLogger && ctx.state.get('user')) {
        await auditLogger.log({
          userId: (ctx.state.get('user') as { id: string }).id,
          action: 'export_data',
          category: 'export',
          details: { backupId: metadata.id, recordCount: metadata.recordCount },
          ipAddress: ctx.header('x-forwarded-for') ?? 'unknown',
          userAgent: ctx.header('user-agent') ?? 'unknown',
          resource: 'backup',
          resourceId: metadata.id,
          success: true,
        });
      }

      return new Response(JSON.stringify(metadata), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    },

    listBackups: async (): Promise<Response> => {
      const backups = await dataManager.listBackups();

      return new Response(JSON.stringify({ backups }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },

    restore: async (ctx: Context): Promise<Response> => {
      const backupId = ctx.params.id;
      const clearExisting = ctx.query.get('clearExisting') === 'true';
      const prefix = ctx.query.get('prefix');

      if (!backupId) {
        return new Response(JSON.stringify({ error: 'backup ID is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const result = await dataManager.restore({
        backupId,
        clearExisting,
        prefix: prefix ? prefix.split(',') : undefined,
      });

      if (auditLogger && ctx.state.get('user')) {
        await auditLogger.log({
          userId: (ctx.state.get('user') as { id: string }).id,
          action: 'import_data',
          category: 'import',
          details: { backupId, clearExisting, recordCount: result.recordCount },
          ipAddress: ctx.header('x-forwarded-for') ?? 'unknown',
          userAgent: ctx.header('user-agent') ?? 'unknown',
          resource: 'backup',
          resourceId: backupId,
          success: result.success,
        });
      }

      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 400,
        headers: { 'Content-Type': 'application/json' },
      });
    },

    stats: async (ctx: Context): Promise<Response> => {
      const prefix = ctx.query.get('prefix');

      const stats = await dataManager.getStats(prefix ? prefix.split(',') : undefined);

      return new Response(
        JSON.stringify({
          ...stats,
          prefixes: Object.fromEntries(stats.prefixes),
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    },

    migrate: async (ctx: Context): Promise<Response> => {
      const result = await dataManager.migrate();

      if (auditLogger && ctx.state.get('user')) {
        await auditLogger.log({
          userId: (ctx.state.get('user') as { id: string }).id,
          action: 'custom',
          category: 'system',
          details: { type: 'migrate', applied: result.applied, errors: result.errors },
          ipAddress: ctx.header('x-forwarded-for') ?? 'unknown',
          userAgent: ctx.header('user-agent') ?? 'unknown',
          resource: 'migration',
          success: result.errors.length === 0,
        });
      }

      return new Response(JSON.stringify(result), {
        status: result.errors.length > 0 ? 400 : 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },

    rollback: async (ctx: Context): Promise<Response> => {
      const result = await dataManager.rollback();

      if (auditLogger && ctx.state.get('user')) {
        await auditLogger.log({
          userId: (ctx.state.get('user') as { id: string }).id,
          action: 'custom',
          category: 'system',
          details: { type: 'rollback', rolledBack: result.rolledBack, error: result.error },
          ipAddress: ctx.header('x-forwarded-for') ?? 'unknown',
          userAgent: ctx.header('user-agent') ?? 'unknown',
          resource: 'migration',
          success: !result.error,
        });
      }

      return new Response(JSON.stringify(result), {
        status: result.error ? 400 : 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  };
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultDataManager: DataManager | null = null;

/**
 * Get the default data manager instance
 */
export async function getDataManager(): Promise<DataManager> {
  if (!defaultDataManager) {
    defaultDataManager = new DataManager();
    await defaultDataManager.init();
  }
  return defaultDataManager;
}

/**
 * Create a data manager with audit logging
 */
export async function createDataManager(
  auditLogger?: AuditLogger
): Promise<DataManager> {
  const kv = await getKV();
  const manager = new DataManager(kv, auditLogger);
  return manager;
}
