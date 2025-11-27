/**
 * Router Tests
 */

import { assertEquals, assertExists } from 'jsr:@std/assert';
import { Router } from '../../framework/router/router.ts';

Deno.test('Router - basic route registration', () => {
  const router = new Router();

  router.get('/test', () => new Response('OK'));

  const match = router.match('GET', '/test');
  assertExists(match);
  assertEquals(match?.params, {});
});

Deno.test('Router - route with params', () => {
  const router = new Router();

  router.get('/users/:id', () => new Response('OK'));

  const match = router.match('GET', '/users/123');
  assertExists(match);
  assertEquals(match?.params.id, '123');
});

Deno.test('Router - multiple params', () => {
  const router = new Router();

  router.get('/users/:userId/posts/:postId', () => new Response('OK'));

  const match = router.match('GET', '/users/123/posts/456');
  assertExists(match);
  assertEquals(match?.params.userId, '123');
  assertEquals(match?.params.postId, '456');
});

Deno.test('Router - no match returns null', () => {
  const router = new Router();

  router.get('/test', () => new Response('OK'));

  const match = router.match('GET', '/nonexistent');
  assertEquals(match, null);
});

Deno.test('Router - method must match', () => {
  const router = new Router();

  router.get('/test', () => new Response('OK'));

  const match = router.match('POST', '/test');
  assertEquals(match, null);
});

Deno.test('Router - multiple methods same path', () => {
  const router = new Router();

  router.get('/test', () => new Response('GET'));
  router.post('/test', () => new Response('POST'));

  const getMatch = router.match('GET', '/test');
  const postMatch = router.match('POST', '/test');

  assertExists(getMatch);
  assertExists(postMatch);
});

Deno.test('Router - wildcard route', () => {
  const router = new Router();

  router.get('/files/*', () => new Response('OK'));

  const match = router.match('GET', '/files/path/to/file.txt');
  assertExists(match);
});

Deno.test('Router - get all routes', () => {
  const router = new Router();

  router.get('/one', () => new Response('OK'));
  router.post('/two', () => new Response('OK'));
  router.put('/three', () => new Response('OK'));

  const routes = router.getRoutes();
  assertEquals(routes.length, 3);
});
