/**
 * Deno KV Store Wrapper
 *
 * Provides a high-level interface for Deno KV operations.
 */

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
    const result = await this.kv.get<T>(key);
    return result.value;
  }

  /**
   * Get multiple values by keys
   */
  async getMany<T>(keys: Deno.KvKey[]): Promise<(T | null)[]> {
    const results = await this.kv.getMany<T[]>(keys);
    return results.map((r) => r.value);
  }

  /**
   * Set a value
   */
  async set<T>(key: Deno.KvKey, value: T, options?: { expireIn?: number }): Promise<void> {
    await this.kv.set(key, value, options);
  }

  /**
   * Delete a value
   */
  async delete(key: Deno.KvKey): Promise<void> {
    await this.kv.delete(key);
  }

  /**
   * List values with a prefix
   */
  async list<T>(
    prefix: Deno.KvKey,
    options?: Deno.KvListOptions
  ): Promise<{ key: Deno.KvKey; value: T }[]> {
    const results: { key: Deno.KvKey; value: T }[] = [];
    const entries = this.kv.list<T>({ prefix }, options);

    for await (const entry of entries) {
      results.push({ key: entry.key, value: entry.value });
    }

    return results;
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
    await this.kv.enqueue(value, options);
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
