/**
 * Echelon Application Entry Point
 *
 * This is the main entry point for an Echelon application.
 * It demonstrates the boot sequence as defined in Layer 0.
 */

import { Application, type ApplicationOptions } from '@echelon/app.ts';
import { loadConfig, type ConfigOptions } from '@echelon/config/mod.ts';
import { checkPermissions } from '@echelon/runtime/permissions.ts';
import { createSessionMiddleware } from '@echelon/auth/session.ts';
import { createAuthMiddleware } from '@echelon/auth/auth.ts';

// Boot sequence as defined in Layer 0
async function main(): Promise<void> {
  // 1. Load configuration
  const config = await loadConfig();

  // 2. Check required permissions (with empty array to skip default permission checks for now)
  await checkPermissions([]);

  // 3. Open database (Deno KV)
  const _kv = await Deno.openKv();

  // 4. Seed database with default data (admin user)
  const { seedDatabase } = await import('@/contexts/iam/infrastructure/seed.ts');
  await seedDatabase();

  // 5. Create application instance
  const app = new Application({
    config: config.all() as ConfigOptions,
  });

  // 6. Register global middleware
  // Session middleware must run first to load sessions from cookies
  app.use(createSessionMiddleware({
    secure: false, // Set to true in production with HTTPS
  }));

  // Auth middleware loads user from session into context
  const { getAuthService } = await import('@/contexts/iam/application/auth_service.ts');
  const authService = await getAuthService();
  app.use(createAuthMiddleware({
    userLoader: (id) => authService.loadUser(id),
  }));

  // 7. Initialize application
  await app.init();

  // 8. Register routes (from src/)
  const { registerRoutes } = await import('@/routes/mod.ts');
  await registerRoutes(app);

  // 9. Start server
  const port = config.get<number>('port', 9090);
  console.log(`🚀 Echelon starting on http://localhost:${port}`);
  await app.listen({ port });
}

// Handle startup
main().catch((error) => {
  console.error('Failed to start Echelon:', error);
  Deno.exit(1);
});
