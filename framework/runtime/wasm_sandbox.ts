/**
 * WASM Sandbox Manager
 *
 * Provides sandboxed execution environments for WASM modules.
 * Enforces resource limits, capabilities, and isolation.
 */

import type {
  WASMSandbox,
  WASMSandboxConfig,
  WASMSandboxViolation,
  WASMCapability,
  WASMCPULimit,
  WASMMemoryConfig,
} from './wasm_types.ts';
import { WASMEvents, DEFAULT_WASM_CAPABILITIES } from './wasm_types.ts';
import { EventEmitter } from '../plugin/events.ts';
import { WASMMemoryManager } from './wasm_memory.ts';
import { getLogger } from '../telemetry/logger.ts';

const logger = getLogger();

/**
 * WASM Sandbox Manager
 *
 * Manages sandboxed environments for WASM module execution.
 */
export class WASMSandboxManager {
  private sandboxes: Map<string, WASMSandbox> = new Map();
  private moduleToSandbox: Map<string, string> = new Map();
  private events: EventEmitter;
  private memoryManager: WASMMemoryManager;
  private sandboxCounter = 0;

  constructor(events: EventEmitter, memoryManager: WASMMemoryManager) {
    this.events = events;
    this.memoryManager = memoryManager;
  }

  /**
   * Create a new sandbox
   */
  createSandbox(config: WASMSandboxConfig): WASMSandbox {
    const id = config.id ?? this.generateSandboxId();

    if (this.sandboxes.has(id)) {
      throw new Error(`Sandbox with ID '${id}' already exists`);
    }

    // Validate capabilities
    const capabilities = this.validateCapabilities(config.capabilities);

    // Create sandbox memory if memory capability is granted
    let memory: WebAssembly.Memory | undefined;
    if (capabilities.includes('memory')) {
      const memoryConfig: WASMMemoryConfig = {
        initial: Math.ceil(config.memoryLimit / WASMMemoryManager.PAGE_SIZE),
        maximum: Math.ceil(config.memoryLimit / WASMMemoryManager.PAGE_SIZE),
        shared: capabilities.includes('threads'),
      };
      memory = this.memoryManager.allocateMemory(`sandbox_${id}`, memoryConfig);
    }

    const sandbox: WASMSandbox = {
      id,
      config: {
        ...config,
        capabilities,
      },
      modules: new Set(),
      memory,
      createdAt: new Date(),
      executionCount: 0,
      totalExecutionTime: 0,
    };

    this.sandboxes.set(id, sandbox);

    this.events.emit(WASMEvents.SANDBOX_CREATED, {
      sandboxId: id,
      config: {
        memoryLimit: config.memoryLimit,
        timeLimit: config.timeLimit,
        capabilities,
      },
    });

    logger.info(`Created WASM sandbox: ${id}`);

    return sandbox;
  }

  /**
   * Get a sandbox by ID
   */
  getSandbox(sandboxId: string): WASMSandbox | undefined {
    return this.sandboxes.get(sandboxId);
  }

  /**
   * Get sandbox for a module
   */
  getSandboxForModule(moduleId: string): WASMSandbox | undefined {
    const sandboxId = this.moduleToSandbox.get(moduleId);
    if (!sandboxId) return undefined;
    return this.sandboxes.get(sandboxId);
  }

  /**
   * Assign a module to a sandbox
   */
  assignModule(moduleId: string, sandboxId: string): void {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    // Remove from existing sandbox if any
    const existingSandboxId = this.moduleToSandbox.get(moduleId);
    if (existingSandboxId) {
      const existingSandbox = this.sandboxes.get(existingSandboxId);
      existingSandbox?.modules.delete(moduleId);
    }

    sandbox.modules.add(moduleId);
    this.moduleToSandbox.set(moduleId, sandboxId);

    logger.debug(`Assigned module ${moduleId} to sandbox ${sandboxId}`);
  }

  /**
   * Remove a module from its sandbox
   */
  unassignModule(moduleId: string): void {
    const sandboxId = this.moduleToSandbox.get(moduleId);
    if (sandboxId) {
      const sandbox = this.sandboxes.get(sandboxId);
      sandbox?.modules.delete(moduleId);
      this.moduleToSandbox.delete(moduleId);
    }
  }

  /**
   * Check if a capability is allowed for a module
   */
  hasCapability(moduleId: string, capability: WASMCapability): boolean {
    const sandbox = this.getSandboxForModule(moduleId);
    if (!sandbox) {
      // No sandbox = use default capabilities
      return DEFAULT_WASM_CAPABILITIES.includes(capability);
    }
    return sandbox.config.capabilities.includes(capability);
  }

