/**
 * Query
 *
 * Base interface for queries in CQRS pattern.
 * Queries represent requests to read data from the system.
 *
 * @module
 */

/**
 * Base interface for all queries
 */
export interface Query {
  readonly queryId: string;
  readonly timestamp: Date;
  readonly userId: string;
  readonly workspaceId?: string;
}

/**
 * Query metadata
 */
export interface QueryMetadata {
  queryId: string;
  queryType: string;
  timestamp: Date;
  userId: string;
  workspaceId?: string;
}

/**
 * Result of query execution
 */
export interface QueryResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: Error;
  cached?: boolean;
  executionTime?: number;
}

/**
 * Pagination parameters for queries
 */
export interface PaginationParams {
  page: number;
  pageSize: number;
  offset?: number;
}

/**
 * Sorting parameters for queries
 */
export interface SortingParams {
  field: string;
  direction: 'asc' | 'desc';
}

/**
 * Filtering parameters for queries
 */
export interface FilterParams {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'startsWith';
  value: unknown;
}

/**
 * Query options
 */
export interface QueryOptions {
  pagination?: PaginationParams;
  sorting?: SortingParams[];
  filters?: FilterParams[];
  includeDeleted?: boolean;
}

/**
 * Create query metadata
 */
export function createQueryMetadata(
  queryType: string,
  userId: string,
  workspaceId?: string
): QueryMetadata {
  return {
    queryId: crypto.randomUUID(),
    queryType,
    timestamp: new Date(),
    userId,
    workspaceId,
  };
}

/**
 * Type guard for Query
 */
export function isQuery(obj: unknown): obj is Query {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'queryId' in obj &&
    'timestamp' in obj &&
    'userId' in obj
  );
}

/**
 * Calculate offset from page and pageSize
 */
export function calculateOffset(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}

/**
 * Create default pagination params
 */
export function createPaginationParams(
  page: number = 1,
  pageSize: number = 20
): PaginationParams {
  return {
    page,
    pageSize,
    offset: calculateOffset(page, pageSize),
  };
}
