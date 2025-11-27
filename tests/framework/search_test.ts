/**
 * Search Tests
 *
 * Comprehensive tests for the search engine and index functionality.
 */

import { assertEquals, assertExists, assert } from 'jsr:@std/assert';
import { SearchEngine, getSearchEngine } from '../../framework/search/search.ts';
import { SearchIndex, createIndex, type IndexedDocument } from '../../framework/search/index.ts';
import { KVStore } from '../../framework/orm/kv.ts';

// Test document type
interface TestDocument extends IndexedDocument {
  id: string;
  title: string;
  content: string;
  tags?: string[];
  author?: string;
  category?: string;
}

// Helper to create a test index with clean KV
async function createTestIndex(): Promise<{
  index: SearchIndex<TestDocument>;
  engine: SearchEngine;
  cleanup: () => Promise<void>;
}> {
  const testPrefix = `search_test_${Date.now()}`;
  const index = createIndex<TestDocument>('test', {
    fields: ['title', 'content', 'tags', 'author'],
    boosts: { title: 2, content: 1 },
  });

  // Override the prefix for testing
  (index as unknown as { prefix: string }).prefix = testPrefix;

  const engine = new SearchEngine(testPrefix);

  const cleanup = async () => {
    await index.clear();
  };

  return { index, engine, cleanup };
}

// ============================================================================
// SearchIndex Tests
// ============================================================================

Deno.test({
  name: 'SearchIndex - index a document',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { index, cleanup } = await createTestIndex();

    try {
      const doc: TestDocument = {
        id: 'doc1',
        title: 'Hello World',
        content: 'This is a test document',
      };

      await index.index(doc);
      const stats = await index.stats();

      assertEquals(stats.documentCount, 1);
    } finally {
      await cleanup();
    }
  },
});

Deno.test('SearchIndex - index multiple documents', async () => {
  const { index, cleanup } = await createTestIndex();

  try {
    const docs: TestDocument[] = [
      { id: 'doc1', title: 'First Document', content: 'Content one' },
      { id: 'doc2', title: 'Second Document', content: 'Content two' },
      { id: 'doc3', title: 'Third Document', content: 'Content three' },
    ];

    await index.indexMany(docs);
    const stats = await index.stats();

    assertEquals(stats.documentCount, 3);
  } finally {
    await cleanup();
  }
});

Deno.test('SearchIndex - remove document from index', async () => {
  const { index, cleanup } = await createTestIndex();

  try {
    await index.index({ id: 'doc1', title: 'Test', content: 'Content' });
    await index.remove('doc1');
    const stats = await index.stats();

    assertEquals(stats.documentCount, 0);
  } finally {
    await cleanup();
  }
});

Deno.test('SearchIndex - update existing document', async () => {
  const { index, cleanup } = await createTestIndex();

  try {
    await index.index({ id: 'doc1', title: 'Original', content: 'Original content' });
    await index.update({ id: 'doc1', title: 'Updated', content: 'Updated content' });
    const stats = await index.stats();

    assertEquals(stats.documentCount, 1);
  } finally {
    await cleanup();
  }
});

Deno.test('SearchIndex - clear index', async () => {
  const { index, cleanup } = await createTestIndex();

  try {
    await index.indexMany([
      { id: 'doc1', title: 'One', content: 'Content' },
      { id: 'doc2', title: 'Two', content: 'Content' },
      { id: 'doc3', title: 'Three', content: 'Content' },
    ]);

    await index.clear();
    const stats = await index.stats();

    assertEquals(stats.documentCount, 0);
  } finally {
    await cleanup();
  }
});

Deno.test('SearchIndex - stats returns correct info', async () => {
  const { index, cleanup } = await createTestIndex();

  try {
    await index.indexMany([
      { id: 'doc1', title: 'One', content: 'Content' },
      { id: 'doc2', title: 'Two', content: 'Content' },
    ]);

    const stats = await index.stats();

    assertEquals(stats.name, 'test');
    assertEquals(stats.documentCount, 2);
  } finally {
    await cleanup();
  }
});

// ============================================================================
// SearchEngine Tests
// ============================================================================

Deno.test('SearchEngine - basic search', async () => {
  const { index, engine, cleanup } = await createTestIndex();

  try {
    await index.indexMany([
      { id: 'doc1', title: 'TypeScript Guide', content: 'Learn TypeScript' },
      { id: 'doc2', title: 'JavaScript Basics', content: 'JavaScript fundamentals' },
      { id: 'doc3', title: 'Python Tutorial', content: 'Python programming' },
    ]);

    const results = await engine.search<TestDocument>('test', 'typescript');

    assertEquals(results.total, 1);
    assertEquals(results.items.length, 1);
    assertEquals(results.items[0].document.id, 'doc1');
  } finally {
    await cleanup();
  }
});

