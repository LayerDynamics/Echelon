/**
 * HTTP Tests
 *
 * Tests for EchelonRequest and EchelonResponse classes.
 */

import { assertEquals, assertExists } from 'jsr:@std/assert';
import { EchelonRequest } from '../../framework/http/request.ts';
import { EchelonResponse } from '../../framework/http/response.ts';

// EchelonRequest tests

Deno.test('EchelonRequest - parses method correctly', () => {
  const req = new EchelonRequest(new Request('http://localhost/test', { method: 'POST' }));
  assertEquals(req.method, 'POST');
});

Deno.test('EchelonRequest - parses URL and path', () => {
  const req = new EchelonRequest(new Request('http://localhost/api/users?page=1'));
  assertEquals(req.path, '/api/users');
  assertEquals(req.url, 'http://localhost/api/users?page=1');
});

Deno.test('EchelonRequest - parses query parameters', () => {
  const req = new EchelonRequest(new Request('http://localhost/test?foo=bar&baz=qux'));
  assertEquals(req.query.get('foo'), 'bar');
  assertEquals(req.query.get('baz'), 'qux');
});

Deno.test('EchelonRequest - provides route params', () => {
  const req = new EchelonRequest(new Request('http://localhost/test'), {
    params: { id: '123', name: 'test' },
  });
  assertEquals(req.params.id, '123');
  assertEquals(req.params.name, 'test');
});

Deno.test('EchelonRequest - setParams updates params', () => {
  const req = new EchelonRequest(new Request('http://localhost/test'));
  req.setParams({ userId: '456' });
  assertEquals(req.params.userId, '456');
});

Deno.test('EchelonRequest - gets headers', () => {
  const req = new EchelonRequest(
    new Request('http://localhost/test', {
      headers: { 'Content-Type': 'application/json', 'X-Custom': 'value' },
    })
  );
  assertEquals(req.header('Content-Type'), 'application/json');
  assertEquals(req.header('X-Custom'), 'value');
  assertEquals(req.contentType, 'application/json');
});

Deno.test('EchelonRequest - parses cookies', () => {
  const req = new EchelonRequest(
    new Request('http://localhost/test', {
      headers: { Cookie: 'session=abc123; user=john' },
    })
  );
  assertEquals(req.cookie('session'), 'abc123');
  assertEquals(req.cookie('user'), 'john');
});

Deno.test('EchelonRequest - detects secure connection', () => {
  const httpReq = new EchelonRequest(new Request('http://localhost/test'));
  const httpsReq = new EchelonRequest(new Request('https://localhost/test'));
  assertEquals(httpReq.isSecure, false);
  assertEquals(httpsReq.isSecure, true);
});

Deno.test('EchelonRequest - detects JSON acceptance', () => {
  const jsonReq = new EchelonRequest(
    new Request('http://localhost/test', {
      headers: { Accept: 'application/json' },
    })
  );
  const htmlReq = new EchelonRequest(
    new Request('http://localhost/test', {
      headers: { Accept: 'text/html' },
    })
  );
  assertEquals(jsonReq.acceptsJson, true);
  assertEquals(htmlReq.acceptsJson, false);
});

Deno.test('EchelonRequest - detects AJAX requests', () => {
  const ajaxReq = new EchelonRequest(
    new Request('http://localhost/test', {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    })
  );
  const normalReq = new EchelonRequest(new Request('http://localhost/test'));
  assertEquals(ajaxReq.isAjax, true);
  assertEquals(normalReq.isAjax, false);
});

Deno.test('EchelonRequest - gets IP from X-Forwarded-For', () => {
  const req = new EchelonRequest(
    new Request('http://localhost/test', {
      headers: { 'X-Forwarded-For': '192.168.1.1, 10.0.0.1' },
    })
  );
  assertEquals(req.ip, '192.168.1.1');
});

Deno.test('EchelonRequest - parses JSON body', async () => {
  const req = new EchelonRequest(
    new Request('http://localhost/test', {
      method: 'POST',
      body: JSON.stringify({ name: 'test', value: 42 }),
      headers: { 'Content-Type': 'application/json' },
    })
  );
  const body = await req.json<{ name: string; value: number }>();
  assertEquals(body.name, 'test');
  assertEquals(body.value, 42);
});

Deno.test('EchelonRequest - provides state map', () => {
  const req = new EchelonRequest(new Request('http://localhost/test'));
  req.state.set('user', { id: 1 });
  assertEquals(req.state.get('user'), { id: 1 });
});

Deno.test('EchelonRequest - clones request', () => {
  const req = new EchelonRequest(new Request('http://localhost/test'), {
    params: { id: '1' },
  });
  req.state.set('key', 'value');
  const clone = req.clone({ params: { id: '2' } });
  assertEquals(clone.params.id, '2');
  assertExists(clone.state);
});

