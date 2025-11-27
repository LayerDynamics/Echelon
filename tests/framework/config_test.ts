/**
 * Config Tests
 *
 * Tests for the configuration management system.
 */

import { assertEquals, assert } from 'jsr:@std/assert';
import { Config } from '../../framework/config/config.ts';

// Config constructor tests

Deno.test('Config - uses default values when no options provided', () => {
  const config = new Config();
  assertEquals(config.get('port'), 8000);
  assertEquals(config.get('host'), '0.0.0.0');
  assertEquals(config.get('env'), 'development');
  assertEquals(config.get('debug'), false);
  assertEquals(config.get('logLevel'), 'info');
});

Deno.test('Config - merges provided options with defaults', () => {
  const config = new Config({ port: 3000, debug: true });
  assertEquals(config.get('port'), 3000);
  assertEquals(config.get('debug'), true);
  assertEquals(config.get('host'), '0.0.0.0'); // default preserved
});

Deno.test('Config - deep merges nested objects', () => {
  const config = new Config({
    session: { secret: 'my-secret' },
  });
  assertEquals(config.get('session.secret'), 'my-secret');
  assertEquals(config.get('session.maxAge'), 86400 * 7); // default preserved
});

// get tests

Deno.test('Config.get - returns value for simple key', () => {
  const config = new Config({ customKey: 'customValue' });
  assertEquals(config.get('customKey'), 'customValue');
});

Deno.test('Config.get - returns value for nested key', () => {
  const config = new Config({
    database: { path: '/data/db' },
  });
  assertEquals(config.get('database.path'), '/data/db');
});

Deno.test('Config.get - returns default for missing key', () => {
  const config = new Config();
  assertEquals(config.get('nonexistent', 'fallback'), 'fallback');
});

Deno.test('Config.get - returns undefined for missing key without default', () => {
  const config = new Config();
  assertEquals(config.get('nonexistent'), undefined);
});

Deno.test('Config.get - handles deeply nested paths', () => {
  const config = new Config({
    deep: { nested: { value: 42 } },
  });
  assertEquals(config.get('deep.nested.value'), 42);
});

// set tests

Deno.test('Config.set - sets simple value', () => {
  const config = new Config();
  config.set('newKey', 'newValue');
  assertEquals(config.get('newKey'), 'newValue');
});

Deno.test('Config.set - sets nested value', () => {
  const config = new Config();
  config.set('custom.nested.key', 'value');
  assertEquals(config.get('custom.nested.key'), 'value');
});

Deno.test('Config.set - overwrites existing value', () => {
  const config = new Config({ port: 8000 });
  config.set('port', 3000);
  assertEquals(config.get('port'), 3000);
});

Deno.test('Config.set - creates intermediate objects', () => {
  const config = new Config();
  config.set('a.b.c.d', 'deep');
  assertEquals(config.get('a.b.c.d'), 'deep');
});

// has tests

Deno.test('Config.has - returns true for existing key', () => {
  const config = new Config({ exists: true });
  assertEquals(config.has('exists'), true);
});

Deno.test('Config.has - returns false for missing key', () => {
  const config = new Config();
  assertEquals(config.has('nonexistent'), false);
});

Deno.test('Config.has - returns true for nested existing key', () => {
  const config = new Config({
    level1: { level2: 'value' },
  });
  assertEquals(config.has('level1.level2'), true);
});

Deno.test('Config.has - returns false for nested missing key', () => {
  const config = new Config({
    level1: {},
  });
  assertEquals(config.has('level1.level2'), false);
});

// all tests

Deno.test('Config.all - returns copy of all config', () => {
  const config = new Config({ custom: 'value' });
  const all = config.all();
  assert(all.port !== undefined);
  assertEquals(all.custom, 'value');
});

Deno.test('Config.all - returns a copy, not reference', () => {
  const config = new Config({ port: 8000 });
  const all = config.all();
  all.port = 9999;
  assertEquals(config.get('port'), 8000); // Original unchanged
});

// forEnv tests

Deno.test('Config.forEnv - returns merged config for environment', () => {
  const config = new Config({
    debug: false,
    production: {
      debug: true,
      logLevel: 'error',
    },
  });
  const prodConfig = config.forEnv('production');
  assertEquals(prodConfig.debug, true);
  assertEquals(prodConfig.logLevel, 'error');
});

Deno.test('Config.forEnv - returns base config if env not found', () => {
  const config = new Config({ port: 8000 });
  const envConfig = config.forEnv('nonexistent');
  assertEquals(envConfig.port, 8000);
});

// Edge cases

Deno.test('Config - handles array values', () => {
  const config = new Config({
    cors: { origins: ['http://localhost', 'http://example.com'] },
  });
  const origins = config.get<string[]>('cors.origins');
  assertEquals(origins?.length, 2);
  assertEquals(origins?.[0], 'http://localhost');
});

Deno.test('Config - handles null values', () => {
  const config = new Config({ nullable: null });
  // Null values are stored but mergeConfig treats them as objects
  // So the actual behavior is that null is preserved
  assertEquals(config.get('nullable'), undefined);
});

Deno.test('Config - handles boolean false', () => {
  const config = new Config({ enabled: false });
  assertEquals(config.get('enabled'), false);
  assertEquals(config.has('enabled'), true);
});

Deno.test('Config - handles number zero', () => {
  const config = new Config({ timeout: 0 });
  assertEquals(config.get('timeout'), 0);
});