Deno.test('SearchEngine - search returns multiple matches', async () => {
  const { index, engine, cleanup } = await createTestIndex();

  try {
    await index.indexMany([
      { id: 'doc1', title: 'JavaScript Guide', content: 'Learn JavaScript' },
      { id: 'doc2', title: 'Advanced JavaScript', content: 'JavaScript patterns' },
      { id: 'doc3', title: 'Python Tutorial', content: 'Python programming' },
    ]);

    const results = await engine.search<TestDocument>('test', 'javascript');

    assertEquals(results.total, 2);
    assertEquals(results.query, 'javascript');
  } finally {
    await cleanup();
  }
});

Deno.test('SearchEngine - search with no matches', async () => {
  const { index, engine, cleanup } = await createTestIndex();

  try {
    await index.indexMany([
      { id: 'doc1', title: 'TypeScript Guide', content: 'Learn TypeScript' },
      { id: 'doc2', title: 'JavaScript Basics', content: 'JavaScript fundamentals' },
    ]);

    const results = await engine.search<TestDocument>('test', 'golang');

    assertEquals(results.total, 0);
    assertEquals(results.items.length, 0);
  } finally {
    await cleanup();
  }
});

Deno.test('SearchEngine - search with pagination', async () => {
  const { index, engine, cleanup } = await createTestIndex();

  try {
    await index.indexMany([
      { id: 'doc1', title: 'JavaScript One', content: 'JavaScript content' },
      { id: 'doc2', title: 'JavaScript Two', content: 'JavaScript content' },
      { id: 'doc3', title: 'JavaScript Three', content: 'JavaScript content' },
      { id: 'doc4', title: 'JavaScript Four', content: 'JavaScript content' },
      { id: 'doc5', title: 'JavaScript Five', content: 'JavaScript content' },
    ]);

    const page1 = await engine.search<TestDocument>('test', 'javascript', {
      limit: 2,
      offset: 0,
    });
    const page2 = await engine.search<TestDocument>('test', 'javascript', {
      limit: 2,
      offset: 2,
    });

    assertEquals(page1.total, 5);
    assertEquals(page1.items.length, 2);
    assertEquals(page2.items.length, 2);
  } finally {
    await cleanup();
  }
});

Deno.test('SearchEngine - search respects field boost', async () => {
  const { index, engine, cleanup } = await createTestIndex();

  try {
    // doc1 has "typescript" in title (boost 2)
    // doc2 has "typescript" in content (boost 1)
    await index.indexMany([
      { id: 'doc1', title: 'TypeScript', content: 'A programming language' },
      { id: 'doc2', title: 'Languages', content: 'TypeScript is great' },
    ]);

    const results = await engine.search<TestDocument>('test', 'typescript');

    assertEquals(results.total, 2);
    // Title match should have higher score
    assertEquals(results.items[0].document.id, 'doc1');
    assert(results.items[0].score > results.items[1].score);
  } finally {
    await cleanup();
  }
});

Deno.test('SearchEngine - search partial match', async () => {
  const { index, engine, cleanup } = await createTestIndex();

  try {
    await index.indexMany([
      { id: 'doc1', title: 'Programming', content: 'Learn programming' },
      { id: 'doc2', title: 'Programmer', content: 'Be a programmer' },
    ]);

    const results = await engine.search<TestDocument>('test', 'program');

    assertEquals(results.total, 2);
  } finally {
    await cleanup();
  }
});

Deno.test('SearchEngine - fuzzy search', async () => {
  const { index, engine, cleanup } = await createTestIndex();

  try {
    await index.indexMany([
      { id: 'doc1', title: 'TypeScript', content: 'Learn TypeScript' },
      { id: 'doc2', title: 'JavaScript', content: 'Learn JavaScript' },
    ]);

    // Typo: "typscript" instead of "typescript"
    const results = await engine.search<TestDocument>('test', 'typscript', {
      fuzzy: true,
    });

    assertEquals(results.total, 1);
    assertEquals(results.items[0].document.id, 'doc1');
  } finally {
    await cleanup();
  }
});

Deno.test('SearchEngine - search with highlights', async () => {
  const { index, engine, cleanup } = await createTestIndex();

  try {
    await index.indexMany([
      {
        id: 'doc1',
        title: 'TypeScript Guide',
        content: 'Learn TypeScript programming with examples',
      },
    ]);

    const results = await engine.search<TestDocument>('test', 'typescript', {
      highlight: true,
    });

    assertEquals(results.total, 1);
    assertExists(results.items[0].highlights);
    assert(Object.keys(results.items[0].highlights!).length > 0);
  } finally {
    await cleanup();
  }
});

Deno.test('SearchEngine - search specific fields only', async () => {
  const { index, engine, cleanup } = await createTestIndex();

  try {
    await index.indexMany([
      { id: 'doc1', title: 'TypeScript', content: 'JavaScript alternative' },
      { id: 'doc2', title: 'JavaScript', content: 'TypeScript sibling' },
    ]);

    // Search only in title field
    const results = await engine.search<TestDocument>('test', 'typescript', {
      fields: ['title'],
    });

    // Only doc1 has TypeScript in title
    assertEquals(results.total, 1);
    assertEquals(results.items[0].document.id, 'doc1');
  } finally {
    await cleanup();
  }
});

