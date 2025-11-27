/**
 * WASM Memory Manager
 *
 * Manages WebAssembly memory allocation, limits, and operations.
 * Provides utilities for reading/writing data to WASM memory.
 */

import type {
  WASMMemoryConfig,
  WASMMemoryStats,
  WASMModuleMemoryStats,
} from './wasm_types.ts';
import { WASMEvents } from './wasm_types.ts';
import { EventEmitter } from '../plugin/events.ts';

/**
 * WASM Memory Manager
 *
 * Handles memory allocation, tracking, and operations for WASM modules.
 */
export class WASMMemoryManager {
  private memories: Map<string, WebAssembly.Memory> = new Map();
  private moduleStats: Map<string, WASMModuleMemoryStats> = new Map();
  private globalLimit: number;
  private moduleLimits: Map<string, number> = new Map();
  private events: EventEmitter;
  private totalAllocated = 0;

  // Page size constant (64KB)
  static readonly PAGE_SIZE = 65536;

  constructor(events: EventEmitter, globalLimit = 256 * 1024 * 1024) { // 256MB default
    this.events = events;
    this.globalLimit = globalLimit;
  }

  /**
   * Allocate a new WebAssembly.Memory instance
   */
  allocateMemory(
    moduleId: string,
    config: WASMMemoryConfig
  ): WebAssembly.Memory {
    const bytesNeeded = config.initial * WASMMemoryManager.PAGE_SIZE;
    const moduleLimit = this.moduleLimits.get(moduleId);

    // Check global limit
    if (this.totalAllocated + bytesNeeded > this.globalLimit) {
      this.events.emit(WASMEvents.MEMORY_LIMIT_REACHED, {
        moduleId,
        requested: bytesNeeded,
        available: this.globalLimit - this.totalAllocated,
        type: 'global',
      });
      throw new Error(
        `Global memory limit exceeded. Requested: ${bytesNeeded}, Available: ${this.globalLimit - this.totalAllocated}`
      );
    }

    // Check module limit
    if (moduleLimit && bytesNeeded > moduleLimit) {
      this.events.emit(WASMEvents.MEMORY_LIMIT_REACHED, {
        moduleId,
        requested: bytesNeeded,
        limit: moduleLimit,
        type: 'module',
      });
      throw new Error(
        `Module memory limit exceeded. Requested: ${bytesNeeded}, Limit: ${moduleLimit}`
      );
    }

    // Create memory descriptor
    const descriptor: WebAssembly.MemoryDescriptor = {
      initial: config.initial,
      maximum: config.maximum,
      shared: config.shared,
    };

    // Allocate memory
    const memory = new WebAssembly.Memory(descriptor);
    this.memories.set(moduleId, memory);
    this.totalAllocated += bytesNeeded;

    // Initialize stats
    this.moduleStats.set(moduleId, {
      moduleId,
      allocated: bytesNeeded,
      used: 0,
      peakUsage: 0,
      allocations: 1,
      frees: 0,
    });

    this.events.emit(WASMEvents.MEMORY_ALLOCATED, {
      moduleId,
      pages: config.initial,
      bytes: bytesNeeded,
    });

    return memory;
  }

  /**
   * Grow memory for a module
   */
  growMemory(moduleId: string, pages: number): number {
    const memory = this.memories.get(moduleId);
    if (!memory) {
      throw new Error(`No memory found for module: ${moduleId}`);
    }

    const bytesNeeded = pages * WASMMemoryManager.PAGE_SIZE;
    const moduleLimit = this.moduleLimits.get(moduleId);
    const stats = this.moduleStats.get(moduleId);

    // Check global limit
    if (this.totalAllocated + bytesNeeded > this.globalLimit) {
      this.events.emit(WASMEvents.MEMORY_LIMIT_REACHED, {
        moduleId,
        requested: bytesNeeded,
        available: this.globalLimit - this.totalAllocated,
        type: 'global',
      });
      return -1; // WebAssembly.Memory.grow returns -1 on failure
    }

    // Check module limit
    if (moduleLimit && stats && stats.allocated + bytesNeeded > moduleLimit) {
      this.events.emit(WASMEvents.MEMORY_LIMIT_REACHED, {
        moduleId,
        requested: bytesNeeded,
        limit: moduleLimit,
        type: 'module',
      });
      return -1;
    }

    try {
      const previousPages = memory.grow(pages);
      this.totalAllocated += bytesNeeded;

      if (stats) {
        stats.allocated += bytesNeeded;
        stats.allocations++;
        if (stats.allocated > stats.peakUsage) {
          stats.peakUsage = stats.allocated;
        }
      }

      this.events.emit(WASMEvents.MEMORY_ALLOCATED, {
        moduleId,
        pages,
        bytes: bytesNeeded,
        totalPages: previousPages + pages,
      });

      return previousPages;
    } catch (error) {
      throw new Error(`Failed to grow memory: ${error}`);
    }
  }

