/**
 * API Tests
 *
 * Tests for API response utilities.
 */

import { assertEquals } from 'jsr:@std/assert';
import {
  apiResponse,
  apiError,
  validationError,
  notFoundError,
  unauthorizedError,
  forbiddenError,
  serverError,
  HttpStatus,
} from '../../framework/api/response.ts';

// apiResponse tests

Deno.test('apiResponse - creates success response with data', () => {
  const response = apiResponse({ id: 1, name: 'Test' });
  assertEquals(response.success, true);
  assertEquals(response.data, { id: 1, name: 'Test' });
  assertEquals(response.error, undefined);
});

Deno.test('apiResponse - includes meta when provided', () => {
  const response = apiResponse([1, 2, 3], { total: 100, page: 1 });
  assertEquals(response.success, true);
  assertEquals(response.data, [1, 2, 3]);
  assertEquals(response.meta, { total: 100, page: 1 });
});

Deno.test('apiResponse - handles null data', () => {
  const response = apiResponse(null);
  assertEquals(response.success, true);
  assertEquals(response.data, null);
});

Deno.test('apiResponse - handles primitive data', () => {
  const stringResponse = apiResponse('hello');
  assertEquals(stringResponse.data, 'hello');

  const numberResponse = apiResponse(42);
  assertEquals(numberResponse.data, 42);

  const boolResponse = apiResponse(true);
  assertEquals(boolResponse.data, true);
});

// apiError tests

Deno.test('apiError - creates error response', () => {
  const response = apiError('ERROR_CODE', 'Something went wrong');
  assertEquals(response.success, false);
  assertEquals(response.error?.code, 'ERROR_CODE');
  assertEquals(response.error?.message, 'Something went wrong');
  assertEquals(response.data, undefined);
});

Deno.test('apiError - includes details when provided', () => {
  const response = apiError('VALIDATION', 'Invalid input', { field: 'email' });
  assertEquals(response.error?.details, { field: 'email' });
});

Deno.test('apiError - handles empty details', () => {
  const response = apiError('ERROR', 'Message');
  assertEquals(response.error?.details, undefined);
});

// validationError tests

Deno.test('validationError - creates validation error response', () => {
  const response = validationError({
    email: ['Email is required', 'Invalid format'],
    name: ['Name is too short'],
  });
  assertEquals(response.success, false);
  assertEquals(response.error?.code, 'VALIDATION_ERROR');
  assertEquals(response.error?.message, 'Validation failed');
  assertEquals(response.error?.details?.fields, {
    email: ['Email is required', 'Invalid format'],
    name: ['Name is too short'],
  });
});

Deno.test('validationError - handles empty errors', () => {
  const response = validationError({});
  assertEquals(response.error?.details?.fields, {});
});

// notFoundError tests

Deno.test('notFoundError - creates not found error response', () => {
  const response = notFoundError('User');
  assertEquals(response.success, false);
  assertEquals(response.error?.code, 'NOT_FOUND');
  assertEquals(response.error?.message, 'User not found');
});

Deno.test('notFoundError - handles different resource names', () => {
  const response = notFoundError('Article');
  assertEquals(response.error?.message, 'Article not found');
});

// unauthorizedError tests

Deno.test('unauthorizedError - creates unauthorized error with default message', () => {
  const response = unauthorizedError();
  assertEquals(response.success, false);
  assertEquals(response.error?.code, 'UNAUTHORIZED');
  assertEquals(response.error?.message, 'Unauthorized');
});

Deno.test('unauthorizedError - uses custom message when provided', () => {
  const response = unauthorizedError('Invalid token');
  assertEquals(response.error?.message, 'Invalid token');
});

// forbiddenError tests

Deno.test('forbiddenError - creates forbidden error with default message', () => {
  const response = forbiddenError();
  assertEquals(response.success, false);
  assertEquals(response.error?.code, 'FORBIDDEN');
  assertEquals(response.error?.message, 'Forbidden');
});

Deno.test('forbiddenError - uses custom message when provided', () => {
  const response = forbiddenError('Admin access required');
  assertEquals(response.error?.message, 'Admin access required');
});

// serverError tests

Deno.test('serverError - creates server error with default message', () => {
  const response = serverError();
  assertEquals(response.success, false);
  assertEquals(response.error?.code, 'SERVER_ERROR');
  assertEquals(response.error?.message, 'Internal server error');
});

Deno.test('serverError - uses custom message when provided', () => {
  const response = serverError('Database connection failed');
  assertEquals(response.error?.message, 'Database connection failed');
});

Deno.test('serverError - includes error details when error provided', () => {
  const error = new Error('Connection timeout');
  error.name = 'TimeoutError';
  const response = serverError('Service unavailable', error);
  assertEquals(response.error?.details?.name, 'TimeoutError');
  assertEquals(response.error?.details?.message, 'Connection timeout');
});

// HttpStatus tests

Deno.test('HttpStatus - contains correct status codes', () => {
  assertEquals(HttpStatus.OK, 200);
  assertEquals(HttpStatus.CREATED, 201);
  assertEquals(HttpStatus.NO_CONTENT, 204);
  assertEquals(HttpStatus.BAD_REQUEST, 400);
  assertEquals(HttpStatus.UNAUTHORIZED, 401);
  assertEquals(HttpStatus.FORBIDDEN, 403);
  assertEquals(HttpStatus.NOT_FOUND, 404);
  assertEquals(HttpStatus.CONFLICT, 409);
  assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, 422);
  assertEquals(HttpStatus.TOO_MANY_REQUESTS, 429);
  assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, 500);
  assertEquals(HttpStatus.SERVICE_UNAVAILABLE, 503);
});
