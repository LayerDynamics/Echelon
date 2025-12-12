/**
 * WASM Validation and Security Scanning
 *
 * Provides validation and security scanning for WASM modules before execution.
 * Helps detect potentially malicious or resource-intensive modules.
 */

import type { WASMModule } from './wasm_types.ts';
import { getLogger } from '../telemetry/logger.ts';

const logger = getLogger();

/**
 * Validation severity levels
 */
export enum ValidationSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/**
 * Validation issue
 */
export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  metadata: {
    size: number;
    exports: number;
    imports: number;
    memory: {
      initial: number;
      maximum?: number;
    };
    tables: number;
    functions: number;
    globals: number;
  };
}

/**
 * Security scan result
 */
export interface SecurityScanResult {
  safe: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  issues: ValidationIssue[];
  recommendations: string[];
  entropy?: number; // Shannon entropy of module bytes (0-8)
}

/**
 * Validation options
 */
export interface ValidationOptions {
  maxSize?: number; // Maximum module size in bytes
  maxExports?: number; // Maximum number of exports
  maxImports?: number; // Maximum number of imports
  maxMemory?: number; // Maximum initial memory in pages
  maxFunctions?: number; // Maximum number of functions
  requireMemory?: boolean; // Require memory export
  allowedImports?: string[]; // Whitelist of allowed import modules
  forbiddenExports?: string[]; // Blacklist of forbidden export names
  strictMode?: boolean; // Enable strict validation
}

/**
 * Security scan options
 */
export interface SecurityScanOptions {
  checkResourceLimits?: boolean;
  checkSuspiciousPatterns?: boolean;
  checkImports?: boolean;
  checkExports?: boolean;
  checkMemoryAccess?: boolean;
}

/**
 * WASM Validator
 *
 * Validates WASM modules against security and resource constraints.
 */
export class WASMValidator {
  private options: Required<ValidationOptions>;

  constructor(options: ValidationOptions = {}) {
    this.options = {
      maxSize: options.maxSize ?? 10 * 1024 * 1024, // 10MB default
      maxExports: options.maxExports ?? 1000,
      maxImports: options.maxImports ?? 100,
      maxMemory: options.maxMemory ?? 256, // 256 pages = 16MB
      maxFunctions: options.maxFunctions ?? 10000,
      requireMemory: options.requireMemory ?? false,
      allowedImports: options.allowedImports ?? [],
      forbiddenExports: options.forbiddenExports ?? [],
      strictMode: options.strictMode ?? false,
    };
  }

