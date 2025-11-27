/**
 * Middleware Tests
 */

import { assertEquals } from 'jsr:@std/assert';
import { MiddlewarePipeline } from '../../framework/middleware/pipeline.ts';
import type { Context, Middleware, Next } from '../../framework/http/types.ts';

function createTestContext(): Context {
  const request = new Request('http://localhost/test');
  const url = new URL('http://localhost/test');
  return {
    request,
    url,
    params: {},
    query: url.searchParams,
    state: new Map(),
    header: (name: string) => request.headers.get(name),
    method: request.method,
  };
}

Deno.test('MiddlewarePipeline - executes single middleware', async () => {
  const pipeline = new MiddlewarePipeline();

  pipeline.use(async (_ctx: Context, next: Next) => {
    const response = await next();
    return new Response('Modified', {
      status: response.status,
    });
  });

  const handler: Middleware = async () => {
    return new Response('Original');
  };

  const ctx = createTestContext();
  const response = await pipeline.execute(ctx, handler);
  const body = await response.text();

  assertEquals(body, 'Modified');
});

Deno.test('MiddlewarePipeline - executes middleware in order', async () => {
  const pipeline = new MiddlewarePipeline();
  const order: number[] = [];

  pipeline.use(async (_ctx: Context, next: Next) => {
    order.push(1);
    const response = await next();
    order.push(4);
    return response;
  });

  pipeline.use(async (_ctx: Context, next: Next) => {
    order.push(2);
    const response = await next();
    order.push(3);
    return response;
  });

  const handler: Middleware = async () => {
    return new Response('OK');
  };

  const ctx = createTestContext();
  await pipeline.execute(ctx, handler);

  assertEquals(order, [1, 2, 3, 4]);
});

Deno.test('MiddlewarePipeline - can modify context state', async () => {
  const pipeline = new MiddlewarePipeline();

  pipeline.use(async (ctx: Context, next: Next) => {
    ctx.state.set('user', { id: 1, name: 'Test' });
    return await next();
  });

  const handler: Middleware = async (ctx: Context) => {
    const user = ctx.state.get('user');
    return Response.json(user);
  };

  const ctx = createTestContext();
  const response = await pipeline.execute(ctx, handler);
  const body = await response.json();

  assertEquals(body, { id: 1, name: 'Test' });
});

Deno.test('MiddlewarePipeline - can short-circuit', async () => {
  const pipeline = new MiddlewarePipeline();
  let handlerCalled = false;

  pipeline.use(async (_ctx: Context, _next: Next) => {
    return new Response('Blocked', { status: 403 });
  });

  const handler: Middleware = async () => {
    handlerCalled = true;
    return new Response('OK');
  };

  const ctx = createTestContext();
  const response = await pipeline.execute(ctx, handler);

  assertEquals(handlerCalled, false);
  assertEquals(response.status, 403);
});

Deno.test('MiddlewarePipeline - handles errors', async () => {
  const pipeline = new MiddlewarePipeline();

  pipeline.use(async (_ctx: Context, _next: Next) => {
    throw new Error('Test error');
  });

  const handler: Middleware = async () => {
    return new Response('OK');
  };

  const ctx = createTestContext();

  try {
    await pipeline.execute(ctx, handler);
  } catch (error) {
    assertEquals((error as Error).message, 'Test error');
  }
});
