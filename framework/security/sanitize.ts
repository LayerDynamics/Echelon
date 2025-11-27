/**
 * Input Sanitization
 *
 * Sanitize user input to prevent XSS and injection attacks.
 */

/**
 * HTML entity map for escaping
 */
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

/**
 * Escape HTML special characters
 */
export function escapeHtml(str: string): string {
  return str.replace(/[&<>"'`=/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Unescape HTML entities back to characters
 */
export function unescapeHtml(str: string): string {
  const REVERSE_ENTITIES: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#x27;': "'",
    '&#x2F;': '/',
    '&#x60;': '`',
    '&#x3D;': '=',
    '&#39;': "'",
    '&apos;': "'",
  };

  return str.replace(
    /&(?:amp|lt|gt|quot|#x27|#x2F|#x60|#x3D|#39|apos);/g,
    (entity) => REVERSE_ENTITIES[entity] || entity
  );
}

/**
 * Strip all HTML tags from string
 */
export function stripTags(str: string): string {
  return str.replace(/<[^>]*>/g, '');
}

/**
 * Strip specific HTML tags
 */
export function stripSpecificTags(str: string, tags: string[]): string {
  const pattern = new RegExp(`</?(?:${tags.join('|')})[^>]*>`, 'gi');
  return str.replace(pattern, '');
}

/**
 * Allow only specific HTML tags
 */
export function allowTags(str: string, allowedTags: string[]): string {
  const allowedSet = new Set(allowedTags.map((t) => t.toLowerCase()));

  return str.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g, (match, tag) => {
    return allowedSet.has(tag.toLowerCase()) ? match : '';
  });
}

/**
 * Sanitize for safe HTML display
 */
export function sanitizeHtml(str: string, options: SanitizeHtmlOptions = {}): string {
  let result = str;

  // Strip dangerous tags first
  const dangerousTags = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'];
  result = stripSpecificTags(result, dangerousTags);

  // Remove event handlers
  result = result.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  result = result.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '');

  // Remove javascript: URLs
  result = result.replace(/javascript:/gi, '');
  result = result.replace(/data:/gi, 'data-blocked:');

  // If allowedTags specified, filter to only those
  if (options.allowedTags) {
    result = allowTags(result, options.allowedTags);
  }

  // If stripAll, remove all tags
  if (options.stripAll) {
    result = stripTags(result);
  }

  // Escape if requested
  if (options.escape) {
    result = escapeHtml(result);
  }

  return result;
}

interface SanitizeHtmlOptions {
  allowedTags?: string[];
  stripAll?: boolean;
  escape?: boolean;
}

/**
 * Sanitize a string for use in SQL (basic protection)
 * Note: Always use parameterized queries instead
 */
export function escapeSql(str: string): string {
  // deno-lint-ignore no-control-regex
  const nullChar = /\x00/g;
  // deno-lint-ignore no-control-regex
  const subChar = /\x1a/g;

  return str
    .replace(/'/g, "''")
    .replace(/\\/g, '\\\\')
    .replace(nullChar, '\\0')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(subChar, '\\Z');
}

/**
 * Sanitize a string for use in regular expressions
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Sanitize a string for use in JSON
 */
export function escapeJson(str: string): string {
  return JSON.stringify(str).slice(1, -1);
}

/**
 * Sanitize a string for use in URLs
 */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Block dangerous protocols
    const dangerousProtocols = ['javascript:', 'data:', 'vbscript:'];
    if (dangerousProtocols.some((p) => parsed.protocol.toLowerCase() === p)) {
      return '';
    }

    return parsed.href;
  } catch {
    // If not a valid URL, return empty
    return '';
  }
}

/**
 * Sanitize filename for safe file operations
 */
export function sanitizeFilename(filename: string): string {
  // Remove path traversal
  let result = filename.replace(/\.\./g, '');

  // Remove path separators
  result = result.replace(/[/\\]/g, '');

  // Remove null bytes
  // deno-lint-ignore no-control-regex
  result = result.replace(/\x00/g, '');

  // Remove control characters
  // deno-lint-ignore no-control-regex
  result = result.replace(/[\x00-\x1f\x80-\x9f]/g, '');

  // Limit length
  if (result.length > 255) {
    const ext = result.lastIndexOf('.');
    if (ext > 0) {
      const extension = result.slice(ext);
      result = result.slice(0, 255 - extension.length) + extension;
    } else {
      result = result.slice(0, 255);
    }
  }

  return result;
}

/**
 * Sanitize object recursively
 */
export function sanitizeObject<T>(
  obj: T,
  sanitizer: (value: string) => string = escapeHtml
): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizer(obj) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, sanitizer)) as T;
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = sanitizeObject(value, sanitizer);
    }
    return result as T;
  }

  return obj;
}

/**
 * Remove invisible characters that could be used for spoofing
 */
export function removeInvisibleChars(str: string): string {
  // Remove zero-width characters
  return str.replace(
    /[\u200B-\u200D\u2060\uFEFF\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180E\u2000-\u200F\u202A-\u202F\u205F-\u206F\u3000\u3164\uFFA0]/g,
    ''
  );
}

/**
 * Normalize unicode to prevent homograph attacks
 */
export function normalizeUnicode(str: string): string {
  return str.normalize('NFKC');
}
