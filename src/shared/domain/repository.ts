/**
 * Repository Interface
 *
 * Defines the contract for repositories that persist and retrieve aggregates.
 * Repositories provide the illusion of an in-memory collection of aggregates.
 *
 * @module
 */

import type { AggregateRoot } from './aggregate_root.ts';

/**
 * Base repository interface for aggregates
 */
export interface Repository<T extends AggregateRoot<TId>, TId = string> {
  /**
   * Find an aggregate by ID
   */
  findById(id: TId): Promise<T | null>;

  /**
   * Find all aggregates (with optional pagination)
   */
  findAll(options?: FindAllOptions): Promise<T[]>;

  /**
   * Save an aggregate (insert or update)
   */
  save(aggregate: T): Promise<void>;

  /**
   * Delete an aggregate
   */
  delete(id: TId): Promise<void>;

  /**
   * Check if aggregate exists
   */
  exists(id: TId): Promise<boolean>;
}

/**
 * Options for finding multiple aggregates
 */
export interface FindAllOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

/**
 * Query specification for finding aggregates by criteria
 */
export interface Specification<T> {
  isSatisfiedBy(aggregate: T): boolean;
  toQueryParams(): Record<string, unknown>;
}

/**
 * Extended repository interface with specification pattern
 */
export interface SpecificationRepository<T extends AggregateRoot<TId>, TId = string>
  extends Repository<T, TId> {
  /**
   * Find aggregates matching a specification
   */
  findBySpecification(spec: Specification<T>, options?: FindAllOptions): Promise<T[]>;

  /**
   * Count aggregates matching a specification
   */
  countBySpecification(spec: Specification<T>): Promise<number>;
}

/**
 * Result type for paginated queries
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  hasPrevious: boolean;
}
