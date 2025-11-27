/**
 * Application Routes
 *
 * Defines all application routes and handlers.
 */

import { Router, type Context } from '../../framework/mod.ts';
import { homeRoutes } from './home.ts';
import { apiRoutes } from './api.ts';

/**
 * Register all application routes
 */
export function registerRoutes(app: { routes: (router: Router) => void }): void {
  app.routes(homeRoutes);
  app.routes(apiRoutes);
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
