/**
 * Search Engine
 *
 * Simple full-text search using Deno KV.
 */

import { getKV } from '../orm/kv.ts';

export interface SearchOptions {
  limit?: number;
  offset?: number;
  fields?: string[];
  fuzzy?: boolean;
  highlight?: boolean;
}

export interface SearchResult<T> {
  items: SearchHit<T>[];
  total: number;
  query: string;
  took: number;
}

export interface SearchHit<T> {
  document: T;
  score: number;
  highlights?: Record<string, string[]>;
}

/**
 * Search engine for Echelon
 */
export class SearchEngine {
  private prefix: string;

  constructor(prefix = 'search') {
    this.prefix = prefix;
  }

  /**
   * Search documents
   */
  async search<T extends Record<string, unknown>>(
    indexName: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult<T>> {
    const startTime = performance.now();
    const limit = options.limit ?? 10;
    const offset = options.offset ?? 0;

    // Get all indexed documents
    const kv = await getKV();
    const docs = await kv.list<IndexedDoc<T>>([this.prefix, indexName]);

    // Tokenize query
    const queryTokens = this.tokenize(query.toLowerCase());

    // Score each document
    const scored: SearchHit<T>[] = [];

    for (const { value } of docs) {
      const score = this.scoreDocument(value, queryTokens, options);

      if (score > 0) {
        const hit: SearchHit<T> = {
          document: value.document,
          score,
        };

        if (options.highlight) {
          hit.highlights = this.getHighlights(value, queryTokens);
        }

        scored.push(hit);
      }
    }

    // Sort by score
    scored.sort((a, b) => b.score - a.score);

    // Apply pagination
    const items = scored.slice(offset, offset + limit);

    return {
      items,
      total: scored.length,
      query,
      took: performance.now() - startTime,
    };
  }

  /**
   * Score a document against query tokens
   */
  private scoreDocument<T>(
    doc: IndexedDoc<T>,
    queryTokens: string[],
    options: SearchOptions
  ): number {
    let score = 0;
    const fields = options.fields ?? Object.keys(doc.tokens);

    for (const field of fields) {
      const fieldTokens = doc.tokens[field] ?? [];
      const fieldBoost = doc.boosts?.[field] ?? 1;

      for (const queryToken of queryTokens) {
        for (const fieldToken of fieldTokens) {
          if (options.fuzzy) {
            // Fuzzy matching
            if (this.fuzzyMatch(queryToken, fieldToken)) {
              score += fieldBoost * 0.5;
            }
          }

          if (fieldToken === queryToken) {
            score += fieldBoost;
          } else if (fieldToken.startsWith(queryToken)) {
            score += fieldBoost * 0.7;
          } else if (fieldToken.includes(queryToken)) {
            score += fieldBoost * 0.3;
          }
        }
      }
    }

    return score;
  }

  /**
   * Get highlighted snippets
   */
  private getHighlights<T>(
    doc: IndexedDoc<T>,
    queryTokens: string[]
  ): Record<string, string[]> {
    const highlights: Record<string, string[]> = {};

    for (const [field, content] of Object.entries(doc.content)) {
      const matches: string[] = [];
      const text = String(content);

      for (const token of queryTokens) {
        const regex = new RegExp(`(.{0,30})(${this.escapeRegex(token)})(.{0,30})`, 'gi');
        let match;

        while ((match = regex.exec(text)) !== null) {
          matches.push(`${match[1]}<em>${match[2]}</em>${match[3]}`);
        }
      }

      if (matches.length > 0) {
        highlights[field] = matches.slice(0, 3);
      }
    }

    return highlights;
  }

  /**
   * Tokenize text into searchable tokens
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }

  /**
   * Fuzzy match using Levenshtein distance
   */
  private fuzzyMatch(a: string, b: string, maxDistance = 2): boolean {
    if (Math.abs(a.length - b.length) > maxDistance) return false;

    const matrix: number[][] = [];

    for (let i = 0; i <= a.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= b.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    return matrix[a.length][b.length] <= maxDistance;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

interface IndexedDoc<T> {
  id: string;
  document: T;
  content: Record<string, unknown>;
  tokens: Record<string, string[]>;
  boosts?: Record<string, number>;
}

// Default search engine instance
let defaultEngine: SearchEngine | null = null;

/**
 * Get the default search engine
 */
export function getSearchEngine(): SearchEngine {
  if (!defaultEngine) {
    defaultEngine = new SearchEngine();
  }
  return defaultEngine;
}
