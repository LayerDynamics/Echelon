/**
 * Controller Tests
 *
 * Tests for the base controller class and validation.
 */

import { assertEquals, assertThrows, assert } from 'jsr:@std/assert';
import { Controller, action } from '../../framework/controller/base.ts';
import { EchelonRequest } from '../../framework/http/request.ts';
import { EchelonResponse } from '../../framework/http/response.ts';

// Test controller implementation
class TestController extends Controller {
  index(): Response {
    return this.json_response({ message: 'index' });
  }

  show(): Response {
    const id = this.requireParam('id');
    return this.json_response({ id });
  }

  create(): Response {
    return this.json_response({ created: true }, 201);
  }

  htmlPage(): Response {
    return this.html('<h1>Hello</h1>');
  }

  textResponse(): Response {
    return this.text('Plain text');
  }

  redirectAction(): Response {
    return this.redirect('/new-location');
  }

  notFoundAction(): Response {
    return this.notFound('Resource not found');
  }

  badRequestAction(): Response {
    return this.badRequest('Invalid data');
  }

  unauthorizedAction(): Response {
    return this.unauthorized('Please login');
  }

  forbiddenAction(): Response {
    return this.forbidden('Access denied');
  }

  serverErrorAction(): Response {
    return this.serverError('Something went wrong');
  }

  getQueryParam(): Response {
    const page = this.queryParam('page', '1');
    return this.json_response({ page });
  }
}

// Helper to create test request/response
function createTestContext(url = 'http://localhost/test', params: Record<string, string> = {}) {
  const req = new EchelonRequest(new Request(url), { params });
  const res = new EchelonResponse();
  return { req, res };
}

// Controller.setContext tests

Deno.test('Controller.setContext - sets request and response', () => {
  const { req, res } = createTestContext();
  const controller = new TestController();
  controller.setContext(req, res);
  assertEquals(controller.context.request, req);
  assertEquals(controller.context.response, res);
});

Deno.test('Controller.setContext - returns this for chaining', () => {
  const { req, res } = createTestContext();
  const controller = new TestController();
  const result = controller.setContext(req, res);
  assertEquals(result, controller);
});

// Controller.context tests

Deno.test('Controller.context - provides request', () => {
  const { req, res } = createTestContext();
  const controller = new TestController();
  controller.setContext(req, res);
  assertEquals(controller.context.request, req);
});

Deno.test('Controller.context - provides response', () => {
  const { req, res } = createTestContext();
  const controller = new TestController();
  controller.setContext(req, res);
  assertEquals(controller.context.response, res);
});

Deno.test('Controller.context - provides params', () => {
  const { req, res } = createTestContext('http://localhost/test', { id: '123' });
  const controller = new TestController();
  controller.setContext(req, res);
  assertEquals(controller.context.params, { id: '123' });
});

Deno.test('Controller.context - provides query', () => {
  const { req, res } = createTestContext('http://localhost/test?foo=bar');
  const controller = new TestController();
  controller.setContext(req, res);
  assertEquals(controller.context.query.get('foo'), 'bar');
});

// Controller.params tests

Deno.test('Controller.params - returns route parameters', () => {
  const { req, res } = createTestContext('http://localhost/test', { userId: '456' });
  const controller = new TestController();
  controller.setContext(req, res);
  assertEquals(controller.params.userId, '456');
});

// Controller.query tests

Deno.test('Controller.query - returns query parameters', () => {
  const { req, res } = createTestContext('http://localhost/test?page=2&limit=10');
  const controller = new TestController();
  controller.setContext(req, res);
  assertEquals(controller.query.get('page'), '2');
  assertEquals(controller.query.get('limit'), '10');
});

// Controller.queryParam tests

Deno.test('Controller.queryParam - returns query parameter value', () => {
  const { req, res } = createTestContext('http://localhost/test?name=test');
  const controller = new TestController();
  controller.setContext(req, res);
  assertEquals(controller.queryParam('name'), 'test');
});

Deno.test('Controller.queryParam - returns default for missing parameter', () => {
  const { req, res } = createTestContext('http://localhost/test');
  const controller = new TestController();
  controller.setContext(req, res);
  assertEquals(controller.queryParam('missing', 'default'), 'default');
});

Deno.test('Controller.queryParam - returns undefined when no default', () => {
  const { req, res } = createTestContext('http://localhost/test');
  const controller = new TestController();
  controller.setContext(req, res);
  assertEquals(controller.queryParam('missing'), undefined);
});

// Controller.requireParam tests

Deno.test('Controller.requireParam - returns existing parameter', () => {
  const { req, res } = createTestContext('http://localhost/test', { id: '789' });
  const controller = new TestController();
  controller.setContext(req, res);
  assertEquals(controller.requireParam('id'), '789');
});

Deno.test('Controller.requireParam - throws for missing parameter', () => {
  const { req, res } = createTestContext('http://localhost/test');
  const controller = new TestController();
  controller.setContext(req, res);
  assertThrows(
    () => controller.requireParam('missing'),
    Error,
    "Required parameter 'missing' is missing"
  );
});

// Controller.json_response tests

Deno.test('Controller.json_response - returns JSON response', async () => {
  const { req, res } = createTestContext();
  const controller = new TestController();
  controller.setContext(req, res);
  const response = controller.json_response({ data: 'test' });
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.data, 'test');
});

Deno.test('Controller.json_response - uses custom status code', async () => {
  const { req, res } = createTestContext();
  const controller = new TestController();
  controller.setContext(req, res);
  const response = controller.json_response({ created: true }, 201);
  assertEquals(response.status, 201);
});