  /**
   * Check multiple capabilities
   */
  checkCapabilities(
    moduleId: string,
    capabilities: WASMCapability[]
  ): { allowed: WASMCapability[]; denied: WASMCapability[] } {
    const allowed: WASMCapability[] = [];
    const denied: WASMCapability[] = [];

    for (const cap of capabilities) {
      if (this.hasCapability(moduleId, cap)) {
        allowed.push(cap);
      } else {
        denied.push(cap);
      }
    }

    return { allowed, denied };
  }

  /**
   * Enforce capability - throws if denied
   */
  enforceCapability(moduleId: string, capability: WASMCapability): void {
    if (!this.hasCapability(moduleId, capability)) {
      const violation = this.recordViolation(moduleId, 'capability',
        `Capability '${capability}' is not allowed`);
      throw new Error(violation.message);
    }
  }

  /**
   * Check and enforce memory limit
   */
  checkMemoryLimit(moduleId: string, bytesRequested: number): boolean {
    const sandbox = this.getSandboxForModule(moduleId);
    if (!sandbox) return true; // No sandbox = no limit

    const currentUsage = this.memoryManager.getStats(`sandbox_${sandbox.id}`).allocated;
    const allowed = currentUsage + bytesRequested <= sandbox.config.memoryLimit;

    if (!allowed) {
      this.recordViolation(moduleId, 'memory',
        `Memory limit exceeded: ${currentUsage + bytesRequested} > ${sandbox.config.memoryLimit}`);
    }

    return allowed;
  }

  /**
   * Check and enforce time limit
   */
  checkTimeLimit(moduleId: string, duration: number): boolean {
    const sandbox = this.getSandboxForModule(moduleId);
    if (!sandbox || !sandbox.config.timeLimit) return true;

    const allowed = duration <= sandbox.config.timeLimit;

    if (!allowed) {
      this.recordViolation(moduleId, 'time',
        `Time limit exceeded: ${duration}ms > ${sandbox.config.timeLimit}ms`);
    }

    return allowed;
  }

  /**
   * Record execution time
   */
  recordExecution(moduleId: string, duration: number): void {
    const sandbox = this.getSandboxForModule(moduleId);
    if (sandbox) {
      sandbox.executionCount++;
      sandbox.totalExecutionTime += duration;
      sandbox.lastActivity = new Date();
    }
  }