// EchelonResponse tests

Deno.test('EchelonResponse - builds with default status', () => {
  const res = new EchelonResponse();
  const response = res.build();
  assertEquals(response.status, 200);
});

Deno.test('EchelonResponse - sets status code', () => {
  const res = new EchelonResponse();
  const response = res.status(201).build();
  assertEquals(response.status, 201);
});

Deno.test('EchelonResponse - sets headers', () => {
  const res = new EchelonResponse();
  const response = res.header('X-Custom', 'value').build();
  assertEquals(response.headers.get('X-Custom'), 'value');
});

Deno.test('EchelonResponse - sets multiple headers', () => {
  const res = new EchelonResponse();
  const response = res.headers({ 'X-One': '1', 'X-Two': '2' }).build();
  assertEquals(response.headers.get('X-One'), '1');
  assertEquals(response.headers.get('X-Two'), '2');
});

Deno.test('EchelonResponse - sends JSON response', async () => {
  const res = new EchelonResponse();
  const response = res.json({ message: 'hello' });
  assertEquals(response.headers.get('Content-Type'), 'application/json; charset=utf-8');
  const body = await response.json();
  assertEquals(body.message, 'hello');
});

Deno.test('EchelonResponse - sends HTML response', async () => {
  const res = new EchelonResponse();
  const response = res.html('<h1>Hello</h1>');
  assertEquals(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
  const body = await response.text();
  assertEquals(body, '<h1>Hello</h1>');
});

Deno.test('EchelonResponse - sends text response', async () => {
  const res = new EchelonResponse();
  const response = res.text('Plain text');
  assertEquals(response.headers.get('Content-Type'), 'text/plain; charset=utf-8');
  const body = await response.text();
  assertEquals(body, 'Plain text');
});

Deno.test('EchelonResponse - sends redirect', () => {
  const res = new EchelonResponse();
  const response = res.redirect('/new-location');
  assertEquals(response.status, 302);
  assertEquals(response.headers.get('Location'), '/new-location');
});

Deno.test('EchelonResponse - sends permanent redirect', () => {
  const res = new EchelonResponse();
  const response = res.redirect('/new-location', 301);
  assertEquals(response.status, 301);
});

Deno.test('EchelonResponse - sends no content', () => {
  const res = new EchelonResponse();
  const response = res.noContent();
  assertEquals(response.status, 204);
});

Deno.test('EchelonResponse - sends not found', async () => {
  const res = new EchelonResponse();
  const response = res.notFound('Resource not found');
  assertEquals(response.status, 404);
  const body = await response.json();
  assertEquals(body.error, 'Resource not found');
});

Deno.test('EchelonResponse - sends bad request', async () => {
  const res = new EchelonResponse();
  const response = res.badRequest('Invalid input');
  assertEquals(response.status, 400);
  const body = await response.json();
  assertEquals(body.error, 'Invalid input');
});

Deno.test('EchelonResponse - sends unauthorized', async () => {
  const res = new EchelonResponse();
  const response = res.unauthorized();
  assertEquals(response.status, 401);
  const body = await response.json();
  assertEquals(body.error, 'Unauthorized');
});

Deno.test('EchelonResponse - sends forbidden', async () => {
  const res = new EchelonResponse();
  const response = res.forbidden();
  assertEquals(response.status, 403);
  const body = await response.json();
  assertEquals(body.error, 'Forbidden');
});

Deno.test('EchelonResponse - sends server error', async () => {
  const res = new EchelonResponse();
  const response = res.serverError('Something went wrong');
  assertEquals(response.status, 500);
  const body = await response.json();
  assertEquals(body.error, 'Something went wrong');
});

Deno.test('EchelonResponse - sets cookie', () => {
  const res = new EchelonResponse();
  const response = res.cookie('session', 'abc123', { httpOnly: true, secure: true }).build();
  const setCookie = response.headers.get('Set-Cookie');
  assertExists(setCookie);
  assertEquals(setCookie.includes('session=abc123'), true);
  assertEquals(setCookie.includes('HttpOnly'), true);
  assertEquals(setCookie.includes('Secure'), true);
});

Deno.test('EchelonResponse - clears cookie', () => {
  const res = new EchelonResponse();
  const response = res.clearCookie('session').build();
  const setCookie = response.headers.get('Set-Cookie');
  assertExists(setCookie);
  assertEquals(setCookie.includes('Max-Age=0'), true);
});

Deno.test('EchelonResponse - sets content type', () => {
  const res = new EchelonResponse();
  const response = res.type('application/xml').build();
  assertEquals(response.headers.get('Content-Type'), 'application/xml');
});
