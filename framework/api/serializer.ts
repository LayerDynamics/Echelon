/**
 * API Serializer
 *
 * Transforms models to JSON API responses.
 */

export interface SerializerOptions {
  fields?: string[];
  exclude?: string[];
  include?: string[];
  transforms?: Record<string, (value: unknown) => unknown>;
}

/**
 * Serializer for API responses
 */
export class Serializer<T extends Record<string, unknown>> {
  private options: SerializerOptions;

  constructor(options: SerializerOptions = {}) {
    this.options = options;
  }

  /**
   * Serialize a single item
   */
  serialize(item: T): Record<string, unknown> {
    let result: Record<string, unknown> = {};

    // Get fields to include
    const fields = this.options.fields ?? Object.keys(item);
    const exclude = new Set(this.options.exclude ?? []);

    for (const field of fields) {
      if (exclude.has(field)) continue;

      let value = item[field];

      // Apply transform if defined
      if (this.options.transforms?.[field]) {
        value = this.options.transforms[field](value);
      }

      result[field] = value;
    }

    return result;
  }

  /**
   * Serialize multiple items
   */
  serializeMany(items: T[]): Record<string, unknown>[] {
    return items.map((item) => this.serialize(item));
  }

  /**
   * Create a response with metadata
   */
  response(data: T | T[], meta?: Record<string, unknown>): SerializedResponse {
    const isArray = Array.isArray(data);

    return {
      data: isArray ? this.serializeMany(data) : this.serialize(data),
      meta: {
        ...meta,
        count: isArray ? data.length : 1,
      },
    };
  }

  /**
   * Create a paginated response
   */
  paginate(
    items: T[],
    options: { page: number; perPage: number; total: number }
  ): PaginatedResponse {
    const totalPages = Math.ceil(options.total / options.perPage);

    return {
      data: this.serializeMany(items),
      meta: {
        page: options.page,
        perPage: options.perPage,
        total: options.total,
        totalPages,
        hasMore: options.page < totalPages,
      },
    };
  }

  /**
   * Create a new serializer with additional options
   */
  extend(options: SerializerOptions): Serializer<T> {
    return new Serializer({
      ...this.options,
      ...options,
      fields: options.fields ?? this.options.fields,
      exclude: [...(this.options.exclude ?? []), ...(options.exclude ?? [])],
      transforms: { ...this.options.transforms, ...options.transforms },
    });
  }
}

interface SerializedResponse {
  data: Record<string, unknown> | Record<string, unknown>[];
  meta: Record<string, unknown>;
}

interface PaginatedResponse {
  data: Record<string, unknown>[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/**
 * Create a serializer
 */
export function createSerializer<T extends Record<string, unknown>>(
  options?: SerializerOptions
): Serializer<T> {
  return new Serializer<T>(options);
}
