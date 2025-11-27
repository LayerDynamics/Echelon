/**
 * Layer 10: Search & Indexing Layer
 *
 * Full-text search, filtering, and content discovery.
 *
 * Responsibilities:
 * - Enable fast, relevant content discovery
 * - Support complex queries and filters
 * - Provide autocomplete and suggestions
 * - Scale to large datasets
 * - Maintain index consistency with database
 */

export { SearchEngine, type SearchOptions, type SearchResult } from './search.ts';
export { SearchIndex, type IndexedDocument, type IndexOptions } from './index.ts';
