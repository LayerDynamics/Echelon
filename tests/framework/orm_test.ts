/**
 * ORM Tests
 *
 * Tests for field validators.
 */

import { assertEquals } from 'jsr:@std/assert';
import { validators } from '../../framework/orm/validators.ts';

// minLength tests

Deno.test('validators.minLength - passes for string meeting minimum', () => {
  const validator = validators.minLength(3);
  const result = validator('hello', 'name');
  assertEquals(result, null);
});

Deno.test('validators.minLength - fails for string below minimum', () => {
  const validator = validators.minLength(5);
  const result = validator('hi', 'name');
  assertEquals(result, 'name must be at least 5 characters');
});

Deno.test('validators.minLength - passes for array meeting minimum', () => {
  const validator = validators.minLength(2);
  const result = validator([1, 2, 3], 'items');
  assertEquals(result, null);
});

Deno.test('validators.minLength - fails for array below minimum', () => {
  const validator = validators.minLength(3);
  const result = validator([1], 'items');
  assertEquals(result, 'items must have at least 3 items');
});

Deno.test('validators.minLength - passes for non-string/array values', () => {
  const validator = validators.minLength(5);
  const result = validator(123, 'value');
  assertEquals(result, null);
});

// maxLength tests

Deno.test('validators.maxLength - passes for string within maximum', () => {
  const validator = validators.maxLength(10);
  const result = validator('hello', 'name');
  assertEquals(result, null);
});

Deno.test('validators.maxLength - fails for string exceeding maximum', () => {
  const validator = validators.maxLength(3);
  const result = validator('hello', 'name');
  assertEquals(result, 'name must be at most 3 characters');
});

Deno.test('validators.maxLength - passes for array within maximum', () => {
  const validator = validators.maxLength(5);
  const result = validator([1, 2], 'items');
  assertEquals(result, null);
});

Deno.test('validators.maxLength - fails for array exceeding maximum', () => {
  const validator = validators.maxLength(2);
  const result = validator([1, 2, 3, 4], 'items');
  assertEquals(result, 'items must have at most 2 items');
});

// min tests

Deno.test('validators.min - passes for number above minimum', () => {
  const validator = validators.min(10);
  const result = validator(15, 'age');
  assertEquals(result, null);
});

Deno.test('validators.min - passes for number equal to minimum', () => {
  const validator = validators.min(10);
  const result = validator(10, 'age');
  assertEquals(result, null);
});

Deno.test('validators.min - fails for number below minimum', () => {
  const validator = validators.min(18);
  const result = validator(16, 'age');
  assertEquals(result, 'age must be at least 18');
});

Deno.test('validators.min - passes for non-number values', () => {
  const validator = validators.min(10);
  const result = validator('hello', 'value');
  assertEquals(result, null);
});

// max tests

Deno.test('validators.max - passes for number below maximum', () => {
  const validator = validators.max(100);
  const result = validator(50, 'score');
  assertEquals(result, null);
});

Deno.test('validators.max - passes for number equal to maximum', () => {
  const validator = validators.max(100);
  const result = validator(100, 'score');
  assertEquals(result, null);
});

Deno.test('validators.max - fails for number above maximum', () => {
  const validator = validators.max(100);
  const result = validator(150, 'score');
  assertEquals(result, 'score must be at most 100');
});

// email tests

Deno.test('validators.email - passes for valid email', () => {
  const validator = validators.email();
  const result = validator('test@example.com', 'email');
  assertEquals(result, null);
});

Deno.test('validators.email - fails for invalid email without @', () => {
  const validator = validators.email();
  const result = validator('invalid-email', 'email');
  assertEquals(result, 'email must be a valid email address');
});

Deno.test('validators.email - fails for invalid email without domain', () => {
  const validator = validators.email();
  const result = validator('test@', 'email');
  assertEquals(result, 'email must be a valid email address');
});

Deno.test('validators.email - fails for invalid email with spaces', () => {
  const validator = validators.email();
  const result = validator('test @example.com', 'email');
  assertEquals(result, 'email must be a valid email address');
});

