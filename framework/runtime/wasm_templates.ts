/**
 * WASM Template System
 *
 * Provides pre-built templates for common WASM patterns and use cases.
 * Templates can be parameterized and compiled to WASM modules.
 */

import type { WASMModule, WASMFunctionSignature } from './wasm_types.ts';

/**
 * Template parameter
 */
export interface TemplateParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  default?: unknown;
  required?: boolean;
}

/**
 * Template metadata
 */
export interface WASMTemplate {
  id: string;
  name: string;
  description: string;
  category: 'computation' | 'transform' | 'plugin' | 'utility' | 'crypto' | 'custom';
  parameters: TemplateParameter[];
  exports: Record<string, WASMFunctionSignature>;

  // Language-specific template sources
  typescript?: string;
  rust?: string;
  wat?: string; // WebAssembly Text Format
}

/**
 * Template compilation result
 */
export interface TemplateCompilationResult {
  success: boolean;
  wasm?: Uint8Array;
  wat?: string;
  error?: Error;
  warnings?: string[];
}

/**
 * Template parameter values
 */
export type TemplateParams = Record<string, unknown>;

/**
 * WASM Template Registry
 *
 * Manages pre-built templates and custom template registration.
 */
export class WASMTemplateRegistry {
  private templates: Map<string, WASMTemplate> = new Map();

  constructor() {
    this.registerBuiltinTemplates();
  }

