/**
 * Search Index
 *
 * Manages search indexes for documents.
 */

import { getKV } from '../orm/kv.ts';

export interface IndexedDocument {
  id: string;
  [key: string]: unknown;
}

export interface IndexOptions {
  fields: string[];
  boosts?: Record<string, number>;
}

/**
 * Search index manager
 */
export class SearchIndex<T extends IndexedDocument> {
  private prefix: string;
  private name: string;
  private options: IndexOptions;

  constructor(name: string, options: IndexOptions, prefix = 'search') {
    this.name = name;
    this.options = options;
    this.prefix = prefix;
  }

  /**
   * Index a document
   */
  async index(document: T): Promise<void> {
    const kv = await getKV();

    // Extract content and tokenize
    const content: Record<string, unknown> = {};
    const tokens: Record<string, string[]> = {};

    for (const field of this.options.fields) {
      const value = this.getNestedValue(document, field);
      if (value !== undefined && value !== null) {
        content[field] = value;
        tokens[field] = this.tokenize(String(value));
      }
    }

    const indexedDoc = {
      id: document.id,
      document,
      content,
      tokens,
      boosts: this.options.boosts,
    };

    await kv.set([this.prefix, this.name, document.id], indexedDoc);
  }

  /**
   * Index multiple documents
   */
  async indexMany(documents: T[]): Promise<void> {
    for (const doc of documents) {
      await this.index(doc);
    }
  }

  /**
   * Remove a document from the index
   */
  async remove(id: string): Promise<void> {
    const kv = await getKV();
    await kv.delete([this.prefix, this.name, id]);
  }

  /**
   * Update a document in the index
   */
  async update(document: T): Promise<void> {
    await this.index(document);
  }

  /**
   * Clear the entire index
   */
  async clear(): Promise<void> {
    const kv = await getKV();
    const entries = await kv.list([this.prefix, this.name]);

    for (const entry of entries) {
      await kv.delete(entry.key);
    }
  }

  /**
   * Get index statistics
   */
  async stats(): Promise<{ documentCount: number; name: string }> {
    const kv = await getKV();
    const entries = await kv.list([this.prefix, this.name]);

    return {
      documentCount: entries.length,
      name: this.name,
    };
  }

  /**
   * Tokenize text
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }

  /**
   * Get nested value from object
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current, key) => {
      return current && typeof current === 'object'
        ? (current as Record<string, unknown>)[key]
        : undefined;
    }, obj as unknown);
  }
}

/**
 * Create a search index
 */
export function createIndex<T extends IndexedDocument>(
  name: string,
  options: IndexOptions
): SearchIndex<T> {
  return new SearchIndex<T>(name, options);
}
