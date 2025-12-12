/**
 * Deno KV Store Wrapper
 *
 * Provides a high-level interface for Deno KV operations.
 */

import { withDbSpan, isOTELEnabled } from '../telemetry/otel.ts';

export interface KVStoreOptions {
  path?: string;
}

/**
 * KV Store wrapper for Deno KV
 */
export class KVStore {
  private kv!: Deno.Kv;
  private initialized = false;

  constructor(private options: KVStoreOptions = {}) {}

  /**
   * Initialize the KV store
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.kv = await Deno.openKv(this.options.path);
    this.initialized = true;
  }

  /**
   * Get the underlying Deno KV instance
   */
  get raw(): Deno.Kv {
    if (!this.initialized) {
      throw new Error('KV store not initialized. Call init() first.');
    }
    return this.kv;
  }

  /**
   * Get a value by key
   */
  async get<T>(key: Deno.KvKey): Promise<T | null> {
    if (!isOTELEnabled()) {
      const result = await this.kv.get<T>(key);
      return result.value;
    }

    return await withDbSpan('kv.get', key, async (span) => {
      span?.setAttribute('db.system', 'deno_kv');
      span?.setAttribute('db.operation', 'get');
      span?.setAttribute('db.key', JSON.stringify(key));
      const result = await this.kv.get<T>(key);
      return result.value;
    });
  }

  /**
   * Get multiple values by keys
   */
  async getMany<T>(keys: Deno.KvKey[]): Promise<(T | null)[]> {
    if (!isOTELEnabled()) {
      const results = await this.kv.getMany<T[]>(keys);
      return results.map((r) => r.value);
    }

    return await withDbSpan('kv.getMany', keys[0] || [], async (span) => {
      span?.setAttribute('db.system', 'deno_kv');
      span?.setAttribute('db.operation', 'getMany');
      span?.setAttribute('db.batch.size', keys.length);
      const results = await this.kv.getMany<T[]>(keys);
      return results.map((r) => r.value);
    });
  }

  /**
   * Set a value
   */
  async set<T>(key: Deno.KvKey, value: T, options?: { expireIn?: number }): Promise<void> {
    if (!isOTELEnabled()) {
      await this.kv.set(key, value, options);
      return;
    }

    await withDbSpan('kv.set', key, async (span) => {
      span?.setAttribute('db.system', 'deno_kv');
      span?.setAttribute('db.operation', 'set');
      span?.setAttribute('db.key', JSON.stringify(key));
      if (options?.expireIn) {
        span?.setAttribute('db.kv.ttl', options.expireIn);
      }
      await this.kv.set(key, value, options);
    });
  }

  /**
   * Delete a value
   */
  async delete(key: Deno.KvKey): Promise<void> {
    if (!isOTELEnabled()) {
      await this.kv.delete(key);
      return;
    }

    await withDbSpan('kv.delete', key, async (span) => {
      span?.setAttribute('db.system', 'deno_kv');
      span?.setAttribute('db.operation', 'delete');
      span?.setAttribute('db.key', JSON.stringify(key));
      await this.kv.delete(key);
    });
  }

  /**
   * List values with a prefix
   */
  async list<T>(
    prefix: Deno.KvKey,
    options?: Deno.KvListOptions
  ): Promise<{ key: Deno.KvKey; value: T }[]> {
    if (!isOTELEnabled()) {
      const results: { key: Deno.KvKey; value: T }[] = [];
      const entries = this.kv.list<T>({ prefix }, options);

      for await (const entry of entries) {
        results.push({ key: entry.key, value: entry.value });
      }

      return results;
    }

    return await withDbSpan('kv.list', prefix, async (span) => {
      span?.setAttribute('db.system', 'deno_kv');
      span?.setAttribute('db.operation', 'list');
      span?.setAttribute('db.prefix', JSON.stringify(prefix));
      if (options?.limit) {
        span?.setAttribute('db.kv.limit', options.limit);
      }

      const results: { key: Deno.KvKey; value: T }[] = [];
      const entries = this.kv.list<T>({ prefix }, options);

      for await (const entry of entries) {
        results.push({ key: entry.key, value: entry.value });
      }

      span?.setAttribute('db.result.count', results.length);
      return results;
    });
  }

  /**
   * Atomic operations
   */
  atomic(): Deno.AtomicOperation {
    return this.kv.atomic();
  }

  /**
   * Watch for changes
   */
  watch<T>(keys: Deno.KvKey[]): ReadableStream<Deno.KvEntryMaybe<T>[]> {
    return this.kv.watch<T[]>(keys);
  }

  /**
   * Enqueue a message
   */
  async enqueue(
    value: unknown,
    options?: { delay?: number; keysIfUndelivered?: Deno.KvKey[] }
  ): Promise<void> {
    if (!isOTELEnabled()) {
      await this.kv.enqueue(value, options);
      return;
    }

    await withDbSpan('kv.enqueue', ['queue'], async (span) => {
      span?.setAttribute('db.system', 'deno_kv');
      span?.setAttribute('db.operation', 'enqueue');
      if (options?.delay) {
        span?.setAttribute('db.kv.delay_ms', options.delay);
      }
      await this.kv.enqueue(value, options);
    });
  }

  /**
   * Listen for queued messages
   */
  listenQueue(handler: (value: unknown) => void | Promise<void>): Promise<void> {
    return this.kv.listenQueue(handler);
  }

  /**
   * Close the KV store
   */
  close(): void {
    if (this.initialized) {
      this.kv.close();
      this.initialized = false;
    }
  }
}

// Singleton instance
let defaultStore: KVStore | null = null;

/**
 * Get the default KV store
 */
export async function getKV(): Promise<KVStore> {
  if (!defaultStore) {
    defaultStore = new KVStore();
    await defaultStore.init();
  }
  return defaultStore;
}
