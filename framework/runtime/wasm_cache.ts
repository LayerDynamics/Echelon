/**
 * WASM Module Caching with Persistence
 *
 * Provides caching for compiled WASM modules with optional persistence
 * to filesystem or KV storage. Reduces compilation overhead.
 */

import type { WASMModule } from './wasm_types.ts';
import { getLogger } from '../telemetry/logger.ts';

const logger = getLogger();

/**
 * Cache entry
 */
export interface CacheEntry {
  key: string;
  module: WebAssembly.Module;
  metadata: {
    size: number;
    timestamp: number;
    accessCount: number;
    lastAccess: number;
    hash?: string;
  };
}

/**
 * Cache options
 */
export interface WASMCacheOptions {
  maxSize?: number; // Maximum cache size in bytes
  maxEntries?: number; // Maximum number of cached modules
  ttl?: number; // Time to live in milliseconds
  persistToFs?: boolean; // Persist to filesystem
  persistToKV?: boolean; // Persist to KV store
  cacheDir?: string; // Directory for filesystem cache
  kvKey?: string; // Key prefix for KV store
  evictionPolicy?: 'lru' | 'lfu' | 'fifo';
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  entries: number;
  totalSize: number;
  hitRate: number;
}

/**
 * WASM Module Cache
 *
 * In-memory cache with optional persistence to filesystem or KV store.
 */
export class WASMModuleCache {
  private cache: Map<string, CacheEntry> = new Map();
  private options: Required<Omit<WASMCacheOptions, 'cacheDir' | 'kvKey'>> & {
    cacheDir?: string;
    kvKey?: string;
  };

  // Statistics
  private hits = 0;
  private misses = 0;

  // KV store
  private kv: Deno.Kv | null = null;

  constructor(options: WASMCacheOptions = {}) {
    this.options = {
      maxSize: options.maxSize ?? 100 * 1024 * 1024, // 100MB
      maxEntries: options.maxEntries ?? 100,
      ttl: options.ttl ?? 24 * 60 * 60 * 1000, // 24 hours
      persistToFs: options.persistToFs ?? false,
      persistToKV: options.persistToKV ?? false,
      cacheDir: options.cacheDir,
      kvKey: options.kvKey ?? 'wasm_cache',
      evictionPolicy: options.evictionPolicy ?? 'lru',
    };
  }

  /**
   * Initialize the cache (open KV if needed)
   */
  async initialize(): Promise<void> {
    if (this.options.persistToKV) {
      try {
        this.kv = await Deno.openKv();
        logger.debug('KV store opened for WASM cache');
      } catch (error) {
        logger.error('Failed to open KV store for cache', error as Error);
        this.options.persistToKV = false;
      }
    }

    // Create cache directory if needed
    if (this.options.persistToFs && this.options.cacheDir) {
      try {
        await Deno.mkdir(this.options.cacheDir, { recursive: true });
        logger.debug(`Cache directory created: ${this.options.cacheDir}`);
      } catch (error) {
        logger.error('Failed to create cache directory', error as Error);
        this.options.persistToFs = false;
      }
    }

    // Load cached modules from persistence
    if (this.options.persistToFs) {
      await this.loadFromFs();
    } else if (this.options.persistToKV) {
      await this.loadFromKV();
    }
  }

  /**
   * Get a cached module
   */
  async get(key: string): Promise<WebAssembly.Module | null> {
    // Check memory cache
    const entry = this.cache.get(key);

    if (entry) {
      // Check TTL
      if (Date.now() - entry.metadata.timestamp > this.options.ttl) {
        this.cache.delete(key);
        this.misses++;
        return null;
      }

      // Update access stats
      entry.metadata.accessCount++;
      entry.metadata.lastAccess = Date.now();

      this.hits++;
      return entry.module;
    }

    // Check persistent storage
    if (this.options.persistToFs) {
      const module = await this.loadModuleFromFs(key);
      if (module) {
        await this.set(key, module);
        this.hits++;
        return module;
      }
    } else if (this.options.persistToKV) {
      const module = await this.loadModuleFromKV(key);
      if (module) {
        await this.set(key, module);
        this.hits++;
        return module;
      }
    }

    this.misses++;
    return null;
  }

