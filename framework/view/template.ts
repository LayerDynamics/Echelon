/**
 * Template Engine
 *
 * Simple but powerful template engine with expression interpolation,
 * control flow, partial support, and template inheritance.
 *
 * ## Template Inheritance
 *
 * Templates can extend parent layouts using `{% extends "layout" %}`.
 * Parent templates define blocks that child templates can override.
 *
 * ### Parent Template (layout.html):
 * ```html
 * <!DOCTYPE html>
 * <html>
 * <head>
 *   <title>{% block title %}Default Title{% endblock %}</title>
 * </head>
 * <body>
 *   {% block content %}Default content{% endblock %}
 *   {% block footer %}Default footer{% endblock %}
 * </body>
 * </html>
 * ```
 *
 * ### Child Template (page.html):
 * ```html
 * {% extends "layout" %}
 * {% block title %}My Page{% endblock %}
 * {% block content %}
 *   <h1>Welcome</h1>
 *   {{ super }}  <!-- Include parent's content -->
 * {% endblock %}
 * ```
 */

export interface TemplateOptions {
  viewsPath?: string;
  extension?: string;
  cache?: boolean;
  maxInheritanceDepth?: number;
}

export interface TemplateContext {
  [key: string]: unknown;
}

/**
 * Parsed block from a template
 */
interface TemplateBlock {
  name: string;
  content: string;
  parent?: string;
  hasSuper: boolean;
}

/**
 * Parsed template with inheritance info
 */
interface ParsedTemplate {
  extends: string | null;
  blocks: Map<string, TemplateBlock>;
  content: string;
  rawContent: string;
}

const DEFAULT_OPTIONS: TemplateOptions = {
  viewsPath: './views',
  extension: '.html',
  cache: true,
  maxInheritanceDepth: 10,
};

/**
 * Template engine for Echelon
 */
export class TemplateEngine {
  private options: Required<TemplateOptions>;
  private cache = new Map<string, CompiledTemplate>();
  private templateCache = new Map<string, string>();
  private partials = new Map<string, string>();
  private layouts = new Map<string, string>();