  /**
   * Get memory for a module
   */
  getMemory(moduleId: string): WebAssembly.Memory | undefined {
    return this.memories.get(moduleId);
  }

  /**
   * Free memory for a module
   */
  freeMemory(moduleId: string): void {
    const memory = this.memories.get(moduleId);
    const stats = this.moduleStats.get(moduleId);

    if (memory && stats) {
      this.totalAllocated -= stats.allocated;
      this.memories.delete(moduleId);

      stats.frees++;
      this.events.emit(WASMEvents.MEMORY_FREED, {
        moduleId,
        freedBytes: stats.allocated,
      });

      this.moduleStats.delete(moduleId);
    }
  }

  /**
   * Set global memory limit
   */
  setGlobalLimit(bytes: number): void {
    this.globalLimit = bytes;
  }

  /**
   * Set memory limit for a specific module
   */
  setModuleLimit(moduleId: string, bytes: number): void {
    this.moduleLimits.set(moduleId, bytes);
  }

  /**
   * Remove memory limit for a module
   */
  removeModuleLimit(moduleId: string): void {
    this.moduleLimits.delete(moduleId);
  }

  /**
   * Read a string from WASM memory
   */
  readString(memory: WebAssembly.Memory, ptr: number, len: number): string {
    const bytes = new Uint8Array(memory.buffer, ptr, len);
    return new TextDecoder().decode(bytes);
  }

  /**
   * Read a null-terminated string from WASM memory
   */
  readCString(memory: WebAssembly.Memory, ptr: number, maxLen = 4096): string {
    const bytes = new Uint8Array(memory.buffer, ptr, maxLen);
    let len = 0;
    while (len < maxLen && bytes[len] !== 0) {
      len++;
    }
    return new TextDecoder().decode(bytes.subarray(0, len));
  }

  /**
   * Write a string to WASM memory
   * Returns the number of bytes written
   */
  writeString(memory: WebAssembly.Memory, ptr: number, str: string): number {
    const encoded = new TextEncoder().encode(str);
    const view = new Uint8Array(memory.buffer, ptr, encoded.length);
    view.set(encoded);
    return encoded.length;
  }

  /**
   * Write a null-terminated string to WASM memory
   */
  writeCString(memory: WebAssembly.Memory, ptr: number, str: string): number {
    const encoded = new TextEncoder().encode(str + '\0');
    const view = new Uint8Array(memory.buffer, ptr, encoded.length);
    view.set(encoded);
    return encoded.length;
  }

  /**
   * Read bytes from WASM memory
   */
  readBytes(memory: WebAssembly.Memory, ptr: number, len: number): Uint8Array {
    return new Uint8Array(memory.buffer, ptr, len).slice();
  }

  /**
   * Write bytes to WASM memory
   */
  writeBytes(memory: WebAssembly.Memory, ptr: number, bytes: Uint8Array): void {
    const view = new Uint8Array(memory.buffer, ptr, bytes.length);
    view.set(bytes);
  }

  /**
   * Read an i32 from WASM memory
   */
  readI32(memory: WebAssembly.Memory, ptr: number): number {
    const view = new DataView(memory.buffer);
    return view.getInt32(ptr, true); // Little-endian
  }

  /**
   * Write an i32 to WASM memory
   */
  writeI32(memory: WebAssembly.Memory, ptr: number, value: number): void {
    const view = new DataView(memory.buffer);
    view.setInt32(ptr, value, true); // Little-endian
  }

  /**
   * Read an i64 from WASM memory
   */
  readI64(memory: WebAssembly.Memory, ptr: number): bigint {
    const view = new DataView(memory.buffer);
    return view.getBigInt64(ptr, true); // Little-endian
  }