  /**
   * Validate a WASM module
   */
  async validate(module: WASMModule | Uint8Array): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];

    let compiledModule: WebAssembly.Module;
    let bytes: Uint8Array;

    // Get module bytes
    if (module instanceof Uint8Array) {
      bytes = module;
      try {
        compiledModule = await WebAssembly.compile(bytes as BufferSource);
      } catch (error) {
        return {
          valid: false,
          issues: [
            {
              severity: ValidationSeverity.CRITICAL,
              code: 'INVALID_WASM',
              message: `Failed to compile WASM module: ${error}`,
            },
          ],
          metadata: {
            size: bytes.length,
            exports: 0,
            imports: 0,
            memory: { initial: 0 },
            tables: 0,
            functions: 0,
            globals: 0,
          },
        };
      }
    } else {
      compiledModule = module.compiledModule;
      bytes = new Uint8Array(0); // We don't have access to original bytes
    }

    // Extract module metadata
    const metadata = await this.extractMetadata(compiledModule);

    // Size validation
    if (bytes.length > 0 && bytes.length > this.options.maxSize) {
      issues.push({
        severity: ValidationSeverity.ERROR,
        code: 'SIZE_EXCEEDED',
        message: `Module size ${bytes.length} exceeds maximum ${this.options.maxSize}`,
        details: { size: bytes.length, max: this.options.maxSize },
      });
    }

    // Export count validation
    if (metadata.exports > this.options.maxExports) {
      issues.push({
        severity: ValidationSeverity.WARNING,
        code: 'TOO_MANY_EXPORTS',
        message: `Module has ${metadata.exports} exports, exceeds maximum ${this.options.maxExports}`,
        details: { exports: metadata.exports, max: this.options.maxExports },
      });
    }

    // Import count validation
    if (metadata.imports > this.options.maxImports) {
      issues.push({
        severity: ValidationSeverity.WARNING,
        code: 'TOO_MANY_IMPORTS',
        message: `Module has ${metadata.imports} imports, exceeds maximum ${this.options.maxImports}`,
        details: { imports: metadata.imports, max: this.options.maxImports },
      });
    }

    // Memory validation
    if (metadata.memory.initial > this.options.maxMemory) {
      issues.push({
        severity: ValidationSeverity.ERROR,
        code: 'MEMORY_EXCEEDED',
        message: `Initial memory ${metadata.memory.initial} pages exceeds maximum ${this.options.maxMemory}`,
        details: { initial: metadata.memory.initial, max: this.options.maxMemory },
      });
    }

    if (this.options.requireMemory && metadata.memory.initial === 0) {
      issues.push({
        severity: ValidationSeverity.ERROR,
        code: 'MEMORY_REQUIRED',
        message: 'Module must export memory',
      });
    }

    // Function count validation
    if (metadata.functions > this.options.maxFunctions) {
      issues.push({
        severity: ValidationSeverity.WARNING,
        code: 'TOO_MANY_FUNCTIONS',
        message: `Module has ${metadata.functions} functions, exceeds maximum ${this.options.maxFunctions}`,
        details: { functions: metadata.functions, max: this.options.maxFunctions },
      });
    }

    // Determine if module is valid
    const valid = !issues.some((issue) =>
      issue.severity === ValidationSeverity.ERROR || issue.severity === ValidationSeverity.CRITICAL
    );

    return {
      valid,
      issues,
      metadata,
    };
  }

  /**
   * Extract metadata from a compiled module
   */
  private async extractMetadata(module: WebAssembly.Module): Promise<ValidationResult['metadata']> {
    // Instantiate to get exports
    let instance: WebAssembly.Instance;
    try {
      instance = await WebAssembly.instantiate(module, {});
    } catch {
      // If instantiation fails, return minimal metadata
      return {
        size: 0,
        exports: 0,
        imports: 0,
        memory: { initial: 0 },
        tables: 0,
        functions: 0,
        globals: 0,
      };
    }

    const exports = Object.keys(instance.exports);
    const imports = WebAssembly.Module.imports(module);
    const customSections = WebAssembly.Module.customSections(module, 'name');

    // Get memory info
    let memoryInitial = 0;
    let memoryMaximum: number | undefined;
    if (instance.exports.memory instanceof WebAssembly.Memory) {
      const memory = instance.exports.memory as WebAssembly.Memory;
      memoryInitial = memory.buffer.byteLength / 65536; // Convert to pages
    }

    // Count different export types
    const functions = exports.filter((name) => typeof instance.exports[name] === 'function').length;
    const tables = exports.filter((name) => instance.exports[name] instanceof WebAssembly.Table).length;
    const globals = exports.filter((name) => instance.exports[name] instanceof WebAssembly.Global).length;

    return {
      size: 0, // We don't have access to original bytes here
      exports: exports.length,
      imports: imports.length,
      memory: {
        initial: memoryInitial,
        maximum: memoryMaximum,
      },
      tables,
      functions,
      globals,
    };
  }
}

/**
 * WASM Security Scanner
 *
 * Scans WASM modules for potential security issues and suspicious patterns.
 */
export class WASMSecurityScanner {
  private options: Required<SecurityScanOptions>;

  constructor(options: SecurityScanOptions = {}) {
    this.options = {
      checkResourceLimits: options.checkResourceLimits ?? true,
      checkSuspiciousPatterns: options.checkSuspiciousPatterns ?? true,
      checkImports: options.checkImports ?? true,
      checkExports: options.checkExports ?? true,
      checkMemoryAccess: options.checkMemoryAccess ?? true,
    };
  }

