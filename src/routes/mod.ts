/**
 * Application Routes
 *
 * Defines all application routes and handlers.
 */

import { Router, type Context } from '../../framework/mod.ts';
import { homeRoutes } from './home.ts';
import { apiRoutes } from './api.ts';
import { registerAuthRoutes } from './auth.ts';
import { dashboardHandler } from './dashboard.ts';
import { setupWasmDemoRoutes } from './wasm_demo.ts';
import { setupWorkspaceRoutes } from '../contexts/workspace/presentation/workspace_routes.ts';
import { setupProjectRoutes } from '../contexts/workspace/presentation/project_routes.ts';
import type { Application } from '../../framework/app.ts';

/**
 * Register all application routes
 */
export async function registerRoutes(app: Application): Promise<void> {
  // Authentication routes
  await registerAuthRoutes(app);

  // Workspace routes (DDD Context)
  await setupWorkspaceRoutes(app);

  // Project routes (DDD Context)
  await setupProjectRoutes(app);

  // WASM Demo routes
  setupWasmDemoRoutes(app);

  // Dashboard
  app.get('/dashboard', dashboardHandler);
  app.get('/', (ctx: Context) => {
    // Redirect to dashboard or login
    const user = ctx.state.get('user');
    return new Response(null, {
      status: 302,
      headers: { 'Location': user ? '/dashboard' : '/auth/login' },
    });
  });

  // Legacy routes (commented out for now - will be replaced with DDD contexts)
  // app.routes(homeRoutes);
  // app.routes(apiRoutes);
}

/**
 * Default 404 handler
 */
export function notFoundHandler(_ctx: Context): Response {
  return new Response('Not Found', { status: 404 });
}

/**
 * Default error handler
 */
export function errorHandler(error: Error, _ctx: Context): Response {
  console.error('Application error:', error);
  return new Response('Internal Server Error', { status: 500 });
}

export { homeRoutes } from './home.ts';
export { apiRoutes } from './api.ts';