Deno.test('validators.email - passes for non-string values', () => {
  const validator = validators.email();
  const result = validator(123, 'email');
  assertEquals(result, null);
});

// url tests

Deno.test('validators.url - passes for valid http URL', () => {
  const validator = validators.url();
  const result = validator('http://example.com', 'website');
  assertEquals(result, null);
});

Deno.test('validators.url - passes for valid https URL', () => {
  const validator = validators.url();
  const result = validator('https://example.com/path', 'website');
  assertEquals(result, null);
});

Deno.test('validators.url - fails for invalid URL', () => {
  const validator = validators.url();
  const result = validator('not-a-url', 'website');
  assertEquals(result, 'website must be a valid URL');
});

Deno.test('validators.url - passes for non-string values', () => {
  const validator = validators.url();
  const result = validator(123, 'website');
  assertEquals(result, null);
});

// uuid tests

Deno.test('validators.uuid - passes for valid UUID v4', () => {
  const validator = validators.uuid();
  const result = validator('550e8400-e29b-41d4-a716-446655440000', 'id');
  assertEquals(result, null);
});

Deno.test('validators.uuid - fails for invalid UUID format', () => {
  const validator = validators.uuid();
  const result = validator('not-a-uuid', 'id');
  assertEquals(result, 'id must be a valid UUID');
});

Deno.test('validators.uuid - fails for partial UUID', () => {
  const validator = validators.uuid();
  const result = validator('550e8400-e29b-41d4', 'id');
  assertEquals(result, 'id must be a valid UUID');
});

Deno.test('validators.uuid - case insensitive validation', () => {
  const validator = validators.uuid();
  const result = validator('550E8400-E29B-41D4-A716-446655440000', 'id');
  assertEquals(result, null);
});

// pattern tests

Deno.test('validators.pattern - passes when pattern matches', () => {
  const validator = validators.pattern(/^[A-Z]{3}-\d{3}$/);
  const result = validator('ABC-123', 'code');
  assertEquals(result, null);
});

Deno.test('validators.pattern - fails when pattern does not match', () => {
  const validator = validators.pattern(/^[A-Z]{3}-\d{3}$/);
  const result = validator('abc-123', 'code');
  assertEquals(result, 'code format is invalid');
});

Deno.test('validators.pattern - uses custom message when provided', () => {
  const validator = validators.pattern(/^\d{5}$/, 'Must be a 5-digit ZIP code');
  const result = validator('1234', 'zip');
  assertEquals(result, 'Must be a 5-digit ZIP code');
});

// oneOf tests

Deno.test('validators.oneOf - passes for allowed value', () => {
  const validator = validators.oneOf(['admin', 'user', 'guest']);
  const result = validator('admin', 'role');
  assertEquals(result, null);
});

Deno.test('validators.oneOf - fails for disallowed value', () => {
  const validator = validators.oneOf(['admin', 'user', 'guest']);
  const result = validator('superuser', 'role');
  assertEquals(result, 'role must be one of: admin, user, guest');
});

Deno.test('validators.oneOf - works with numbers', () => {
  const validator = validators.oneOf([1, 2, 3]);
  const result = validator(2, 'level');
  assertEquals(result, null);
});

Deno.test('validators.oneOf - fails for number not in list', () => {
  const validator = validators.oneOf([1, 2, 3]);
  const result = validator(5, 'level');
  assertEquals(result, 'level must be one of: 1, 2, 3');
});

// custom tests

Deno.test('validators.custom - passes when function returns true', () => {
  const validator = validators.custom((value) => (value as number) % 2 === 0, '{field} must be even');
  const result = validator(4, 'number');
  assertEquals(result, null);
});

Deno.test('validators.custom - fails when function returns false', () => {
  const validator = validators.custom((value) => (value as number) % 2 === 0, '{field} must be even');
  const result = validator(3, 'number');
  assertEquals(result, 'number must be even');
});

Deno.test('validators.custom - replaces {field} placeholder in message', () => {
  const validator = validators.custom(() => false, '{field} failed validation');
  const result = validator('test', 'username');
  assertEquals(result, 'username failed validation');
});
