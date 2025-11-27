/**
 * HTML Utilities
 *
 * Tagged template literals and utilities for safe HTML generation.
 */

/**
 * Safe HTML content wrapper
 */
export class SafeHtml {
  constructor(public readonly content: string) {}

  toString(): string {
    return this.content;
  }
}

/**
 * Escape HTML entities
 */
export function escape(value: unknown): string {
  if (value instanceof SafeHtml) {
    return value.content;
  }

  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Mark content as safe (no escaping)
 */
export function raw(content: string): SafeHtml {
  return new SafeHtml(content);
}

/**
 * HTML tagged template literal
 *
 * Automatically escapes interpolated values unless wrapped with raw().
 *
 * @example
 * const name = '<script>alert("xss")</script>';
 * html`<div>Hello, ${name}!</div>`
 * // Output: <div>Hello, &lt;script&gt;alert("xss")&lt;/script&gt;!</div>
 */
export function html(
  strings: TemplateStringsArray,
  ...values: unknown[]
): SafeHtml {
  let result = '';

  for (let i = 0; i < strings.length; i++) {
    result += strings[i];

    if (i < values.length) {
      result += escape(values[i]);
    }
  }

  return new SafeHtml(result);
}

/**
 * Create an HTML element
 */
export function createElement(
  tag: string,
  attributes: Record<string, string | boolean | number | null | undefined> = {},
  children: (string | SafeHtml)[] = []
): SafeHtml {
  const attrs = Object.entries(attributes)
    .filter(([, value]) => value !== null && value !== undefined && value !== false)
    .map(([key, value]) => {
      if (value === true) return key;
      return `${key}="${escape(String(value))}"`;
    })
    .join(' ');

  const attrStr = attrs ? ` ${attrs}` : '';
  const childrenStr = children.map((c) => (c instanceof SafeHtml ? c.content : escape(c))).join('');

  // Self-closing tags
  const selfClosing = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'];

  if (selfClosing.includes(tag.toLowerCase()) && children.length === 0) {
    return new SafeHtml(`<${tag}${attrStr} />`);
  }

  return new SafeHtml(`<${tag}${attrStr}>${childrenStr}</${tag}>`);
}

/**
 * HTML fragment (multiple elements)
 */
export function fragment(...children: (string | SafeHtml)[]): SafeHtml {
  const content = children
    .map((c) => (c instanceof SafeHtml ? c.content : escape(c)))
    .join('');
  return new SafeHtml(content);
}

/**
 * Conditional rendering
 */
export function when(condition: boolean, content: string | SafeHtml): SafeHtml {
  if (condition) {
    return content instanceof SafeHtml ? content : new SafeHtml(escape(content));
  }
  return new SafeHtml('');
}

/**
 * Map over an array and render each item
 */
export function each<T>(
  items: T[],
  render: (item: T, index: number) => string | SafeHtml
): SafeHtml {
  const content = items
    .map((item, index) => {
      const result = render(item, index);
      return result instanceof SafeHtml ? result.content : escape(result);
    })
    .join('');
  return new SafeHtml(content);
}