  constructor(options: TemplateOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options } as Required<TemplateOptions>;
  }

  /**
   * Render a template file with full inheritance support
   */
  async render(name: string, context: TemplateContext = {}): Promise<string> {
    const template = await this.loadTemplate(name);
    return await this.renderStringAsync(template, context);
  }

  /**
   * Render a template string (synchronous, no inheritance file loading)
   */
  renderString(template: string, context: TemplateContext = {}): string {
    const compiled = this.compile(template);
    return compiled(context);
  }

  /**
   * Render a template string with async inheritance support
   */
  async renderStringAsync(template: string, context: TemplateContext = {}): Promise<string> {
    // Process inheritance chain
    const resolvedTemplate = await this.resolveInheritance(template);
    const compiled = this.compile(resolvedTemplate);
    return compiled(context);
  }

  /**
   * Register a partial template
   */
  registerPartial(name: string, template: string): void {
    this.partials.set(name, template);
  }

  /**
   * Register a layout template
   */
  registerLayout(name: string, template: string): void {
    this.layouts.set(name, template);
  }

  /**
   * Load a template file
   */
  private async loadTemplate(name: string): Promise<string> {
    const path = `${this.options.viewsPath}/${name}${this.options.extension}`;

    // Check template cache
    if (this.options.cache && this.templateCache.has(path)) {
      return this.templateCache.get(path)!;
    }

    const content = await Deno.readTextFile(path);

    if (this.options.cache) {
      this.templateCache.set(path, content);
    }

    return content;
  }

  /**
   * Resolve template inheritance chain
   */
  private async resolveInheritance(template: string, depth = 0): Promise<string> {
    if (depth > this.options.maxInheritanceDepth) {
      throw new Error(
        `Maximum template inheritance depth (${this.options.maxInheritanceDepth}) exceeded. ` +
          'Check for circular inheritance.'
      );
    }

    // Parse the template
    const parsed = this.parseTemplate(template);

    // No inheritance - return processed template
    if (!parsed.extends) {
      return this.processBlocks(template, new Map());
    }

    // Load parent template
    let parentTemplate: string;
    if (this.layouts.has(parsed.extends)) {
      parentTemplate = this.layouts.get(parsed.extends)!;
    } else {
      try {
        parentTemplate = await this.loadTemplate(parsed.extends);
      } catch {
        throw new Error(`Parent template not found: ${parsed.extends}`);
      }
    }

    // Recursively resolve parent's inheritance
    const resolvedParent = await this.resolveInheritance(parentTemplate, depth + 1);

    // Parse parent blocks
    const parentParsed = this.parseTemplate(resolvedParent);

    // Merge blocks - child blocks override parent blocks
    const mergedBlocks = new Map<string, TemplateBlock>();

    // Start with parent blocks
    for (const [name, block] of parentParsed.blocks) {
      mergedBlocks.set(name, block);
    }

    // Override with child blocks
    for (const [name, block] of parsed.blocks) {
      const parentBlock = mergedBlocks.get(name);

      if (block.hasSuper && parentBlock) {
        // Replace {{ super }} with parent block content
        const mergedContent = block.content.replace(
          /\{\{\s*super\s*\}\}/g,
          parentBlock.content
        );
        mergedBlocks.set(name, {
          ...block,
          content: mergedContent,
          parent: parentBlock.content,
        });
      } else {
        mergedBlocks.set(name, block);
      }
    }

    // Apply merged blocks to parent template
    return this.processBlocks(resolvedParent, mergedBlocks);
  }

  /**
   * Parse a template to extract extends and blocks
   */
  private parseTemplate(template: string): ParsedTemplate {
    // Extract extends directive
    const extendsRegex = /\{%\s*extends\s+['"](.+?)['"]\s*%\}/;
    const extendsMatch = template.match(extendsRegex);
    const extendsName = extendsMatch ? extendsMatch[1] : null;

    // Remove extends directive from content
    const contentWithoutExtends = template.replace(extendsRegex, '');

    // Extract all blocks
    const blocks = new Map<string, TemplateBlock>();
    const blockRegex = /\{%\s*block\s+(\w+)\s*%\}([\s\S]*?)\{%\s*endblock\s*%\}/g;

    let match;
    while ((match = blockRegex.exec(contentWithoutExtends)) !== null) {
      const [, name, content] = match;
      blocks.set(name, {
        name,
        content: content.trim(),
        hasSuper: /\{\{\s*super\s*\}\}/.test(content),
      });
    }

    // Content outside of blocks (only used if there's no extends)
    const contentOutsideBlocks = contentWithoutExtends.replace(blockRegex, '').trim();

    return {
      extends: extendsName,
      blocks,
      content: contentOutsideBlocks,
      rawContent: template,
    };
  }

  /**
   * Process block tags in a template with resolved block contents
   */
  private processBlocks(template: string, resolvedBlocks: Map<string, TemplateBlock>): string {
    // Remove extends directive
    let result = template.replace(/\{%\s*extends\s+['"](.+?)['"]\s*%\}/, '');

    // Replace block tags with resolved content
    const blockRegex = /\{%\s*block\s+(\w+)\s*%\}([\s\S]*?)\{%\s*endblock\s*%\}/g;

    result = result.replace(blockRegex, (_, name, defaultContent) => {
      const resolvedBlock = resolvedBlocks.get(name);
      if (resolvedBlock) {
        return resolvedBlock.content;
      }
      return defaultContent.trim();
    });

    return result;
  }

  /**
   * Compile a template string
   */
  private compile(template: string): CompiledTemplate {
    // Process template directives
    let processed = template;

    // Handle includes/partials
    processed = this.processIncludes(processed);

    // Handle conditionals
    processed = this.processConditionals(processed);

    // Handle loops
    processed = this.processLoops(processed);

    // Handle raw blocks (no processing)
    processed = this.processRawBlocks(processed);

    // Handle expressions
    processed = this.processExpressions(processed);

    // Create render function
    return (context: TemplateContext) => {
      return this.evaluateTemplate(processed, context);
    };
  }

  /**
   * Process raw blocks that should not be parsed
   */
  private processRawBlocks(template: string): string {
    const rawRegex = /\{%\s*raw\s*%\}([\s\S]*?)\{%\s*endraw\s*%\}/g;

    return template.replace(rawRegex, (_match, content) => {
      // Encode the content to prevent further processing
      return `<!--RAW:${btoa(content)}-->`;
    });
  }

  /**
   * Process include directives
   */
  private processIncludes(template: string): string {
    const includeRegex = /\{%\s*include\s+['"](.+?)['"]\s*%\}/g;

    return template.replace(includeRegex, (_match, partialName) => {
      const partial = this.partials.get(partialName);
      return partial ?? `<!-- Partial not found: ${partialName} -->`;
    });
  }

  /**
   * Process conditional blocks (if/elif/else)
   */
  private processConditionals(template: string): string {
    // Process if/elif/else/endif blocks
    // First handle simple if/endif
    let result = template;

    // Handle if/elif/else/endif chains
    const ifElseRegex = /\{%\s*if\s+(.+?)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;

    result = result.replace(ifElseRegex, (_match, condition, content) => {
      // Parse the content for elif and else blocks
      const parts: Array<{ condition: string | null; content: string }> = [];

      // Split by elif and else
      const elifElseRegex = /\{%\s*(?:elif|else\s+if)\s+(.+?)\s*%\}|\{%\s*else\s*%\}/g;
      let lastIndex = 0;
      let partMatch;

      const contentParts: string[] = [];
      const conditions: Array<string | null> = [condition];

      while ((partMatch = elifElseRegex.exec(content)) !== null) {
        // Content before this marker
        contentParts.push(content.slice(lastIndex, partMatch.index));

        // This condition (null for else)
        conditions.push(partMatch[1] || null);
        lastIndex = partMatch.index + partMatch[0].length;
      }

      // Remaining content
      contentParts.push(content.slice(lastIndex));

      // Build parts array
      for (let i = 0; i < contentParts.length; i++) {
        parts.push({
          condition: conditions[i] ?? null,
          content: contentParts[i],
        });
      }

      // Encode as marker
      const encoded = btoa(JSON.stringify(parts));
      return `<!--IFELIF:${encoded}-->`;
    });

    return result;
  }

  /**
   * Process loop blocks with index support
   */
  private processLoops(template: string): string {
    // Convert {% for item in items %} ... {% endfor %} to markers
    // Also supports {% for item, index in items %}
    const forRegex =
      /\{%\s*for\s+(\w+)(?:\s*,\s*(\w+))?\s+in\s+(\w+(?:\.\w+)*)\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g;

    return template.replace(forRegex, (_match, itemVar, indexVar, arrayPath, content) => {
      const encoded = btoa(
        JSON.stringify({
          item: itemVar,
          index: indexVar || null,
          array: arrayPath,
          content,
        })
      );
      return `<!--FORLOOP:${encoded}-->`;
    });
  }

  /**
   * Process expression interpolation
   */
  private processExpressions(template: string): string {
    // Convert {{ expression }} to markers
    const exprRegex = /\{\{\s*(.+?)\s*\}\}/g;

    return template.replace(exprRegex, (_match, expression) => {
      return `<!--EXPR:${btoa(expression)}-->`;
    });
  }

  /**
   * Evaluate the processed template
   */
  private evaluateTemplate(template: string, context: TemplateContext): string {
    let result = template;

    // Evaluate raw blocks first (restore unprocessed content)
    const rawRegex = /<!--RAW:(.+?)-->/g;
    result = result.replace(rawRegex, (_match, contentB64) => {
      return atob(contentB64);
    });

    // Evaluate if/elif/else conditionals
    const ifElifRegex = /<!--IFELIF:(.+?)-->/g;
    result = result.replace(ifElifRegex, (_match, encodedB64) => {
      const parts: Array<{ condition: string | null; content: string }> = JSON.parse(
        atob(encodedB64)
      );

      for (const part of parts) {
        if (part.condition === null) {
          // else block - always render if we get here
          return this.evaluateTemplate(part.content, context);
        }

        const value = this.evaluateCondition(part.condition, context);
        if (value) {
          return this.evaluateTemplate(part.content, context);
        }
      }

      return '';
    });

    // Evaluate enhanced loops
    const forLoopRegex = /<!--FORLOOP:(.+?)-->/g;
    result = result.replace(forLoopRegex, (_match, encodedB64) => {
      const loop: {
        item: string;
        index: string | null;
        array: string;
        content: string;
      } = JSON.parse(atob(encodedB64));

      const array = this.getValueByPath(context, loop.array);
      if (!Array.isArray(array)) return '';

      return array
        .map((item, idx) => {
          const loopContext: TemplateContext = {
            ...context,
            [loop.item]: item,
            loop: {
              index: idx,
              index1: idx + 1,
              first: idx === 0,
              last: idx === array.length - 1,
              length: array.length,
            },
          };

          if (loop.index) {
            loopContext[loop.index] = idx;
          }

          return this.evaluateTemplate(loop.content, loopContext);
        })
        .join('');
    });

    // Evaluate expressions
    const exprRegex = /<!--EXPR:(.+?)-->/g;
    result = result.replace(exprRegex, (_match, exprB64) => {
      const expression = atob(exprB64);
      const value = this.evaluateExpression(expression, context);

      // Check for safe filter (skip escaping)
      if (expression.includes('|safe')) {
        return String(value ?? '');
      }

      return this.escapeHtml(String(value ?? ''));
    });

    return result;
  }

  /**
   * Evaluate a condition expression
   */
  private evaluateCondition(condition: string, context: TemplateContext): boolean {
    // Handle simple comparisons
    const comparisonRegex = /^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/;
    const match = condition.match(comparisonRegex);

    if (match) {
      const [, left, operator, right] = match;
      const leftValue = this.evaluateExpression(left.trim(), context);
      const rightValue = this.evaluateSimpleValue(right.trim(), context);

      switch (operator) {
        case '==':
          return leftValue == rightValue;
        case '!=':
          return leftValue != rightValue;
        case '>':
          return Number(leftValue) > Number(rightValue);
        case '<':
          return Number(leftValue) < Number(rightValue);
        case '>=':
          return Number(leftValue) >= Number(rightValue);
        case '<=':
          return Number(leftValue) <= Number(rightValue);
      }
    }

    // Handle logical operators
    if (condition.includes(' and ')) {
      const parts = condition.split(' and ').map((p) => p.trim());
      return parts.every((p) => this.evaluateCondition(p, context));
    }

    if (condition.includes(' or ')) {
      const parts = condition.split(' or ').map((p) => p.trim());
      return parts.some((p) => this.evaluateCondition(p, context));
    }

    // Handle not operator
    if (condition.startsWith('not ')) {
      return !this.evaluateCondition(condition.slice(4), context);
    }

    // Simple truthy check
    const value = this.evaluateExpression(condition, context);
    return Boolean(value);
  }

  /**
   * Evaluate a simple value (literal or variable)
   */
  private evaluateSimpleValue(value: string, context: TemplateContext): unknown {
    // String literal
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }

    // Number literal
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      return parseFloat(value);
    }

    // Boolean literals
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null' || value === 'none') return null;

    // Variable
    return this.evaluateExpression(value, context);
  }

  /**
   * Evaluate an expression in context
   */
  private evaluateExpression(expression: string, context: TemplateContext): unknown {
    // Handle filters (e.g., value|upper)
    const [path, ...filters] = expression.split('|').map((s) => s.trim());

    // Get value from context
    let value = this.getValueByPath(context, path);

    // Apply filters
    for (const filter of filters) {
      value = this.applyFilter(value, filter);
    }

    return value;
  }

  /**
   * Get a nested value by path
   */
  private getValueByPath(obj: TemplateContext, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Apply a filter to a value
   */
  private applyFilter(value: unknown, filter: string): unknown {
    // Parse filter with arguments: filter(arg1, arg2)
    const filterMatch = filter.match(/^(\w+)(?:\((.+)\))?$/);
    if (!filterMatch) return value;

    const [, filterName, argsStr] = filterMatch;
    const args = argsStr ? this.parseFilterArgs(argsStr) : [];

    switch (filterName) {
      // String filters
      case 'upper':
        return String(value).toUpperCase();
      case 'lower':
        return String(value).toLowerCase();
      case 'capitalize':
        return String(value).charAt(0).toUpperCase() + String(value).slice(1).toLowerCase();
      case 'title':
        return String(value).replace(/\b\w/g, (c) => c.toUpperCase());
      case 'trim':
        return String(value).trim();
      case 'strip':
        return String(value).trim();
      case 'truncate': {
        const length = Number(args[0]) || 50;
        const ending = String(args[1] ?? '...');
        const str = String(value);
        return str.length > length ? str.slice(0, length - ending.length) + ending : str;
      }
      case 'wordwrap': {
        const width = Number(args[0]) || 79;
        const str = String(value);
        const regex = new RegExp(`.{1,${width}}(\\s|$)`, 'g');
        return str.match(regex)?.join('\n') ?? str;
      }
      case 'replace': {
        const search = String(args[0] ?? '');
        const replacement = String(args[1] ?? '');
        return String(value).replace(new RegExp(search, 'g'), replacement);
      }
      case 'split': {
        const separator = String(args[0] ?? ',');
        return String(value).split(separator);
      }
      case 'join': {
        const separator = String(args[0] ?? ', ');
        return Array.isArray(value) ? value.join(separator) : String(value);
      }
      case 'reverse':
        if (Array.isArray(value)) return [...value].reverse();
        return String(value).split('').reverse().join('');

      // Number filters
      case 'abs':
        return Math.abs(Number(value));
      case 'round': {
        const precision = Number(args[0]) || 0;
        const multiplier = Math.pow(10, precision);
        return Math.round(Number(value) * multiplier) / multiplier;
      }
      case 'floor':
        return Math.floor(Number(value));
      case 'ceil':
        return Math.ceil(Number(value));

      // Date filters
      case 'date': {
        const format = String(args[0] ?? 'YYYY-MM-DD');
        const date = value instanceof Date ? value : new Date(String(value));
        return this.formatDate(date, format);
      }

      // Array filters
      case 'first':
        return Array.isArray(value) ? value[0] : value;
      case 'last':
        return Array.isArray(value) ? value[value.length - 1] : value;
      case 'length':
        return Array.isArray(value) ? value.length : String(value).length;
      case 'sort':
        if (!Array.isArray(value)) return value;
        return [...value].sort();
      case 'unique':
        if (!Array.isArray(value)) return value;
        return [...new Set(value)];
      case 'slice': {
        const start = Number(args[0]) || 0;
        const end = args[1] ? Number(args[1]) : undefined;
        if (Array.isArray(value)) return value.slice(start, end);
        return String(value).slice(start, end);
      }

      // Type conversion filters
      case 'int':
        return parseInt(String(value), 10);
      case 'float':
        return parseFloat(String(value));
      case 'string':
        return String(value);
      case 'json':
        return JSON.stringify(value);
      case 'json_pretty':
        return JSON.stringify(value, null, 2);

      // Utility filters
      case 'default': {
        const defaultValue = args[0] ?? '';
        return value ?? defaultValue;
      }
      case 'safe':
        return value; // Marker for safe (no escaping)
      case 'escape':
        return this.escapeHtml(String(value));
      case 'urlencode':
        return encodeURIComponent(String(value));
      case 'urldecode':
        return decodeURIComponent(String(value));
      case 'nl2br':
        return String(value).replace(/\n/g, '<br>\n');
      case 'striptags':
        return String(value).replace(/<[^>]*>/g, '');

      default:
        return value;
    }
  }

  /**
   * Parse filter arguments
   */
  private parseFilterArgs(argsStr: string): string[] {
    const args: string[] = [];
    let current = '';
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < argsStr.length; i++) {
      const char = argsStr[i];

      if (inString) {
        if (char === stringChar) {
          inString = false;
          args.push(current);
          current = '';
        } else {
          current += char;
        }
      } else if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
      } else if (char === ',') {
        if (current.trim()) {
          args.push(current.trim());
        }
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      args.push(current.trim());
    }

    return args;
  }

  /**
   * Format a date using simple format strings
   */
  private formatDate(date: Date, format: string): string {
    const pad = (n: number, width = 2) => String(n).padStart(width, '0');

    const replacements: Record<string, string> = {
      'YYYY': String(date.getFullYear()),
      'YY': String(date.getFullYear()).slice(-2),
      'MM': pad(date.getMonth() + 1),
      'M': String(date.getMonth() + 1),
      'DD': pad(date.getDate()),
      'D': String(date.getDate()),
      'HH': pad(date.getHours()),
      'H': String(date.getHours()),
      'mm': pad(date.getMinutes()),
      'm': String(date.getMinutes()),
      'ss': pad(date.getSeconds()),
      's': String(date.getSeconds()),
    };

    let result = format;
    for (const [key, value] of Object.entries(replacements)) {
      result = result.replace(key, value);
    }

    return result;
  }

  /**
   * Escape HTML entities
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

type CompiledTemplate = (context: TemplateContext) => string;

// Default template engine instance
let defaultEngine: TemplateEngine | null = null;

/**
 * Get the default template engine
 */
export function getTemplateEngine(): TemplateEngine {
  if (!defaultEngine) {
    defaultEngine = new TemplateEngine();
  }
  return defaultEngine;
}
