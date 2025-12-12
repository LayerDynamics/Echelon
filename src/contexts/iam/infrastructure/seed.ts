/**
 * Database Seed Script
 *
 * Creates default admin user for development.
 * Idempotent - safe to run multiple times.
 *
 * @module
 */

import { getAuthService } from '../application/auth_service.ts';
import { getLogger } from '@echelon/telemetry/logger.ts';

const logger = getLogger();

/**
 * Default admin credentials
 */
export const DEFAULT_ADMIN = {
  email: 'admin@echelon.local',
  name: 'Admin User',
  password: 'admin123',
  role: 'admin' as const,
};

/**
 * Seed the database with initial data
 */
export async function seedDatabase(): Promise<void> {
  try {
    logger.info('🌱 Seeding database...');

    const authService = await getAuthService();

    // Create default admin user (idempotent - checks if exists)
    const result = await authService.register(
      DEFAULT_ADMIN.email,
      DEFAULT_ADMIN.name,
      DEFAULT_ADMIN.password,
      DEFAULT_ADMIN.role
    );

    if (result.success) {
      logger.info('✅ Created default admin user', {
        email: DEFAULT_ADMIN.email,
        userId: result.userId,
      });

      // Auto-verify the admin user's email
      if (result.verificationToken) {
        const verifyResult = await authService.verifyEmail(result.verificationToken);
        if (verifyResult.success) {
          logger.info('✅ Verified admin email');
        }
      }

      logger.info('');
      logger.info('═══════════════════════════════════════════════════════════');
      logger.info('  DEFAULT ADMIN CREDENTIALS');
      logger.info('═══════════════════════════════════════════════════════════');
      logger.info(`  Email:    ${DEFAULT_ADMIN.email}`);
      logger.info(`  Password: ${DEFAULT_ADMIN.password}`);
      logger.info('═══════════════════════════════════════════════════════════');
      logger.info('  ⚠️  CHANGE THIS PASSWORD IN PRODUCTION!');
      logger.info('═══════════════════════════════════════════════════════════');
      logger.info('');
    } else if (result.error === 'Email already registered') {
      logger.debug('Admin user already exists - skipping', {
        email: DEFAULT_ADMIN.email,
      });
    } else {
      logger.warn('Failed to create admin user', {
        error: result.error,
      });
    }

    logger.info('✅ Database seeding complete');
  } catch (error) {
    logger.error('Database seeding failed', error as Error);
    throw error;
  }
}

/**
 * Run seed script directly
 */
if (import.meta.main) {
  await seedDatabase();
  Deno.exit(0);
}
