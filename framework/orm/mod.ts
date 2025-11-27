/**
 * Layer 5: Domain/Data Layer (ORM)
 *
 * Core domain objects and data persistence abstractions.
 * Uses Deno KV as the primary database.
 *
 * Responsibilities:
 * - Define domain entities and relationships
 * - Abstract database operations
 * - Enforce data integrity and validation
 * - Provide query interfaces
 * - Manage schema evolution
 * - Encapsulate business rules
 */

export { Model, type ModelDefinition, type FieldDefinition } from './model.ts';
export { Query, type QueryOptions, type QueryResult } from './query.ts';
export { KVStore, type KVStoreOptions } from './kv.ts';
export { type Validator, validators } from './validators.ts';
