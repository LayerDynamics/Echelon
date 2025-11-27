/**
 * Auth Tests
 *
 * Tests for password hashing, token generation, and related utilities.
 */

import { assertEquals, assertNotEquals, assert } from 'jsr:@std/assert';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  generateRandomString,
} from '../../framework/auth/password.ts';

// Password hashing tests

Deno.test('hashPassword - creates different hash each time', async () => {
  const password = 'mysecretpassword';
  const hash1 = await hashPassword(password);
  const hash2 = await hashPassword(password);

  // Same password should produce different hashes (due to random salt)
  assertNotEquals(hash1, hash2);
});

Deno.test('hashPassword - creates base64 encoded hash', async () => {
  const password = 'testpassword';
  const hash = await hashPassword(password);

  // Should be valid base64
  assert(hash.length > 0);
  assert(!hash.includes(' '));
});

Deno.test('verifyPassword - returns true for correct password', async () => {
  const password = 'correctpassword';
  const hash = await hashPassword(password);

  const result = await verifyPassword(password, hash);
  assertEquals(result, true);
});

Deno.test('verifyPassword - returns false for incorrect password', async () => {
  const password = 'correctpassword';
  const hash = await hashPassword(password);

  const result = await verifyPassword('wrongpassword', hash);
  assertEquals(result, false);
});

Deno.test('verifyPassword - returns false for invalid hash', async () => {
  const result = await verifyPassword('anypassword', 'invalidhash');
  assertEquals(result, false);
});

Deno.test('verifyPassword - returns false for empty hash', async () => {
  const result = await verifyPassword('anypassword', '');
  assertEquals(result, false);
});

Deno.test('verifyPassword - handles special characters in password', async () => {
  const password = 'p@$$w0rd!@#$%^&*()';
  const hash = await hashPassword(password);

  const result = await verifyPassword(password, hash);
  assertEquals(result, true);
});

Deno.test('verifyPassword - handles unicode characters', async () => {
  const password = 'пароль123密码';
  const hash = await hashPassword(password);

  const result = await verifyPassword(password, hash);
  assertEquals(result, true);
});

Deno.test('verifyPassword - handles empty password', async () => {
  const password = '';
  const hash = await hashPassword(password);

  const result = await verifyPassword(password, hash);
  assertEquals(result, true);
});

Deno.test('verifyPassword - handles long password', async () => {
  const password = 'a'.repeat(1000);
  const hash = await hashPassword(password);

  const result = await verifyPassword(password, hash);
  assertEquals(result, true);
});

// Token generation tests

Deno.test('generateToken - creates hex string of correct length', () => {
  const token = generateToken(32);
  assertEquals(token.length, 64); // 32 bytes = 64 hex chars
});

Deno.test('generateToken - creates unique tokens', () => {
  const token1 = generateToken();
  const token2 = generateToken();
  assertNotEquals(token1, token2);
});

Deno.test('generateToken - uses default length of 32 bytes', () => {
  const token = generateToken();
  assertEquals(token.length, 64);
});

Deno.test('generateToken - creates only hex characters', () => {
  const token = generateToken();
  assert(/^[0-9a-f]+$/.test(token));
});

Deno.test('generateToken - respects custom length', () => {
  const token16 = generateToken(16);
  const token64 = generateToken(64);
  assertEquals(token16.length, 32);
  assertEquals(token64.length, 128);
});

// Random string generation tests

Deno.test('generateRandomString - creates string of correct length', () => {
  const str = generateRandomString(20);
  assertEquals(str.length, 20);
});

Deno.test('generateRandomString - uses default length of 32', () => {
  const str = generateRandomString();
  assertEquals(str.length, 32);
});

Deno.test('generateRandomString - creates unique strings', () => {
  const str1 = generateRandomString();
  const str2 = generateRandomString();
  assertNotEquals(str1, str2);
});

Deno.test('generateRandomString - contains only alphanumeric characters', () => {
  const str = generateRandomString(100);
  assert(/^[A-Za-z0-9]+$/.test(str));
});

Deno.test('generateRandomString - respects custom length', () => {
  const str10 = generateRandomString(10);
  const str100 = generateRandomString(100);
  assertEquals(str10.length, 10);
  assertEquals(str100.length, 100);
});
