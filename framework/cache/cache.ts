/**
 * Cache Implementation
 *
 * Provides a unified caching interface with multiple backends.
 * When maxSize is set, uses memory-only caching.
 * Otherwise, uses Deno KV for persistent storage.
 */

import { getKV } from '../orm/kv.ts';
import { getDebugger, DebugLevel, DebugModule } from '../debugger/mod.ts';
import { withSpan, isOTELEnabled, SpanKind } from '../telemetry/otel.ts';

export interface CacheEntry<T> {
  value: T;
  expiresAt: number | null;
  createdAt: number;
}

export interface CacheOptions {
  prefix?: string;
  defaultTtl?: number; // in milliseconds
  maxSize?: number; // maximum number of entries (enables memory-only mode)
}

const DEFAULT_OPTIONS: CacheOptions = {
  prefix: 'cache',
  defaultTtl: 3600000, // 1 hour in milliseconds
};

/**
 * Cache manager
 */
export class Cache {
  private options: CacheOptions;
  private memoryCache = new Map<string, CacheEntry<unknown>>();

  constructor(options: CacheOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Check if this cache is memory-only mode
   */
  private isMemoryOnly(): boolean {
    return this.options.maxSize !== undefined;
  }

  /**
   * Get the number of entries in the cache
   */
  get size(): number {
    return this.memoryCache.size;
  }

  /**
   * Get a cached value
   */
  async get<T>(key: string): Promise<T | undefined> {
    const debugger_ = getDebugger();

    debugger_.emit('cache:get', DebugModule.CACHE, DebugLevel.TRACE, `Cache get: ${key}`, {
      data: { key },
    });

    if (!isOTELEnabled()) {
      // Check memory cache first
      const memoryEntry = this.memoryCache.get(key);
      if (memoryEntry) {
        if (memoryEntry.expiresAt === null || memoryEntry.expiresAt > Date.now()) {
          debugger_.emit('cache:hit', DebugModule.CACHE, DebugLevel.DEBUG, `Cache hit (memory): ${key}`, {
            data: { key, source: 'memory' },
          });
          return memoryEntry.value as T;
        }
        this.memoryCache.delete(key);
        debugger_.emit('cache:miss', DebugModule.CACHE, DebugLevel.DEBUG, `Cache expired: ${key}`, {
          data: { key, reason: 'expired' },
        });
        return undefined;
      }

      // If memory-only mode, don't check KV
      if (this.isMemoryOnly()) {
        debugger_.emit('cache:miss', DebugModule.CACHE, DebugLevel.DEBUG, `Cache miss: ${key}`, {
          data: { key, source: 'memory' },
        });
        return undefined;
      }

      // Check KV store
      const kv = await getKV();
      const entry = await kv.get<CacheEntry<T>>([this.options.prefix!, key]);

      if (!entry) {
        debugger_.emit('cache:miss', DebugModule.CACHE, DebugLevel.DEBUG, `Cache miss: ${key}`, {
          data: { key, source: 'kv' },
        });
        return undefined;
      }

      // Check expiration
      if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
        await this.delete(key);
        debugger_.emit('cache:miss', DebugModule.CACHE, DebugLevel.DEBUG, `Cache expired (kv): ${key}`, {
          data: { key, reason: 'expired' },
        });
        return undefined;
      }

      // Cache in memory
      this.memoryCache.set(key, entry);

      debugger_.emit('cache:hit', DebugModule.CACHE, DebugLevel.DEBUG, `Cache hit (kv): ${key}`, {
        data: { key, source: 'kv' },
      });

      return entry.value;
    }

    return await withSpan('cache.get', async (span) => {
      span?.setAttribute('cache.key', key);
      span?.setAttribute('cache.prefix', this.options.prefix!);

      // Check memory cache first
      const memoryEntry = this.memoryCache.get(key);
      if (memoryEntry) {
        if (memoryEntry.expiresAt === null || memoryEntry.expiresAt > Date.now()) {
          debugger_.emit('cache:hit', DebugModule.CACHE, DebugLevel.DEBUG, `Cache hit (memory): ${key}`, {
            data: { key, source: 'memory' },
          });
          span?.setAttribute('cache.hit', true);
          span?.setAttribute('cache.source', 'memory');
          return memoryEntry.value as T;
        }
        this.memoryCache.delete(key);
        debugger_.emit('cache:miss', DebugModule.CACHE, DebugLevel.DEBUG, `Cache expired: ${key}`, {
          data: { key, reason: 'expired' },
        });
        span?.setAttribute('cache.hit', false);
        span?.setAttribute('cache.miss_reason', 'expired');
        return undefined;
      }

      // If memory-only mode, don't check KV
      if (this.isMemoryOnly()) {
        debugger_.emit('cache:miss', DebugModule.CACHE, DebugLevel.DEBUG, `Cache miss: ${key}`, {
          data: { key, source: 'memory' },
        });
        span?.setAttribute('cache.hit', false);
        span?.setAttribute('cache.source', 'memory');
        return undefined;
      }

      // Check KV store
      const kv = await getKV();
      const entry = await kv.get<CacheEntry<T>>([this.options.prefix!, key]);

      if (!entry) {
        debugger_.emit('cache:miss', DebugModule.CACHE, DebugLevel.DEBUG, `Cache miss: ${key}`, {
          data: { key, source: 'kv' },
        });
        span?.setAttribute('cache.hit', false);
        span?.setAttribute('cache.source', 'kv');
        return undefined;
      }

      // Check expiration
      if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
        await this.delete(key);
        debugger_.emit('cache:miss', DebugModule.CACHE, DebugLevel.DEBUG, `Cache expired (kv): ${key}`, {
          data: { key, reason: 'expired' },
        });
        span?.setAttribute('cache.hit', false);
        span?.setAttribute('cache.miss_reason', 'expired');
        span?.setAttribute('cache.source', 'kv');
        return undefined;
      }

      // Cache in memory
      this.memoryCache.set(key, entry);

      debugger_.emit('cache:hit', DebugModule.CACHE, DebugLevel.DEBUG, `Cache hit (kv): ${key}`, {
        data: { key, source: 'kv' },
      });

      span?.setAttribute('cache.hit', true);
      span?.setAttribute('cache.source', 'kv');
      return entry.value;
    }, { kind: SpanKind.INTERNAL });
  }

  /**
   * Set a cached value
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const debugger_ = getDebugger();
    const ttlMs = ttl ?? this.options.defaultTtl!;

    if (!isOTELEnabled()) {
      const expiresAt = ttlMs > 0 ? Date.now() + ttlMs : null;

      const entry: CacheEntry<T> = {
        value,
        expiresAt,
        createdAt: Date.now(),
      };

      // Store in memory
      this.memoryCache.set(key, entry);

      debugger_.emit('cache:set', DebugModule.CACHE, DebugLevel.DEBUG, `Cache set: ${key}`, {
        data: { key, ttl: ttlMs },
      });

      // If memory-only mode, don't store in KV
      if (this.isMemoryOnly()) {
        return;
      }

      // Store in KV
      const kv = await getKV();
      const expireIn = ttlMs > 0 ? ttlMs : undefined;
      await kv.set([this.options.prefix!, key], entry, { expireIn });
      return;
    }

    await withSpan('cache.set', async (span) => {
      span?.setAttribute('cache.key', key);
      span?.setAttribute('cache.prefix', this.options.prefix!);
      span?.setAttribute('cache.ttl_ms', ttlMs);

      const expiresAt = ttlMs > 0 ? Date.now() + ttlMs : null;

      const entry: CacheEntry<T> = {
        value,
        expiresAt,
        createdAt: Date.now(),
      };

      // Store in memory
      this.memoryCache.set(key, entry);

      debugger_.emit('cache:set', DebugModule.CACHE, DebugLevel.DEBUG, `Cache set: ${key}`, {
        data: { key, ttl: ttlMs },
      });

      span?.setAttribute('cache.memory_only', this.isMemoryOnly());

      // If memory-only mode, don't store in KV
      if (this.isMemoryOnly()) {
        return;
      }

      // Store in KV
      const kv = await getKV();
      const expireIn = ttlMs > 0 ? ttlMs : undefined;
      await kv.set([this.options.prefix!, key], entry, { expireIn });
    }, { kind: SpanKind.INTERNAL });
  }

  /**
   * Get or set a cached value
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T> | T,
    ttl?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  /**
   * Delete a cached value
   */
  async delete(key: string): Promise<void> {
    if (!isOTELEnabled()) {
      this.memoryCache.delete(key);

      // If memory-only mode, don't delete from KV
      if (this.isMemoryOnly()) {
        return;
      }

      const kv = await getKV();
      await kv.delete([this.options.prefix!, key]);
      return;
    }

    await withSpan('cache.delete', async (span) => {
      span?.setAttribute('cache.key', key);
      span?.setAttribute('cache.prefix', this.options.prefix!);

      this.memoryCache.delete(key);

      // If memory-only mode, don't delete from KV
      if (this.isMemoryOnly()) {
        span?.setAttribute('cache.memory_only', true);
        return;
      }

      span?.setAttribute('cache.memory_only', false);
      const kv = await getKV();
      await kv.delete([this.options.prefix!, key]);
    }, { kind: SpanKind.INTERNAL });
  }

  /**
   * Delete multiple cached values by pattern
   */
  async deleteByPrefix(prefix: string): Promise<number> {
    let count = 0;

    // Clear memory cache
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(prefix)) {
        this.memoryCache.delete(key);
        count++;
      }
    }

    // If memory-only mode, don't clear KV
    if (this.isMemoryOnly()) {
      return count;
    }

    // Clear KV cache
    const kv = await getKV();
    const entries = await kv.list([this.options.prefix!, prefix]);

    for (const entry of entries) {
      await kv.delete(entry.key);
      count++;
    }

    return count;
  }

  /**
   * Check if a key exists
   */
  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== undefined;
  }

  /**
   * Clear all cached values
   */
  async clear(): Promise<void> {
    if (!isOTELEnabled()) {
      this.memoryCache.clear();

      // If memory-only mode, don't clear KV
      if (this.isMemoryOnly()) {
        return;
      }

      const kv = await getKV();
      const entries = await kv.list([this.options.prefix!]);

      for (const entry of entries) {
        await kv.delete(entry.key);
      }
      return;
    }

    await withSpan('cache.clear', async (span) => {
      span?.setAttribute('cache.prefix', this.options.prefix!);

      const memorySize = this.memoryCache.size;
      this.memoryCache.clear();
      span?.setAttribute('cache.memory_cleared', memorySize);

      // If memory-only mode, don't clear KV
      if (this.isMemoryOnly()) {
        span?.setAttribute('cache.memory_only', true);
        return;
      }

      span?.setAttribute('cache.memory_only', false);
      const kv = await getKV();
      const entries = await kv.list([this.options.prefix!]);

      let kvCleared = 0;
      for (const entry of entries) {
        await kv.delete(entry.key);
        kvCleared++;
      }

      span?.setAttribute('cache.kv_cleared', kvCleared);
    }, { kind: SpanKind.INTERNAL });
  }

  /**
   * Get cache statistics
   */
  getStats(): { memorySize: number; prefix: string } {
    return {
      memorySize: this.memoryCache.size,
      prefix: this.options.prefix!,
    };
  }

  /**
   * Create a tagged cache instance
   */
  tags(tags: string[]): TaggedCache {
    return new TaggedCache(this, tags);
  }
}

/**
 * Tagged cache for group invalidation
 */
class TaggedCache {
  constructor(
    private cache: Cache,
    private tags: string[]
  ) {}

  private getTaggedKey(key: string): string {
    return `${this.tags.join(':')}:${key}`;
  }

  async get<T>(key: string): Promise<T | undefined> {
    return await this.cache.get<T>(this.getTaggedKey(key));
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.cache.set(this.getTaggedKey(key), value, ttl);
  }

  async delete(key: string): Promise<void> {
    await this.cache.delete(this.getTaggedKey(key));
  }

  async flush(): Promise<void> {
    await this.cache.deleteByPrefix(this.tags.join(':'));
  }
}

// Singleton instance
let defaultCache: Cache | null = null;

/**
 * Get the default cache instance
 */
export function getCache(): Cache {
  if (!defaultCache) {
    defaultCache = new Cache();
  }
  return defaultCache;
}