  /**
   * Write an i64 to WASM memory
   */
  writeI64(memory: WebAssembly.Memory, ptr: number, value: bigint): void {
    const view = new DataView(memory.buffer);
    view.setBigInt64(ptr, value, true); // Little-endian
  }

  /**
   * Read an f32 from WASM memory
   */
  readF32(memory: WebAssembly.Memory, ptr: number): number {
    const view = new DataView(memory.buffer);
    return view.getFloat32(ptr, true); // Little-endian
  }

  /**
   * Write an f32 to WASM memory
   */
  writeF32(memory: WebAssembly.Memory, ptr: number, value: number): void {
    const view = new DataView(memory.buffer);
    view.setFloat32(ptr, value, true); // Little-endian
  }

  /**
   * Read an f64 from WASM memory
   */
  readF64(memory: WebAssembly.Memory, ptr: number): number {
    const view = new DataView(memory.buffer);
    return view.getFloat64(ptr, true); // Little-endian
  }

  /**
   * Write an f64 to WASM memory
   */
  writeF64(memory: WebAssembly.Memory, ptr: number, value: number): void {
    const view = new DataView(memory.buffer);
    view.setFloat64(ptr, value, true); // Little-endian
  }

  /**
   * Get memory statistics
   */
  getStats(moduleId?: string): WASMMemoryStats {
    if (moduleId) {
      const stats = this.moduleStats.get(moduleId);
      const memory = this.memories.get(moduleId);

      if (!stats || !memory) {
        return {
          allocated: 0,
          used: 0,
          available: 0,
          pageCount: 0,
        };
      }

      const pageCount = memory.buffer.byteLength / WASMMemoryManager.PAGE_SIZE;
      const limit = this.moduleLimits.get(moduleId);

      return {
        allocated: stats.allocated,
        used: stats.used,
        available: (limit || this.globalLimit) - stats.allocated,
        pageCount,
        maxPages: limit ? Math.floor(limit / WASMMemoryManager.PAGE_SIZE) : undefined,
      };
    }

    // Global stats
    const allModuleStats = new Map<string, WASMModuleMemoryStats>();
    for (const [id, stats] of this.moduleStats) {
      allModuleStats.set(id, { ...stats });
    }

    let totalPages = 0;
    for (const memory of this.memories.values()) {
      totalPages += memory.buffer.byteLength / WASMMemoryManager.PAGE_SIZE;
    }

    return {
      allocated: this.totalAllocated,
      used: this.totalAllocated, // Approximation
      available: this.globalLimit - this.totalAllocated,
      pageCount: totalPages,
      maxPages: Math.floor(this.globalLimit / WASMMemoryManager.PAGE_SIZE),
      moduleStats: allModuleStats,
    };
  }

  /**
   * Update usage statistics for a module
   */
  updateUsage(moduleId: string, bytesUsed: number): void {
    const stats = this.moduleStats.get(moduleId);
    if (stats) {
      stats.used = bytesUsed;
      if (bytesUsed > stats.peakUsage) {
        stats.peakUsage = bytesUsed;
      }
    }
  }

  /**
   * Get the buffer for a module's memory
   */
  getBuffer(moduleId: string): ArrayBuffer | SharedArrayBuffer | undefined {
    return this.memories.get(moduleId)?.buffer;
  }

  /**
   * Create a typed array view of module memory
   */
  getTypedArray<T extends ArrayBufferView>(
    moduleId: string,
    ArrayType: new (buffer: ArrayBuffer | SharedArrayBuffer, offset?: number, length?: number) => T,
    offset?: number,
    length?: number
  ): T | undefined {
    const memory = this.memories.get(moduleId);
    if (!memory) return undefined;
    return new ArrayType(memory.buffer, offset, length);
  }

  /**
   * Reset all memory tracking
   */
  reset(): void {
    for (const moduleId of this.memories.keys()) {
      this.freeMemory(moduleId);
    }
    this.memories.clear();
    this.moduleStats.clear();
    this.moduleLimits.clear();
    this.totalAllocated = 0;
  }

  /**
   * Get list of all module IDs with allocated memory
   */
  getModuleIds(): string[] {
    return Array.from(this.memories.keys());
  }
}