  /**
   * Register a custom template
   */
  register(template: WASMTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * Get a template by ID
   */
  get(id: string): WASMTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * List all templates, optionally filtered by category
   */
  list(category?: WASMTemplate['category']): WASMTemplate[] {
    const templates = Array.from(this.templates.values());
    return category ? templates.filter((t) => t.category === category) : templates;
  }

  /**
   * Compile a template with parameters
   */
  async compile(templateId: string, params: TemplateParams = {}): Promise<TemplateCompilationResult> {
    const template = this.templates.get(templateId);
    if (!template) {
      return {
        success: false,
        error: new Error(`Template not found: ${templateId}`),
      };
    }

    // Validate parameters
    const validation = this.validateParams(template, params);
    if (!validation.valid) {
      return {
        success: false,
        error: new Error(`Invalid parameters: ${validation.errors.join(', ')}`),
      };
    }

    // Fill in defaults
    const fullParams = this.fillDefaults(template, params);

    // Generate source code from template
    let source: string;
    let language: 'typescript' | 'rust' | 'wat';

    if (template.wat) {
      source = this.interpolateTemplate(template.wat, fullParams);
      language = 'wat';
    } else if (template.typescript) {
      source = this.interpolateTemplate(template.typescript, fullParams);
      language = 'typescript';
    } else if (template.rust) {
      source = this.interpolateTemplate(template.rust, fullParams);
      language = 'rust';
    } else {
      return {
        success: false,
        error: new Error('Template has no source code'),
      };
    }

    // Compile to WASM
    try {
      if (language === 'wat') {
        // For WAT, we need a WAT->WASM compiler
        // For now, return an error indicating it's not yet implemented
        return {
          success: false,
          wat: source,
          error: new Error('WAT compilation not yet implemented'),
        };
      } else {
        // For TypeScript/Rust, we'd use the WASMGeneratorCore
        // For now, return the source with a note
        return {
          success: false,
          error: new Error(`${language} compilation requires WASMGeneratorCore integration`),
          warnings: [
            `Generated ${language} source:`,
            source,
          ],
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Validate template parameters
   */
  private validateParams(template: WASMTemplate, params: TemplateParams): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required parameters
    for (const param of template.parameters) {
      if (param.required && !(param.name in params)) {
        errors.push(`Missing required parameter: ${param.name}`);
      }
    }

    // Type check parameters
    for (const [key, value] of Object.entries(params)) {
      const param = template.parameters.find((p) => p.name === key);
      if (!param) {
        errors.push(`Unknown parameter: ${key}`);
        continue;
      }

      // Basic type validation
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (param.type === 'object' && actualType !== 'object') {
        errors.push(`Parameter ${key} must be an object`);
      } else if (param.type !== 'object' && param.type !== 'array' && param.type !== actualType) {
        errors.push(`Parameter ${key} must be a ${param.type}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Fill in default parameter values
   */
  private fillDefaults(template: WASMTemplate, params: TemplateParams): TemplateParams {
    const result = { ...params };

    for (const param of template.parameters) {
      if (!(param.name in result) && param.default !== undefined) {
        result[param.name] = param.default;
      }
    }

    return result;
  }

  /**
   * Interpolate template with parameters
   *
   * Supports:
   * - {{param}} - simple substitution
   * - {{param|upper}} - with pipe filters
   * - {{#if param}}...{{/if}} - conditionals
   * - {{#each param}}...{{/each}} - loops
   */
  private interpolateTemplate(template: string, params: TemplateParams): string {
    let result = template;

    // Simple substitution: {{param}}
    result = result.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, name) => {
      const value = params[name];
      return value !== undefined ? String(value) : match;
    });

    // Pipe filters: {{param|filter}}
    result = result.replace(/\{\{([a-zA-Z0-9_]+)\|([a-z]+)\}\}/g, (match, name, filter) => {
      const value = params[name];
      if (value === undefined) return match;

      const strValue = String(value);
      switch (filter) {
        case 'upper':
          return strValue.toUpperCase();
        case 'lower':
          return strValue.toLowerCase();
        case 'capitalize':
          return strValue.charAt(0).toUpperCase() + strValue.slice(1);
        default:
          return strValue;
      }
    });

    // Conditionals: {{#if param}}...{{/if}}
    result = result.replace(/\{\{#if\s+([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, name, content) => {
      const value = params[name];
      return value ? content : '';
    });

    // Loops: {{#each param}}...{{/each}}
    result = result.replace(/\{\{#each\s+([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, name, content) => {
      const value = params[name];
      if (!Array.isArray(value)) return '';

      return value.map((item, index) => {
        let itemContent = content;
        // Replace {{this}} with item value
        itemContent = itemContent.replace(/\{\{this\}\}/g, String(item));
        // Replace {{@index}} with array index
        itemContent = itemContent.replace(/\{\{@index\}\}/g, String(index));
        return itemContent;
      }).join('');
    });

    return result;
  }

  /**
   * Register built-in templates
   */
  private registerBuiltinTemplates(): void {
    // ========================================================================
    // Computation Templates
    // ========================================================================

    this.register({
      id: 'fibonacci',
      name: 'Fibonacci Calculator',
      description: 'Calculates Fibonacci numbers recursively',
      category: 'computation',
      parameters: [],
      exports: {
        fibonacci: { params: ['i32'], results: ['i32'] },
      },
      typescript: `
export function fibonacci(n: i32): i32 {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
      `.trim(),
      rust: `
#[no_mangle]
pub extern "C" fn fibonacci(n: i32) -> i32 {
    if n <= 1 {
        return n;
    }
    fibonacci(n - 1) + fibonacci(n - 2)
}
      `.trim(),
    });

    this.register({
      id: 'sum-array',
      name: 'Array Sum',
      description: 'Sums an array of numbers',
      category: 'computation',
      parameters: [],
      exports: {
        sum: { params: ['i32', 'i32'], results: ['i32'] },
      },
      typescript: `
export function sum(ptr: i32, len: i32): i32 {
  let total: i32 = 0;
  for (let i: i32 = 0; i < len; i++) {
    total += load<i32>(ptr + i * 4);
  }
  return total;
}
      `.trim(),
    });

    this.register({
      id: 'factorial',
      name: 'Factorial',
      description: 'Calculates factorial of a number',
      category: 'computation',
      parameters: [],
      exports: {
        factorial: { params: ['i32'], results: ['i32'] },
      },
      typescript: `
export function factorial(n: i32): i32 {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
      `.trim(),
      rust: `
#[no_mangle]
pub extern "C" fn factorial(n: i32) -> i32 {
    if n <= 1 {
        return 1;
    }
    n * factorial(n - 1)
}
      `.trim(),
    });

    // ========================================================================
    // Transform Templates
    // ========================================================================

    this.register({
      id: 'string-transform',
      name: 'String Transform',
      description: 'Parameterized string transformation',
      category: 'transform',
      parameters: [
        {
          name: 'operation',
          type: 'string',
          description: 'Transformation operation: uppercase, lowercase, reverse',
          default: 'uppercase',
          required: true,
        },
      ],
      exports: {
        transform: { params: ['i32', 'i32'], results: ['i32'] },
      },
      typescript: `
export function transform(ptr: i32, len: i32): i32 {
  // Read string from memory
  const bytes = new Uint8Array(memory.buffer, ptr, len);
  let str = String.fromCharCode(...Array.from(bytes));

  // Apply transformation
  {{#if operation}}
  {{#if operation|upper}}
  if ("{{operation}}" === "uppercase") {
    str = str.toUpperCase();
  } else if ("{{operation}}" === "lowercase") {
    str = str.toLowerCase();
  } else if ("{{operation}}" === "reverse") {
    str = str.split('').reverse().join('');
  }
  {{/if}}
  {{/if}}

  // Write back to memory
  const output = Uint8Array.from(str.split('').map(c => c.charCodeAt(0)));
  const outputPtr = allocate(output.length);
  new Uint8Array(memory.buffer, outputPtr, output.length).set(output);

  return outputPtr;
}
      `.trim(),
    });

    // ========================================================================
    // Plugin Templates
    // ========================================================================

    this.register({
      id: 'plugin-interface',
      name: 'Plugin Interface',
      description: 'Standard plugin interface with lifecycle hooks',
      category: 'plugin',
      parameters: [
        {
          name: 'pluginName',
          type: 'string',
          description: 'Name of the plugin',
          required: true,
        },
        {
          name: 'version',
          type: 'string',
          description: 'Plugin version',
          default: '1.0.0',
        },
      ],
      exports: {
        init: { params: [], results: ['i32'] },
        execute: { params: ['i32', 'i32'], results: ['i32'] },
        cleanup: { params: [], results: [] },
        getVersion: { params: [], results: ['i32'] },
      },
      typescript: `
// Plugin: {{pluginName}} v{{version}}

let initialized = false;

export function init(): i32 {
  if (initialized) return 0;
  initialized = true;
  return 1; // Success
}

export function execute(inputPtr: i32, inputLen: i32): i32 {
  if (!initialized) return 0;

  // Plugin logic here
  // Read input from inputPtr/inputLen
  // Process data
  // Return result pointer

  return 0;
}

export function cleanup(): void {
  initialized = false;
}

export function getVersion(): i32 {
  // Return version string pointer
  const version = "{{version}}";
  return 0; // Placeholder
}
      `.trim(),
    });

    // ========================================================================
    // Utility Templates
    // ========================================================================

    this.register({
      id: 'memory-allocator',
      name: 'Simple Memory Allocator',
      description: 'Basic memory allocation for WASM modules',
      category: 'utility',
      parameters: [],
      exports: {
        allocate: { params: ['i32'], results: ['i32'] },
        deallocate: { params: ['i32'], results: [] },
      },
      typescript: `
let heapPtr: i32 = 1024; // Start after initial memory

export function allocate(size: i32): i32 {
  const ptr = heapPtr;
  heapPtr += size;

  // Grow memory if needed
  const pagesNeeded = ((heapPtr >> 16) + 1) - memory.size();
  if (pagesNeeded > 0) {
    memory.grow(pagesNeeded);
  }

  return ptr;
}

export function deallocate(ptr: i32): void {
  // Simple allocator doesn't support deallocation
  // A real allocator would maintain a free list
}
      `.trim(),
    });

    this.register({
      id: 'crc32',
      name: 'CRC32 Checksum',
      description: 'Calculate CRC32 checksum of data',
      category: 'crypto',
      parameters: [],
      exports: {
        crc32: { params: ['i32', 'i32'], results: ['i32'] },
      },
      typescript: `
const CRC_TABLE = new Uint32Array(256);

// Initialize CRC table
for (let i = 0; i < 256; i++) {
  let crc = i;
  for (let j = 0; j < 8; j++) {
    crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
  }
  CRC_TABLE[i] = crc;
}

export function crc32(ptr: i32, len: i32): i32 {
  let crc = 0xFFFFFFFF;

  for (let i = 0; i < len; i++) {
    const byte = load<u8>(ptr + i);
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xFF];
  }

  return ~crc;
}
      `.trim(),
    });
  }
}

/**
 * Get global template registry instance
 */
let globalRegistry: WASMTemplateRegistry | null = null;

export function getTemplateRegistry(): WASMTemplateRegistry {
  if (!globalRegistry) {
    globalRegistry = new WASMTemplateRegistry();
  }
  return globalRegistry;
}

/**
 * Quick compile helper
 */
export async function compileTemplate(
  templateId: string,
  params?: TemplateParams
): Promise<TemplateCompilationResult> {
  const registry = getTemplateRegistry();
  return registry.compile(templateId, params);
}

/**
 * List all available templates
 */
export function listTemplates(category?: WASMTemplate['category']): WASMTemplate[] {
  const registry = getTemplateRegistry();
  return registry.list(category);
}