  /**
   * Scan a WASM module for security issues
   */
  async scan(module: WASMModule | Uint8Array): Promise<SecurityScanResult> {
    const issues: ValidationIssue[] = [];
    const recommendations: string[] = [];

    let compiledModule: WebAssembly.Module;
    let bytes: Uint8Array;

    // Get module bytes and compiled module
    if (module instanceof Uint8Array) {
      bytes = module;
      try {
        compiledModule = await WebAssembly.compile(bytes as BufferSource);
      } catch (error) {
        return {
          safe: false,
          riskLevel: 'critical',
          issues: [
            {
              severity: ValidationSeverity.CRITICAL,
              code: 'SCAN_FAILED',
              message: `Failed to compile module for scanning: ${error}`,
            },
          ],
          recommendations: ['Do not execute this module'],
        };
      }
    } else {
      compiledModule = module.compiledModule;
      bytes = new Uint8Array(0);
    }

    // Resource limits check
    if (this.options.checkResourceLimits) {
      await this.checkResourceLimits(compiledModule, issues, recommendations);
    }

    // Import analysis
    if (this.options.checkImports) {
      this.checkImports(compiledModule, issues, recommendations);
    }

    // Export analysis
    if (this.options.checkExports) {
      await this.checkExports(compiledModule, issues, recommendations);
    }

    // Suspicious patterns (if we have bytes)
    if (this.options.checkSuspiciousPatterns && bytes.length > 0) {
      this.checkSuspiciousPatterns(bytes, issues, recommendations);
    }

    // Calculate entropy if we have bytes
    const entropy = bytes.length > 0 ? this.calculateEntropy(bytes) : undefined;

    // Calculate risk level
    const riskLevel = this.calculateRiskLevel(issues);

    // Determine if module is safe
    const safe = riskLevel === 'low' && !issues.some((issue) =>
      issue.severity === ValidationSeverity.CRITICAL
    );

    return {
      safe,
      riskLevel,
      issues,
      recommendations,
      entropy,
    };
  }

  /**
   * Check resource limits
   */
  private async checkResourceLimits(
    module: WebAssembly.Module,
    issues: ValidationIssue[],
    recommendations: string[]
  ): Promise<void> {
    try {
      const instance = await WebAssembly.instantiate(module, {});

      // Check memory
      if (instance.exports.memory instanceof WebAssembly.Memory) {
        const memory = instance.exports.memory as WebAssembly.Memory;
        const pages = memory.buffer.byteLength / 65536;

        if (pages > 1000) {
          // >64MB
          issues.push({
            severity: ValidationSeverity.WARNING,
            code: 'HIGH_MEMORY',
            message: `Module requests ${pages} pages (${(pages * 64).toFixed(0)}KB) of memory`,
            details: { pages },
          });
          recommendations.push('Monitor memory usage during execution');
        }
      }

      // Check for excessive tables
      const tables = Object.values(instance.exports).filter((exp) => exp instanceof WebAssembly.Table).length;
      if (tables > 10) {
        issues.push({
          severity: ValidationSeverity.WARNING,
          code: 'MANY_TABLES',
          message: `Module has ${tables} tables`,
          details: { tables },
        });
      }
    } catch (error) {
      logger.warn('Failed to check resource limits');
    }
  }

  /**
   * Check imports for suspicious patterns
   */
  private checkImports(
    module: WebAssembly.Module,
    issues: ValidationIssue[],
    recommendations: string[]
  ): void {
    const imports = WebAssembly.Module.imports(module);

    // Check for suspicious import modules
    const suspiciousModules = ['eval', 'Function', 'WebAssembly'];
    const suspiciousImports = imports.filter((imp) => suspiciousModules.includes(imp.module));

    if (suspiciousImports.length > 0) {
      issues.push({
        severity: ValidationSeverity.WARNING,
        code: 'SUSPICIOUS_IMPORTS',
        message: 'Module imports potentially dangerous functions',
        details: {
          imports: suspiciousImports.map((imp) => `${imp.module}.${imp.name}`),
        },
      });
      recommendations.push('Review import usage carefully');
    }

    // Check for excessive imports
    if (imports.length > 50) {
      issues.push({
        severity: ValidationSeverity.INFO,
        code: 'MANY_IMPORTS',
        message: `Module has ${imports.length} imports`,
        details: { imports: imports.length },
      });
    }

    // Check for network-related imports
    const networkImports = imports.filter((imp) =>
      imp.module.includes('fetch') ||
      imp.module.includes('http') ||
      imp.module.includes('ws') ||
      imp.name.includes('fetch') ||
      imp.name.includes('connect')
    );

    if (networkImports.length > 0) {
      issues.push({
        severity: ValidationSeverity.WARNING,
        code: 'NETWORK_ACCESS',
        message: 'Module may attempt network access',
        details: {
          imports: networkImports.map((imp) => `${imp.module}.${imp.name}`),
        },
      });
      recommendations.push('Use sandboxing to restrict network access');
    }
  }

