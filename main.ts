/**
 * Echelon Application Entry Point
 *
 * This is the main entry point for an Echelon application.
 * It demonstrates the boot sequence as defined in Layer 0.
 */

import { Application, type ApplicationOptions } from '@echelon/app.ts';
import { loadConfig, type ConfigOptions } from '@echelon/config/mod.ts';
import { checkPermissions } from '@echelon/runtime/permissions.ts';

// Boot sequence as defined in Layer 0
async function main(): Promise<void> {
  // 1. Load configuration
  const config = await loadConfig();

  // 2. Check required permissions (with empty array to skip default permission checks for now)
  await checkPermissions([]);

  // 3. Open database (Deno KV)
  const _kv = await Deno.openKv();

  // 4. Create application instance
  const app = new Application({
    config: config.all() as ConfigOptions,
  });

  // 5. Initialize application
  await app.init();

  // 6. Register routes (from src/)
  const { registerRoutes } = await import('@/routes/mod.ts');
  registerRoutes(app);

  // 7. Start server
  const port = config.get<number>('port', 8000);
  console.log(`🚀 Echelon starting on http://localhost:${port}`);
  await app.listen({ port });
}

// Handle startup
main().catch((error) => {
  console.error('Failed to start Echelon:', error);
  Deno.exit(1);
});
