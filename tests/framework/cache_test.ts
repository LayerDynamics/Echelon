/**
 * Cache Tests
 */

import { assertEquals, assertExists } from 'jsr:@std/assert';
import { Cache } from '../../framework/cache/cache.ts';

Deno.test('Cache - set and get value', async () => {
  const cache = new Cache({ maxSize: 100 });

  await cache.set('key1', 'value1');
  const value = await cache.get<string>('key1');

  assertEquals(value, 'value1');
});

Deno.test('Cache - get nonexistent key returns undefined', async () => {
  const cache = new Cache({ maxSize: 100 });

  const value = await cache.get<string>('nonexistent');

  assertEquals(value, undefined);
});

Deno.test('Cache - has returns true for existing key', async () => {
  const cache = new Cache({ maxSize: 100 });

  await cache.set('key1', 'value1');
  const exists = await cache.has('key1');

  assertEquals(exists, true);
});

Deno.test('Cache - has returns false for nonexistent key', async () => {
  const cache = new Cache({ maxSize: 100 });

  const exists = await cache.has('nonexistent');

  assertEquals(exists, false);
});

Deno.test('Cache - delete removes value', async () => {
  const cache = new Cache({ maxSize: 100 });

  await cache.set('key1', 'value1');
  await cache.delete('key1');
  const value = await cache.get<string>('key1');

  assertEquals(value, undefined);
});

Deno.test('Cache - clear removes all values', async () => {
  const cache = new Cache({ maxSize: 100 });

  await cache.set('key1', 'value1');
  await cache.set('key2', 'value2');
  await cache.clear();

  assertEquals(await cache.get<string>('key1'), undefined);
  assertEquals(await cache.get<string>('key2'), undefined);
});

Deno.test('Cache - getOrSet returns cached value', async () => {
  const cache = new Cache({ maxSize: 100 });
  let calls = 0;

  const factory = async () => {
    calls++;
    return 'computed';
  };

  const value1 = await cache.getOrSet('key1', factory);
  const value2 = await cache.getOrSet('key1', factory);

  assertEquals(value1, 'computed');
  assertEquals(value2, 'computed');
  assertEquals(calls, 1);
});

Deno.test('Cache - stores complex objects', async () => {
  const cache = new Cache({ maxSize: 100 });

  const obj = { name: 'Test', items: [1, 2, 3], nested: { value: true } };
  await cache.set('obj', obj);
  const retrieved = await cache.get<typeof obj>('obj');

  assertExists(retrieved);
  assertEquals(retrieved.name, 'Test');
  assertEquals(retrieved.items, [1, 2, 3]);
  assertEquals(retrieved.nested.value, true);
});

Deno.test('Cache - size tracks entries', async () => {
  const cache = new Cache({ maxSize: 100 });

  await cache.set('key1', 'value1');
  await cache.set('key2', 'value2');
  await cache.set('key3', 'value3');

  assertEquals(cache.size, 3);

  await cache.delete('key1');

  assertEquals(cache.size, 2);
});

Deno.test('Cache - TTL expiration', async () => {
  const cache = new Cache({ maxSize: 100, defaultTtl: 50 });

  await cache.set('key1', 'value1');

  // Value should exist immediately
  assertEquals(await cache.get<string>('key1'), 'value1');

  // Wait for TTL to expire
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Value should be expired
  assertEquals(await cache.get<string>('key1'), undefined);
});