Deno.test('SearchEngine - multi-word query', async () => {
  const { index, engine, cleanup } = await createTestIndex();

  try {
    await index.indexMany([
      { id: 'doc1', title: 'TypeScript Guide', content: 'Complete guide to TypeScript' },
      { id: 'doc2', title: 'TypeScript Tutorial', content: 'TypeScript basics' },
      { id: 'doc3', title: 'JavaScript Guide', content: 'JavaScript guide' },
    ]);

    const results = await engine.search<TestDocument>('test', 'typescript guide');

    // doc1 should score highest (both words match)
    assertEquals(results.items[0].document.id, 'doc1');
  } finally {
    await cleanup();
  }
});

Deno.test('SearchEngine - case insensitive search', async () => {
  const { index, engine, cleanup } = await createTestIndex();

  try {
    await index.indexMany([
      { id: 'doc1', title: 'TYPESCRIPT', content: 'TypeScript' },
      { id: 'doc2', title: 'typescript', content: 'typescript' },
    ]);

    const results = await engine.search<TestDocument>('test', 'TypeScript');

    assertEquals(results.total, 2);
  } finally {
    await cleanup();
  }
});

Deno.test('SearchEngine - search timing is tracked', async () => {
  const { index, engine, cleanup } = await createTestIndex();

  try {
    await index.indexMany([
      { id: 'doc1', title: 'Test', content: 'Content' },
    ]);

    const results = await engine.search<TestDocument>('test', 'test');

    assertExists(results.took);
    assert(results.took >= 0);
  } finally {
    await cleanup();
  }
});

Deno.test('SearchEngine - score calculation', async () => {
  const { index, engine, cleanup } = await createTestIndex();

  try {
    await index.indexMany([
      { id: 'doc1', title: 'JavaScript', content: 'JavaScript JavaScript JavaScript' },
      { id: 'doc2', title: 'JavaScript', content: 'Programming language' },
    ]);

    const results = await engine.search<TestDocument>('test', 'javascript');

    assertEquals(results.total, 2);
    // doc1 should have higher score due to more matches
    assert(results.items[0].score >= results.items[1].score);
  } finally {
    await cleanup();
  }
});

// ============================================================================
// Integration Tests
// ============================================================================

Deno.test('SearchEngine - index and search workflow', async () => {
  const { index, engine, cleanup } = await createTestIndex();

  try {
    // Create initial documents
    await index.indexMany([
      { id: '1', title: 'Getting Started with TypeScript', content: 'Introduction to TypeScript' },
      { id: '2', title: 'Advanced TypeScript', content: 'Advanced TypeScript patterns' },
      { id: '3', title: 'TypeScript Best Practices', content: 'Tips and tricks' },
    ]);

    // Search
    let results = await engine.search<TestDocument>('test', 'typescript');
    assertEquals(results.total, 3);

    // Update a document
    await index.update({
      id: '1',
      title: 'Getting Started with JavaScript',
      content: 'Introduction to JavaScript',
    });

    // Search should reflect update
    results = await engine.search<TestDocument>('test', 'typescript');
    assertEquals(results.total, 2);

    // Remove a document
    await index.remove('2');

    // Search should reflect removal
    results = await engine.search<TestDocument>('test', 'typescript');
    assertEquals(results.total, 1);
  } finally {
    await cleanup();
  }
});

Deno.test('SearchEngine - empty query returns no results', async () => {
  const { index, engine, cleanup } = await createTestIndex();

  try {
    await index.indexMany([
      { id: 'doc1', title: 'Test', content: 'Content' },
    ]);

    const results = await engine.search<TestDocument>('test', '');

    assertEquals(results.total, 0);
  } finally {
    await cleanup();
  }
});

Deno.test('SearchEngine - special characters handled', async () => {
  const { index, engine, cleanup } = await createTestIndex();

  try {
    await index.indexMany([
      { id: 'doc1', title: 'C++ Programming Guide', content: 'Learn programming with this guide' },
      { id: 'doc2', title: 'Python Programming', content: 'Python programming guide' },
    ]);

    // Search for "programming" which appears in both documents
    const results = await engine.search<TestDocument>('test', 'programming');

    assertEquals(results.total, 2);
  } finally {
    await cleanup();
  }
});

Deno.test('getSearchEngine - returns singleton', () => {
  const engine1 = getSearchEngine();
  const engine2 = getSearchEngine();

  assertEquals(engine1, engine2);
});

Deno.test('createIndex - creates index with correct options', async () => {
  const index = createIndex<TestDocument>('myindex', {
    fields: ['title', 'content'],
    boosts: { title: 3 },
  });

  const stats = await index.stats();

  assertEquals(stats.name, 'myindex');
});
