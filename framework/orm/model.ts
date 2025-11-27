/**
 * Model Definition
 *
 * Provides a base class for defining domain models with validation
 * and persistence to Deno KV.
 */

import { KVStore, getKV } from './kv.ts';
import type { Validator } from './validators.ts';

export interface FieldDefinition {
  type: 'string' | 'number' | 'boolean' | 'date' | 'json' | 'array';
  required?: boolean;
  default?: unknown;
  validate?: Validator[];
  index?: boolean;
}

export interface ModelDefinition {
  name: string;
  prefix: string;
  fields: Record<string, FieldDefinition>;
  timestamps?: boolean;
}

/**
 * Base Model class for Echelon ORM
 */
export abstract class Model<T extends Record<string, unknown>> {
  protected static definition: ModelDefinition;
  protected kv!: KVStore;

  id!: string;
  createdAt?: Date;
  updatedAt?: Date;

  protected data: T;

  constructor(data: Partial<T> = {}) {
    this.data = this.applyDefaults(data) as T;
    this.id = data.id as string ?? crypto.randomUUID();
  }

  /**
   * Get the model definition
   */
  static getDefinition(): ModelDefinition {
    return this.definition;
  }

  /**
   * Apply default values to data
   */
  private applyDefaults(data: Partial<T>): Partial<T> {
    const def = (this.constructor as typeof Model).definition;
    const result = { ...data };

    for (const [field, fieldDef] of Object.entries(def.fields)) {
      if (result[field as keyof T] === undefined && fieldDef.default !== undefined) {
        (result as Record<string, unknown>)[field] =
          typeof fieldDef.default === 'function'
            ? fieldDef.default()
            : fieldDef.default;
      }
    }

    return result;
  }

  /**
   * Validate the model data
   */
  validate(): string[] {
    const def = (this.constructor as typeof Model).definition;
    const errors: string[] = [];

    for (const [field, fieldDef] of Object.entries(def.fields)) {
      const value = this.data[field as keyof T];

      // Check required
      if (fieldDef.required && (value === undefined || value === null)) {
        errors.push(`${field} is required`);
        continue;
      }

      // Check type
      if (value !== undefined && value !== null) {
        const valueType = typeof value;
        const expectedType = fieldDef.type;

        if (expectedType === 'date' && !(value instanceof Date)) {
          errors.push(`${field} must be a Date`);
        } else if (expectedType === 'array' && !Array.isArray(value)) {
          errors.push(`${field} must be an array`);
        } else if (
          expectedType !== 'date' &&
          expectedType !== 'array' &&
          expectedType !== 'json' &&
          valueType !== expectedType
        ) {
          errors.push(`${field} must be a ${expectedType}`);
        }

        // Run custom validators
        if (fieldDef.validate) {
          for (const validator of fieldDef.validate) {
            const error = validator(value, field);
            if (error) errors.push(error);
          }
        }
      }
    }

    return errors;
  }

  /**
   * Get the KV key for this model
   */
  protected getKey(): Deno.KvKey {
    const def = (this.constructor as typeof Model).definition;
    return [def.prefix, this.id];
  }

  /**
   * Save the model to KV
   */
  async save(): Promise<void> {
    const errors = this.validate();
    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join(', ')}`);
    }

    const def = (this.constructor as typeof Model).definition;
    this.kv = await getKV();

    const now = new Date();
    if (def.timestamps) {
      if (!this.createdAt) {
        this.createdAt = now;
      }
      this.updatedAt = now;
    }

    const toStore = {
      ...this.data,
      id: this.id,
      createdAt: this.createdAt?.toISOString(),
      updatedAt: this.updatedAt?.toISOString(),
    };

    await this.kv.set(this.getKey(), toStore);
  }

  /**
   * Delete the model from KV
   */
  async delete(): Promise<void> {
    this.kv = await getKV();
    await this.kv.delete(this.getKey());
  }

  /**
   * Convert to plain object
   */
  toJSON(): T & { id: string; createdAt?: string; updatedAt?: string } {
    return {
      ...this.data,
      id: this.id,
      createdAt: this.createdAt?.toISOString(),
      updatedAt: this.updatedAt?.toISOString(),
    };
  }

  /**
   * Find by ID
   */
  static async findById<M extends Model<Record<string, unknown>>>(
    this: new (data?: Record<string, unknown>) => M,
    id: string
  ): Promise<M | null> {
    const kv = await getKV();
    const def = (this as unknown as typeof Model).definition;
    const result = await kv.get<Record<string, unknown>>([def.prefix, id]);

    if (!result) return null;

    const instance = new this(result);
    instance.id = id;
    if (result.createdAt) instance.createdAt = new Date(result.createdAt as string);
    if (result.updatedAt) instance.updatedAt = new Date(result.updatedAt as string);

    return instance;
  }

  /**
   * Find all records
   */
  static async findAll<M extends Model<Record<string, unknown>>>(
    this: new (data?: Record<string, unknown>) => M
  ): Promise<M[]> {
    const kv = await getKV();
    const def = (this as unknown as typeof Model).definition;
    const results = await kv.list<Record<string, unknown>>([def.prefix]);

    return results.map(({ value }) => {
      const instance = new this(value);
      instance.id = value.id as string;
      if (value.createdAt) instance.createdAt = new Date(value.createdAt as string);
      if (value.updatedAt) instance.updatedAt = new Date(value.updatedAt as string);
      return instance;
    });
  }
}