  /**
   * Check exports for suspicious patterns
   */
  private async checkExports(
    module: WebAssembly.Module,
    issues: ValidationIssue[],
    recommendations: string[]
  ): Promise<void> {
    try {
      const instance = await WebAssembly.instantiate(module, {});
      const exports = Object.keys(instance.exports);

      // Check for obfuscated export names
      const obfuscated = exports.filter((name) => {
        // Detect base64-like or random strings
        return name.length > 20 && /^[A-Za-z0-9_]+$/.test(name) && !/[aeiou]/.test(name.toLowerCase());
      });

      if (obfuscated.length > exports.length * 0.3) {
        // >30% obfuscated
        issues.push({
          severity: ValidationSeverity.WARNING,
          code: 'OBFUSCATED_EXPORTS',
          message: 'Module contains potentially obfuscated export names',
          details: { obfuscatedCount: obfuscated.length, totalExports: exports.length },
        });
        recommendations.push('Verify module source and integrity');
      }

      // Check for suspicious export names
      const suspicious = ['eval', 'exec', 'system', 'shell', 'cmd'];
      const suspiciousExports = exports.filter((name) =>
        suspicious.some((s) => name.toLowerCase().includes(s))
      );

      if (suspiciousExports.length > 0) {
        issues.push({
          severity: ValidationSeverity.WARNING,
          code: 'SUSPICIOUS_EXPORTS',
          message: 'Module exports functions with suspicious names',
          details: { exports: suspiciousExports },
        });
      }
    } catch (error) {
      logger.warn('Failed to check exports');
    }
  }

  /**
   * Check for suspicious byte patterns
   */
  private checkSuspiciousPatterns(
    bytes: Uint8Array,
    issues: ValidationIssue[],
    recommendations: string[]
  ): void {
    // Check for WASM magic number
    if (bytes[0] !== 0x00 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) {
      issues.push({
        severity: ValidationSeverity.CRITICAL,
        code: 'INVALID_MAGIC',
        message: 'Invalid WASM magic number',
      });
      return;
    }

    // Check version
    const version = bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24);
    if (version !== 1) {
      issues.push({
        severity: ValidationSeverity.WARNING,
        code: 'UNKNOWN_VERSION',
        message: `Unknown WASM version: ${version}`,
        details: { version },
      });
    }

    // Check for high entropy (potential encryption/packing)
    const entropy = this.calculateEntropy(bytes);
    if (entropy > 7.5) {
      // High entropy threshold
      issues.push({
        severity: ValidationSeverity.WARNING,
        code: 'HIGH_ENTROPY',
        message: 'Module has high entropy, may be packed or encrypted',
        details: { entropy: entropy.toFixed(2) },
      });
      recommendations.push('Verify module has not been tampered with');
    }
  }

  /**
   * Calculate Shannon entropy of byte array
   */
  private calculateEntropy(bytes: Uint8Array): number {
    const frequencies = new Map<number, number>();
    const len = bytes.length;

    // Count byte frequencies
    for (const byte of bytes) {
      frequencies.set(byte, (frequencies.get(byte) || 0) + 1);
    }

    // Calculate entropy
    let entropy = 0;
    for (const count of frequencies.values()) {
      const probability = count / len;
      entropy -= probability * Math.log2(probability);
    }

    return entropy;
  }

  /**
   * Calculate overall risk level
   */
  private calculateRiskLevel(issues: ValidationIssue[]): 'low' | 'medium' | 'high' | 'critical' {
    if (issues.some((i) => i.severity === ValidationSeverity.CRITICAL)) {
      return 'critical';
    }

    const errorCount = issues.filter((i) => i.severity === ValidationSeverity.ERROR).length;
    const warningCount = issues.filter((i) => i.severity === ValidationSeverity.WARNING).length;

    if (errorCount > 0) return 'high';
    if (warningCount >= 3) return 'medium';
    if (warningCount > 0) return 'low';

    return 'low';
  }
}

/**
 * Quick validation helper
 */
export async function validateWASM(
  module: WASMModule | Uint8Array,
  options?: ValidationOptions
): Promise<ValidationResult> {
  const validator = new WASMValidator(options);
  return validator.validate(module);
}

/**
 * Quick security scan helper
 */
export async function scanWASM(
  module: WASMModule | Uint8Array,
  options?: SecurityScanOptions
): Promise<SecurityScanResult> {
  const scanner = new WASMSecurityScanner(options);
  return scanner.scan(module);
}