  /**
   * Store a module in cache
   */
  async set(key: string, module: WebAssembly.Module, bytes?: Uint8Array, hash?: string): Promise<void> {
    // Estimate size (we don't have access to serialized size without original bytes)
    const size = bytes?.length ?? 0;

    // Check if we need to evict
    await this.ensureCapacity(size);

    // Create cache entry
    const entry: CacheEntry = {
      key,
      module,
      metadata: {
        size,
        timestamp: Date.now(),
        accessCount: 1,
        lastAccess: Date.now(),
        hash,
      },
    };

    // Store in memory
    this.cache.set(key, entry);

    // Persist if enabled and we have bytes
    if (bytes) {
      if (this.options.persistToFs) {
        await this.persistToFs(key, bytes);
      }

      if (this.options.persistToKV) {
        await this.persistToKV(key, bytes);
      }
    }

    logger.debug(`Cached WASM module: ${key} (${size} bytes)`);
  }

  /**
   * Check if a module is cached
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check TTL
    if (Date.now() - entry.metadata.timestamp > this.options.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Remove a module from cache
   */
  async delete(key: string): Promise<void> {
    this.cache.delete(key);

    // Remove from persistent storage
    if (this.options.persistToFs && this.options.cacheDir) {
      try {
        await Deno.remove(`${this.options.cacheDir}/${key}.wasm`);
      } catch {
        // Ignore errors
      }
    }

    if (this.options.persistToKV && this.kv) {
      await this.kv.delete([this.options.kvKey!, key]);
    }
  }

