/**
 * Authentication Routes Wrapper
 *
 * Wraps IAM context auth routes for the main application.
 */

import { setupAuthRoutes } from '../contexts/iam/presentation/auth_routes.ts';
import type { Application } from '../../framework/app.ts';

/**
 * Register authentication routes with the application
 */
export async function registerAuthRoutes(app: Application): Promise<void> {
  await setupAuthRoutes(app);
}
