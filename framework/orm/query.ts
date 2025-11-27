/**
 * Query Builder
 *
 * Fluent interface for building queries against Deno KV.
 */

import { KVStore, getKV } from './kv.ts';

export interface QueryOptions {
  limit?: number;
  offset?: number;
  reverse?: boolean;
}

export interface QueryResult<T> {
  data: T[];
  count: number;
  hasMore: boolean;
}

/**
 * Query builder for Deno KV
 */
export class Query<T extends Record<string, unknown>> {
  private prefix: Deno.KvKey;
  private filters: ((item: T) => boolean)[] = [];
  private sortFn: ((a: T, b: T) => number) | null = null;
  private limitValue: number | null = null;
  private offsetValue = 0;
  private reverseValue = false;

  constructor(prefix: Deno.KvKey) {
    this.prefix = prefix;
  }

  /**
   * Add a filter condition
   */
  where(field: keyof T, operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'in' | 'contains', value: unknown): this {
    this.filters.push((item) => {
      const fieldValue = item[field];

      switch (operator) {
        case '=':
          return fieldValue === value;
        case '!=':
          return fieldValue !== value;
        case '>':
          return (fieldValue as number) > (value as number);
        case '<':
          return (fieldValue as number) < (value as number);
        case '>=':
          return (fieldValue as number) >= (value as number);
        case '<=':
          return (fieldValue as number) <= (value as number);
        case 'in':
          return (value as unknown[]).includes(fieldValue);
        case 'contains':
          if (Array.isArray(fieldValue)) {
            return fieldValue.includes(value);
          }
          if (typeof fieldValue === 'string') {
            return fieldValue.includes(value as string);
          }
          return false;
        default:
          return true;
      }
    });

    return this;
  }

  /**
   * Add a custom filter function
   */
  filter(fn: (item: T) => boolean): this {
    this.filters.push(fn);
    return this;
  }

  /**
   * Sort results
   */
  orderBy(field: keyof T, direction: 'asc' | 'desc' = 'asc'): this {
    this.sortFn = (a, b) => {
      const aVal = a[field];
      const bVal = b[field];

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      const comparison = aVal < bVal ? -1 : 1;
      return direction === 'asc' ? comparison : -comparison;
    };

    return this;
  }

  /**
   * Limit results
   */
  limit(count: number): this {
    this.limitValue = count;
    return this;
  }

  /**
   * Skip results
   */
  offset(count: number): this {
    this.offsetValue = count;
    return this;
  }

  /**
   * Reverse the order
   */
  reverse(): this {
    this.reverseValue = true;
    return this;
  }

  /**
   * Execute the query
   */
  async execute(): Promise<QueryResult<T>> {
    const kv = await getKV();
    const allItems = await kv.list<T>(this.prefix, { reverse: this.reverseValue });

    // Apply filters
    let filtered = allItems
      .map(({ value }) => value)
      .filter((item) => this.filters.every((fn) => fn(item)));

    // Apply sorting
    if (this.sortFn) {
      filtered.sort(this.sortFn);
    }

    const totalCount = filtered.length;

    // Apply offset
    if (this.offsetValue > 0) {
      filtered = filtered.slice(this.offsetValue);
    }

    // Apply limit
    const hasMore = this.limitValue !== null && filtered.length > this.limitValue;
    if (this.limitValue !== null) {
      filtered = filtered.slice(0, this.limitValue);
    }

    return {
      data: filtered,
      count: totalCount,
      hasMore,
    };
  }

  /**
   * Get all results
   */
  async all(): Promise<T[]> {
    const result = await this.execute();
    return result.data;
  }

  /**
   * Get the first result
   */
  async first(): Promise<T | null> {
    this.limitValue = 1;
    const result = await this.execute();
    return result.data[0] ?? null;
  }

  /**
   * Count matching results
   */
  async count(): Promise<number> {
    const result = await this.execute();
    return result.count;
  }

  /**
   * Check if any results exist
   */
  async exists(): Promise<boolean> {
    const count = await this.count();
    return count > 0;
  }
}

/**
 * Create a new query builder
 */
export function query<T extends Record<string, unknown>>(prefix: Deno.KvKey): Query<T> {
  return new Query<T>(prefix);
}