// Controller.html tests

Deno.test('Controller.html - returns HTML response', async () => {
  const { req, res } = createTestContext();
  const controller = new TestController();
  controller.setContext(req, res);
  const response = controller.html('<div>Test</div>');
  assertEquals(response.status, 200);
  assertEquals(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
  const body = await response.text();
  assertEquals(body, '<div>Test</div>');
});

// Controller.text tests

Deno.test('Controller.text - returns text response', async () => {
  const { req, res } = createTestContext();
  const controller = new TestController();
  controller.setContext(req, res);
  const response = controller.text('Hello World');
  assertEquals(response.status, 200);
  assertEquals(response.headers.get('Content-Type'), 'text/plain; charset=utf-8');
  const body = await response.text();
  assertEquals(body, 'Hello World');
});

// Controller.redirect tests

Deno.test('Controller.redirect - returns 302 redirect by default', () => {
  const { req, res } = createTestContext();
  const controller = new TestController();
  controller.setContext(req, res);
  const response = controller.redirect('/target');
  assertEquals(response.status, 302);
  assertEquals(response.headers.get('Location'), '/target');
});

Deno.test('Controller.redirect - supports custom status codes', () => {
  const { req, res } = createTestContext();
  const controller = new TestController();
  controller.setContext(req, res);
  const response = controller.redirect('/target', 301);
  assertEquals(response.status, 301);
});

// Error response tests

Deno.test('Controller.notFound - returns 404 response', async () => {
  const { req, res } = createTestContext();
  const controller = new TestController();
  controller.setContext(req, res);
  const response = controller.notFound('Item not found');
  assertEquals(response.status, 404);
  const body = await response.json();
  assertEquals(body.error, 'Item not found');
});

Deno.test('Controller.badRequest - returns 400 response', async () => {
  const { req, res } = createTestContext();
  const controller = new TestController();
  controller.setContext(req, res);
  const response = controller.badRequest('Invalid input');
  assertEquals(response.status, 400);
  const body = await response.json();
  assertEquals(body.error, 'Invalid input');
});

Deno.test('Controller.unauthorized - returns 401 response', async () => {
  const { req, res } = createTestContext();
  const controller = new TestController();
  controller.setContext(req, res);
  const response = controller.unauthorized('Auth required');
  assertEquals(response.status, 401);
  const body = await response.json();
  assertEquals(body.error, 'Auth required');
});

Deno.test('Controller.forbidden - returns 403 response', async () => {
  const { req, res } = createTestContext();
  const controller = new TestController();
  controller.setContext(req, res);
  const response = controller.forbidden('No access');
  assertEquals(response.status, 403);
  const body = await response.json();
  assertEquals(body.error, 'No access');
});

Deno.test('Controller.serverError - returns 500 response', async () => {
  const { req, res } = createTestContext();
  const controller = new TestController();
  controller.setContext(req, res);
  const response = controller.serverError('Oops');
  assertEquals(response.status, 500);
  const body = await response.json();
  assertEquals(body.error, 'Oops');
});

// Controller.validate tests

Deno.test('Controller.validate - returns data when valid', () => {
  const { req, res } = createTestContext();
  const controller = new TestController();
  controller.setContext(req, res);
  const data = { name: 'test', age: 25 };
  const result = controller.validate<typeof data>(data, {
    name: { type: 'string', required: true },
    age: { type: 'number', min: 0 },
  });
  assertEquals(result, data);
});

Deno.test('Controller.validate - throws for missing required field', () => {
  const { req, res } = createTestContext();
  const controller = new TestController();
  controller.setContext(req, res);
  assertThrows(
    () => controller.validate({}, { name: { required: true } }),
    Error,
    'Validation failed'
  );
});

Deno.test('Controller.validate - throws for wrong type', () => {
  const { req, res } = createTestContext();
  const controller = new TestController();
  controller.setContext(req, res);
  assertThrows(
    () => controller.validate({ age: 'not a number' }, { age: { type: 'number' } }),
    Error,
    'Validation failed'
  );
});

Deno.test('Controller.validate - throws for value below min', () => {
  const { req, res } = createTestContext();
  const controller = new TestController();
  controller.setContext(req, res);
  assertThrows(
    () => controller.validate({ score: -5 }, { score: { type: 'number', min: 0 } }),
    Error,
    'Validation failed'
  );
});

Deno.test('Controller.validate - throws for value above max', () => {
  const { req, res } = createTestContext();
  const controller = new TestController();
  controller.setContext(req, res);
  assertThrows(
    () => controller.validate({ score: 150 }, { score: { type: 'number', max: 100 } }),
    Error,
    'Validation failed'
  );
});

Deno.test('Controller.validate - throws for invalid pattern', () => {
  const { req, res } = createTestContext();
  const controller = new TestController();
  controller.setContext(req, res);
  assertThrows(
    () => controller.validate({ code: 'abc' }, { code: { pattern: /^\d+$/ } }),
    Error,
    'Validation failed'
  );
});

// action helper tests

Deno.test('action - creates handler from controller method', async () => {
  const handler = action(TestController, 'index');
  const { req, res } = createTestContext();
  const response = await handler(req, res);
  assert(response instanceof Response);
  const body = await response.json();
  assertEquals(body.message, 'index');
});

Deno.test('action - passes params to controller', async () => {
  const handler = action(TestController, 'show');
  const { req, res } = createTestContext('http://localhost/test', { id: '42' });
  const response = await handler(req, res);
  assert(response instanceof Response);
  const body = await response.json();
  assertEquals(body.id, '42');
});