  /**
   * Clear the entire cache
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;

    // Clear persistent storage
    if (this.options.persistToFs && this.options.cacheDir) {
      try {
        for await (const entry of Deno.readDir(this.options.cacheDir)) {
          if (entry.isFile && entry.name.endsWith('.wasm')) {
            await Deno.remove(`${this.options.cacheDir}/${entry.name}`);
          }
        }
      } catch (error) {
        logger.error('Failed to clear filesystem cache', error as Error);
      }
    }

    if (this.options.persistToKV && this.kv) {
      // List and delete all entries
      const iter = this.kv.list({ prefix: [this.options.kvKey!] });
      for await (const entry of iter) {
        await this.kv.delete(entry.key);
      }
    }

    logger.debug('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalSize = Array.from(this.cache.values()).reduce(
      (sum, entry) => sum + entry.metadata.size,
      0
    );

    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      entries: this.cache.size,
      totalSize,
      hitRate,
    };
  }

  /**
   * List all cached modules
   */
  list(): Array<{ key: string; metadata: CacheEntry['metadata'] }> {
    return Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      metadata: entry.metadata,
    }));
  }

  /**
   * Ensure cache has capacity for new entry
   */
  private async ensureCapacity(size: number): Promise<void> {
    // Check max entries
    while (this.cache.size >= this.options.maxEntries) {
      await this.evict();
    }

    // Check max size
    const currentSize = Array.from(this.cache.values()).reduce(
      (sum, entry) => sum + entry.metadata.size,
      0
    );

    while (currentSize + size > this.options.maxSize && this.cache.size > 0) {
      await this.evict();
    }
  }

  /**
   * Evict an entry based on policy
   */
  private async evict(): Promise<void> {
    if (this.cache.size === 0) return;

    let keyToEvict: string | null = null;

    switch (this.options.evictionPolicy) {
      case 'lru': {
        // Least Recently Used
        let oldestAccess = Date.now();
        for (const [key, entry] of this.cache) {
          if (entry.metadata.lastAccess < oldestAccess) {
            oldestAccess = entry.metadata.lastAccess;
            keyToEvict = key;
          }
        }
        break;
      }

      case 'lfu': {
        // Least Frequently Used
        let lowestCount = Infinity;
        for (const [key, entry] of this.cache) {
          if (entry.metadata.accessCount < lowestCount) {
            lowestCount = entry.metadata.accessCount;
            keyToEvict = key;
          }
        }
        break;
      }

      case 'fifo': {
        // First In First Out
        let oldestTimestamp = Date.now();
        for (const [key, entry] of this.cache) {
          if (entry.metadata.timestamp < oldestTimestamp) {
            oldestTimestamp = entry.metadata.timestamp;
            keyToEvict = key;
          }
        }
        break;
      }
    }

    if (keyToEvict) {
      logger.debug(`Evicting cache entry: ${keyToEvict} (${this.options.evictionPolicy})`);
      await this.delete(keyToEvict);
    }
  }

  /**
   * Persist module to filesystem
   */
  private async persistToFs(key: string, bytes: Uint8Array): Promise<void> {
    if (!this.options.cacheDir) return;

    const filePath = `${this.options.cacheDir}/${key}.wasm`;
    try {
      await Deno.writeFile(filePath, bytes);
    } catch (error) {
      logger.error(`Failed to persist module to filesystem: ${key}`, error as Error);
    }
  }

  /**
   * Persist module to KV store
   */
  private async persistToKV(key: string, bytes: Uint8Array): Promise<void> {
    if (!this.kv) return;

    try {
      await this.kv.set([this.options.kvKey!, key], bytes);
    } catch (error) {
      logger.error(`Failed to persist module to KV: ${key}`, error as Error);
    }
  }

  /**
   * Load module from filesystem
   */
  private async loadModuleFromFs(key: string): Promise<WebAssembly.Module | null> {
    if (!this.options.cacheDir) return null;

    const filePath = `${this.options.cacheDir}/${key}.wasm`;
    try {
      const bytes = await Deno.readFile(filePath);
      return await WebAssembly.compile(bytes);
    } catch {
      return null;
    }
  }

  /**
   * Load module from KV store
   */
  private async loadModuleFromKV(key: string): Promise<WebAssembly.Module | null> {
    if (!this.kv) return null;

    try {
      const result = await this.kv.get<Uint8Array>([this.options.kvKey!, key]);
      if (!result.value) return null;

      return await WebAssembly.compile(result.value as BufferSource);
    } catch {
      return null;
    }
  }

  /**
   * Load all cached modules from filesystem
   */
  private async loadFromFs(): Promise<void> {
    if (!this.options.cacheDir) return;

    try {
      for await (const entry of Deno.readDir(this.options.cacheDir)) {
        if (!entry.isFile || !entry.name.endsWith('.wasm')) continue;

        const key = entry.name.replace('.wasm', '');
        const module = await this.loadModuleFromFs(key);

        if (module) {
          // Add to memory cache without persisting again
          const cacheEntry: CacheEntry = {
            key,
            module,
            metadata: {
              size: 0, // We don't have original bytes
              timestamp: Date.now(),
              accessCount: 0,
              lastAccess: Date.now(),
            },
          };
          this.cache.set(key, cacheEntry);
        }
      }

      logger.debug(`Loaded ${this.cache.size} modules from filesystem cache`);
    } catch (error) {
      logger.error('Failed to load cache from filesystem', error as Error);
    }
  }

  /**
   * Load all cached modules from KV store
   */
  private async loadFromKV(): Promise<void> {
    if (!this.kv) return;

    try {
      const iter = this.kv.list<Uint8Array>({ prefix: [this.options.kvKey!] });
      let count = 0;

      for await (const entry of iter) {
        const key = entry.key[1] as string;
        const bytes = entry.value;

        if (bytes) {
          const module = await WebAssembly.compile(bytes as BufferSource);
          const cacheEntry: CacheEntry = {
            key,
            module,
            metadata: {
              size: bytes.length,
              timestamp: Date.now(),
              accessCount: 0,
              lastAccess: Date.now(),
            },
          };
          this.cache.set(key, cacheEntry);
          count++;
        }
      }

      logger.debug(`Loaded ${count} modules from KV cache`);
    } catch (error) {
      logger.error('Failed to load cache from KV', error as Error);
    }
  }

  /**
   * Close the cache (close KV connection)
   */
  async close(): Promise<void> {
    if (this.kv) {
      this.kv.close();
      this.kv = null;
    }
  }
}

/**
 * Utility: Generate cache key from WASM bytes
 */
export async function generateCacheKey(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Utility: Warm cache with common modules
 */
export async function warmCache(
  cache: WASMModuleCache,
  modules: Array<{ key: string; bytes: Uint8Array }>
): Promise<void> {
  logger.info(`Warming cache with ${modules.length} modules`);

  for (const { key, bytes } of modules) {
    try {
      const module = await WebAssembly.compile(bytes as BufferSource);
      await cache.set(key, module, bytes);
    } catch (error) {
      logger.error(`Failed to warm cache for module: ${key}`, error as Error);
    }
  }

  logger.info('Cache warming complete');
}