  /**
   * Set CPU limit for sandbox
   */
  setCPULimit(sandboxId: string, limit: WASMCPULimit): void {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }
    sandbox.config.cpuLimit = limit;
  }

  /**
   * Set memory limit for sandbox
   */
  setMemoryLimit(sandboxId: string, bytes: number): void {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }
    sandbox.config.memoryLimit = bytes;
    this.memoryManager.setModuleLimit(`sandbox_${sandboxId}`, bytes);
  }

  /**
   * Set time limit for sandbox
   */
  setTimeLimit(sandboxId: string, ms: number): void {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }
    sandbox.config.timeLimit = ms;
  }

  /**
   * Grant a capability to sandbox
   */
  grantCapability(sandboxId: string, capability: WASMCapability): void {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }
    if (!sandbox.config.capabilities.includes(capability)) {
      sandbox.config.capabilities.push(capability);
      logger.info(`Granted capability '${capability}' to sandbox ${sandboxId}`);
    }
  }

  /**
   * Revoke a capability from sandbox
   */
  revokeCapability(sandboxId: string, capability: WASMCapability): void {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }
    const index = sandbox.config.capabilities.indexOf(capability);
    if (index !== -1) {
      sandbox.config.capabilities.splice(index, 1);
      logger.info(`Revoked capability '${capability}' from sandbox ${sandboxId}`);
    }
  }

  /**
   * Check if a host function is allowed
   */
  isHostFunctionAllowed(moduleId: string, funcKey: string): boolean {
    const sandbox = this.getSandboxForModule(moduleId);
    if (!sandbox) return true; // No sandbox = all allowed

    // Check denied list first
    if (sandbox.config.deniedHostFunctions?.includes(funcKey)) {
      return false;
    }

    // Check allowed list if specified
    if (sandbox.config.allowedHostFunctions) {
      return sandbox.config.allowedHostFunctions.includes(funcKey);
    }

    return true;
  }

  /**
   * Get allowed host functions for a module
   */
  getAllowedHostFunctions(moduleId: string): string[] | undefined {
    const sandbox = this.getSandboxForModule(moduleId);
    return sandbox?.config.allowedHostFunctions;
  }

  /**
   * Destroy a sandbox
   */
  destroySandbox(sandboxId: string): void {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) return;

    // Remove all module associations
    for (const moduleId of sandbox.modules) {
      this.moduleToSandbox.delete(moduleId);
    }

    // Free sandbox memory
    this.memoryManager.freeMemory(`sandbox_${sandboxId}`);

    // Remove sandbox
    this.sandboxes.delete(sandboxId);

    this.events.emit(WASMEvents.SANDBOX_DESTROYED, {
      sandboxId,
      modulesAffected: Array.from(sandbox.modules),
    });

    logger.info(`Destroyed WASM sandbox: ${sandboxId}`);
  }

  /**
   * Destroy all sandboxes
   */
  destroyAllSandboxes(): void {
    for (const sandboxId of this.sandboxes.keys()) {
      this.destroySandbox(sandboxId);
    }
  }

  /**
   * Get sandbox statistics
   */
  getSandboxStats(sandboxId: string): {
    id: string;
    moduleCount: number;
    executionCount: number;
    totalExecutionTime: number;
    memoryUsage: number;
    capabilities: WASMCapability[];
    createdAt: Date;
    lastActivity?: Date;
  } | undefined {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) return undefined;

    return {
      id: sandbox.id,
      moduleCount: sandbox.modules.size,
      executionCount: sandbox.executionCount,
      totalExecutionTime: sandbox.totalExecutionTime,
      memoryUsage: this.memoryManager.getStats(`sandbox_${sandboxId}`).allocated,
      capabilities: [...sandbox.config.capabilities],
      createdAt: sandbox.createdAt,
      lastActivity: sandbox.lastActivity,
    };
  }

  /**
   * Get all sandbox IDs
   */
  getSandboxIds(): string[] {
    return Array.from(this.sandboxes.keys());
  }

  /**
   * Get modules in a sandbox
   */
  getModulesInSandbox(sandboxId: string): string[] {
    const sandbox = this.sandboxes.get(sandboxId);
    return sandbox ? Array.from(sandbox.modules) : [];
  }

  /**
   * Record a sandbox violation
   */
  private recordViolation(
    moduleId: string,
    type: 'memory' | 'time' | 'cpu' | 'capability',
    message: string
  ): WASMSandboxViolation {
    const sandboxId = this.moduleToSandbox.get(moduleId);

    const violation: WASMSandboxViolation = {
      sandboxId: sandboxId ?? 'default',
      moduleId,
      type,
      message,
      timestamp: new Date(),
    };

    this.events.emit(WASMEvents.SANDBOX_VIOLATION, violation);
    logger.warn(`Sandbox violation: ${message}`, { moduleId, type });

    return violation;
  }

  /**
   * Validate and normalize capabilities
   */
  private validateCapabilities(capabilities: WASMCapability[]): WASMCapability[] {
    const validCapabilities: WASMCapability[] = [
      'memory', 'threads', 'simd', 'bulk-memory', 'reference-types',
      'tail-call', 'exception-handling', 'host-functions', 'file-read',
      'file-write', 'network', 'env', 'kv-read', 'kv-write', 'crypto', 'console',
    ];

    return capabilities.filter(cap => {
      if (!validCapabilities.includes(cap)) {
        logger.warn(`Unknown WASM capability: ${cap}`);
        return false;
      }
      return true;
    });
  }

  /**
   * Generate unique sandbox ID
   */
  private generateSandboxId(): string {
    return `sandbox_${Date.now()}_${++this.sandboxCounter}`;
  }

  /**
   * Create a default sandbox configuration
   */
  static createDefaultConfig(overrides?: Partial<WASMSandboxConfig>): WASMSandboxConfig {
    return {
      memoryLimit: 16 * 1024 * 1024, // 16MB default
      timeLimit: 5000, // 5 seconds
      capabilities: [...DEFAULT_WASM_CAPABILITIES],
      cpuLimit: {
        maxCallDepth: 1000,
        interruptInterval: 10000,
      },
      ...overrides,
    };
  }

  /**
   * Create a restrictive sandbox configuration
   */
  static createRestrictiveConfig(overrides?: Partial<WASMSandboxConfig>): WASMSandboxConfig {
    return {
      memoryLimit: 4 * 1024 * 1024, // 4MB
      timeLimit: 1000, // 1 second
      capabilities: ['memory', 'bulk-memory'],
      cpuLimit: {
        maxCallDepth: 100,
        interruptInterval: 1000,
      },
      ...overrides,
    };
  }

  /**
   * Create a permissive sandbox configuration
   */
  static createPermissiveConfig(overrides?: Partial<WASMSandboxConfig>): WASMSandboxConfig {
    return {
      memoryLimit: 256 * 1024 * 1024, // 256MB
      timeLimit: 60000, // 60 seconds
      capabilities: [
        'memory', 'threads', 'simd', 'bulk-memory', 'reference-types',
        'tail-call', 'host-functions', 'console', 'crypto',
      ],
      cpuLimit: {
        maxCallDepth: 10000,
        interruptInterval: 100000,
      },
      ...overrides,
    };
  }
}
