/**
 * URL Pattern Utilities
 *
 * Provides utilities for working with URL patterns and
 * extracting parameters from URLs.
 */

export type PatternParams = Record<string, string>;

/**
 * URL Pattern Matcher
 */
export class URLPatternMatcher {
  private patterns: Map<string, URLPattern> = new Map();

  /**
   * Compile and cache a pattern
   */
  compile(path: string): URLPattern {
    let pattern = this.patterns.get(path);
    if (!pattern) {
      pattern = new URLPattern({ pathname: path });
      this.patterns.set(path, pattern);
    }
    return pattern;
  }

  /**
   * Match a URL against a pattern
   */
  match(pattern: string | URLPattern, url: string): PatternParams | null {
    const p = typeof pattern === 'string' ? this.compile(pattern) : pattern;
    const result = p.exec(url);

    if (result) {
      return result.pathname.groups as PatternParams;
    }

    return null;
  }

  /**
   * Test if a URL matches a pattern
   */
  test(pattern: string | URLPattern, url: string): boolean {
    const p = typeof pattern === 'string' ? this.compile(pattern) : pattern;
    return p.test(url);
  }

  /**
   * Clear the pattern cache
   */
  clear(): void {
    this.patterns.clear();
  }
}

/**
 * Convert an Express-style path to URLPattern format
 * e.g., '/users/:id' -> '/users/{id}'
 */
export function toURLPattern(path: string): string {
  return path.replace(/:(\w+)/g, '{$1}');
}

/**
 * Convert a URLPattern path to Express style
 * e.g., '/users/{id}' -> '/users/:id'
 */
export function toExpressPath(path: string): string {
  return path.replace(/\{(\w+)\}/g, ':$1');
}

/**
 * Build a URL from a pattern and parameters
 */
export function buildUrl(
  pattern: string,
  params: PatternParams,
  query?: Record<string, string | string[]>
): string {
  // Replace path parameters
  let url = pattern;
  for (const [key, value] of Object.entries(params)) {
    url = url.replace(`:${key}`, encodeURIComponent(value));
    url = url.replace(`{${key}}`, encodeURIComponent(value));
  }

  // Add query string
  if (query && Object.keys(query).length > 0) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) {
        for (const v of value) {
          searchParams.append(key, v);
        }
      } else {
        searchParams.append(key, value);
      }
    }
    url += '?' + searchParams.toString();
  }

  return url;
}

/**
 * Parse path parameters from a pattern
 */
export function parsePathParams(pattern: string): string[] {
  const params: string[] = [];

  // Match :param or {param}
  const regex = /:(\w+)|\{(\w+)\}/g;
  let match;

  while ((match = regex.exec(pattern)) !== null) {
    params.push(match[1] || match[2]);
  }

  return params;
}
