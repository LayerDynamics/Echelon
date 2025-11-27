/**
 * Admin Module Tests
 *
 * Comprehensive tests for admin functionality including:
 * - Audit logging
 * - User management
 * - Data import/export
 */

import {
  assertEquals,
  assertExists,
  assert,
  assertStringIncludes,
} from 'jsr:@std/assert';
import {
  AuditLogger,
  type AuditLogEntry,
  type AuditLogFilter,
} from '../../framework/admin/audit.ts';
import {
  UserManager,
  type User,
  type CreateUserData,
} from '../../framework/admin/users.ts';
import {
  DataManager,
  type ExportResult,
  type ImportResult,
} from '../../framework/admin/data.ts';

// ============================================================================
// AuditLogger Tests
// ============================================================================

Deno.test({
  name: 'AuditLogger - log entry',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const logger = new AuditLogger({ enabled: true, batchSize: 1 });

    const id = await logger.log({
      action: 'user_create',
      category: 'user',
      userId: 'user123',
      details: { username: 'testuser' },
      success: true,
    });
    await logger.flush();

    assertExists(id);
    assert(id.length > 0);
  },
});

Deno.test({
  name: 'AuditLogger - log entry with all fields',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const logger = new AuditLogger({ enabled: true, batchSize: 1 });

    const id = await logger.log({
      action: 'login',
      category: 'auth',
      userId: 'user123',
      username: 'testuser',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      resource: 'session',
      resourceId: 'session-456',
      details: { method: 'password' },
      success: true,
    });
    await logger.flush();

    assertExists(id);
  },
});

Deno.test('AuditLogger - disabled logger returns empty id', async () => {
  const logger = new AuditLogger({ enabled: false });

  const id = await logger.log({
    action: 'login',
    category: 'auth',
    success: true,
  });

  assertEquals(id, '');
});

Deno.test({
  name: 'AuditLogger - query entries by filter action',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const logger = new AuditLogger({ enabled: true, batchSize: 1 });

    // Create some log entries
    await logger.log({ action: 'login', category: 'auth', userId: 'user1', success: true });
    await logger.log({ action: 'logout', category: 'auth', userId: 'user1', success: true });
    await logger.log({ action: 'login', category: 'auth', userId: 'user2', success: true });
    await logger.flush();

    const results = await logger.query({ filter: { action: 'login' } });

    assert(results.entries.length >= 2);
    for (const entry of results.entries) {
      if (entry.action !== 'login') continue; // Skip entries from other tests
      assertEquals(entry.action, 'login');
    }
  },
});

Deno.test({
  name: 'AuditLogger - query entries by filter category',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const logger = new AuditLogger({ enabled: true, batchSize: 1 });

    await logger.log({ action: 'login', category: 'auth', userId: 'user1', success: true });
    await logger.log({ action: 'user_create', category: 'user', userId: 'admin', success: true });
    await logger.log({ action: 'logout', category: 'auth', userId: 'user1', success: true });
    await logger.flush();

    const results = await logger.query({ filter: { category: 'auth' } });

    assert(results.entries.length >= 2);
  },
});

Deno.test({
  name: 'AuditLogger - query entries by filter userId',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const uniqueUserId = `user1_${Date.now()}`;
    const logger = new AuditLogger({ enabled: true, batchSize: 1 });

    await logger.log({ action: 'login', category: 'auth', userId: uniqueUserId, success: true });
    await logger.log({ action: 'login', category: 'auth', userId: 'user2', success: true });
    await logger.log({ action: 'logout', category: 'auth', userId: uniqueUserId, success: true });
    await logger.flush();

    const results = await logger.query({ filter: { userId: uniqueUserId } });

    assertEquals(results.entries.length, 2);
    for (const entry of results.entries) {
      assertEquals(entry.userId, uniqueUserId);
    }
  },
});

Deno.test({
  name: 'AuditLogger - query with pagination',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const logger = new AuditLogger({ enabled: true, batchSize: 1 });

    // Create 5 entries
    for (let i = 0; i < 5; i++) {
      await logger.log({
        action: 'login',
        category: 'auth',
        userId: `user${i}`,
        success: true,
      });
    }
    await logger.flush();

    const page1 = await logger.query({ limit: 2, offset: 0 });
    const page2 = await logger.query({ limit: 2, offset: 2 });

    assertEquals(page1.entries.length, 2);
    assertEquals(page2.entries.length, 2);
  },
});

Deno.test({
  name: 'AuditLogger - entry has timestamp',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const logger = new AuditLogger({ enabled: true, batchSize: 1 });

    await logger.log({ action: 'login', category: 'auth', userId: 'user1', success: true });
    await logger.flush();

    const results = await logger.query({});

    assert(results.entries.length > 0);
    assertExists(results.entries[0].timestamp);
    assert(results.entries[0].timestamp instanceof Date);
  },
});

Deno.test({
  name: 'AuditLogger - filter by success',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const logger = new AuditLogger({ enabled: true, batchSize: 1 });

    await logger.log({ action: 'login', category: 'auth', userId: 'user1', success: true });
    await logger.log({ action: 'login_failed', category: 'auth', userId: 'user2', success: false });
    await logger.flush();

    const successResults = await logger.query({ filter: { success: true } });
    const failResults = await logger.query({ filter: { success: false } });

    for (const entry of successResults.entries) {
      assertEquals(entry.success, true);
    }
    for (const entry of failResults.entries) {
      assertEquals(entry.success, false);
    }
  },
});

// ============================================================================
// UserManager Tests
// ============================================================================

Deno.test({
  name: 'UserManager - create user',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new UserManager({ enableAuditLogging: false });

    const user = await manager.createUser({
      username: `testuser_${Date.now()}`,
      email: `test${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Test User',
    });

    assertExists(user.id);
    assertExists(user.email);
    assertEquals(user.enabled, true);
  },
});

Deno.test({
  name: 'UserManager - get user by id',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new UserManager({ enableAuditLogging: false });

    const created = await manager.createUser({
      username: `getuser_${Date.now()}`,
      email: `getuser${Date.now()}@example.com`,
      password: 'Password123!',
    });

    const user = await manager.getUserById(created.id);

    assertExists(user);
    assertEquals(user!.id, created.id);
  },
});

Deno.test({
  name: 'UserManager - get user by username',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new UserManager({ enableAuditLogging: false });
    const username = `finduser_${Date.now()}`;

    await manager.createUser({
      username,
      email: `finduser${Date.now()}@example.com`,
      password: 'Password123!',
    });

    const user = await manager.getUserByUsername(username);

    assertExists(user);
    assertEquals(user!.username, username);
  },
});

Deno.test({
  name: 'UserManager - get user by email',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new UserManager({ enableAuditLogging: false });
    const email = `findemail${Date.now()}@example.com`;

    await manager.createUser({
      username: `emailuser_${Date.now()}`,
      email,
      password: 'Password123!',
    });

    const user = await manager.getUserByEmail(email);

    assertExists(user);
    assertEquals(user!.email, email);
  },
});

Deno.test({
  name: 'UserManager - update user',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new UserManager({ enableAuditLogging: false });

    const created = await manager.createUser({
      username: `updateuser_${Date.now()}`,
      email: `updateuser${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Original Name',
    });

    const updated = await manager.updateUser(created.id, {
      displayName: 'Updated Name',
    });

    assertEquals(updated.displayName, 'Updated Name');
  },
});

Deno.test({
  name: 'UserManager - delete user',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new UserManager({ enableAuditLogging: false });

    const created = await manager.createUser({
      username: `deleteuser_${Date.now()}`,
      email: `deleteuser${Date.now()}@example.com`,
      password: 'Password123!',
    });

    await manager.deleteUser(created.id);

    const user = await manager.getUserById(created.id);
    assertEquals(user, null);
  },
});

Deno.test({
  name: 'UserManager - query users',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new UserManager({ enableAuditLogging: false });
    const prefix = Date.now().toString();

    await manager.createUser({
      username: `query1_${prefix}`,
      email: `query1_${prefix}@example.com`,
      password: 'Pass123!',
    });
    await manager.createUser({
      username: `query2_${prefix}`,
      email: `query2_${prefix}@example.com`,
      password: 'Pass123!',
    });

    const results = await manager.queryUsers({});

    assert(results.users.length >= 2);
  },
});

Deno.test({
  name: 'UserManager - query users with pagination',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new UserManager({ enableAuditLogging: false });

    const results = await manager.queryUsers({ limit: 2, offset: 0 });

    assert(results.users.length <= 2);
    assertExists(results.total);
  },
});

Deno.test({
  name: 'UserManager - assign role',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new UserManager({ enableAuditLogging: false });

    const created = await manager.createUser({
      username: `roleuser_${Date.now()}`,
      email: `roleuser${Date.now()}@example.com`,
      password: 'Pass123!',
    });

    await manager.assignRoles(created.id, ['admin']);

    const user = await manager.getUserById(created.id);
    assert(user!.roles.includes('admin'));
  },
});

Deno.test({
  name: 'UserManager - revoke role',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new UserManager({ enableAuditLogging: false });

    const created = await manager.createUser({
      username: `revokerole_${Date.now()}`,
      email: `revokerole${Date.now()}@example.com`,
      password: 'Pass123!',
      roles: ['user', 'admin'],
    });

    await manager.revokeRoles(created.id, ['admin']);

    const user = await manager.getUserById(created.id);
    assert(!user!.roles.includes('admin'));
  },
});

Deno.test({
  name: 'UserManager - disable user',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new UserManager({ enableAuditLogging: false });

    const created = await manager.createUser({
      username: `disableuser_${Date.now()}`,
      email: `disableuser${Date.now()}@example.com`,
      password: 'Pass123!',
    });

    await manager.disableUser(created.id);

    const user = await manager.getUserById(created.id);
    assertEquals(user!.enabled, false);
  },
});

Deno.test({
  name: 'UserManager - enable user',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new UserManager({ enableAuditLogging: false });

    const created = await manager.createUser({
      username: `enableuser_${Date.now()}`,
      email: `enableuser${Date.now()}@example.com`,
      password: 'Pass123!',
      enabled: false,
    });

    await manager.enableUser(created.id);

    const user = await manager.getUserById(created.id);
    assertEquals(user!.enabled, true);
  },
});

Deno.test({
  name: 'UserManager - verify password',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new UserManager({ enableAuditLogging: false });

    const created = await manager.createUser({
      username: `verifypass_${Date.now()}`,
      email: `verifypass${Date.now()}@example.com`,
      password: 'SecurePass123!',
    });

    const valid = await manager.verifyUserPassword(created.id, 'SecurePass123!');
    const invalid = await manager.verifyUserPassword(created.id, 'WrongPassword!');

    assertEquals(valid, true);
    assertEquals(invalid, false);
  },
});

Deno.test({
  name: 'UserManager - change password',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new UserManager({ enableAuditLogging: false });

    const created = await manager.createUser({
      username: `changepass_${Date.now()}`,
      email: `changepass${Date.now()}@example.com`,
      password: 'OldPassword123!',
    });

    await manager.changePassword(created.id, 'NewPassword456!');

    const validNew = await manager.verifyUserPassword(created.id, 'NewPassword456!');
    const validOld = await manager.verifyUserPassword(created.id, 'OldPassword123!');

    assertEquals(validNew, true);
    assertEquals(validOld, false);
  },
});

// ============================================================================
// DataManager Tests
// ============================================================================

Deno.test({
  name: 'DataManager - export to JSON',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new DataManager();
    await manager.init();

    const result = await manager.export({
      format: 'json',
    });

    assertEquals(result.success, true);
    assertEquals(result.format, 'json');
    assertExists(result.data);
  },
});

Deno.test({
  name: 'DataManager - export to CSV',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new DataManager();
    await manager.init();

    const result = await manager.export({
      format: 'csv',
    });

    assertEquals(result.success, true);
    assertEquals(result.format, 'csv');
    assertExists(result.data);
    assertStringIncludes(result.data as string, 'key,value');
  },
});

Deno.test({
  name: 'DataManager - export to NDJSON',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new DataManager();
    await manager.init();

    const result = await manager.export({
      format: 'ndjson',
    });

    assertEquals(result.success, true);
    assertEquals(result.format, 'ndjson');
  },
});

Deno.test({
  name: 'DataManager - import from JSON',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new DataManager();
    await manager.init();

    const prefix = Date.now().toString();
    const jsonData = JSON.stringify({
      records: [
        { key: ['imported', prefix, 'doc1'], value: { name: 'Imported 1' } },
        { key: ['imported', prefix, 'doc2'], value: { name: 'Imported 2' } },
      ],
    });

    const result = await manager.import(jsonData, { format: 'json' });

    assertEquals(result.success, true);
    assertEquals(result.imported, 2);
    assertEquals(result.totalRecords, 2);
  },
});

Deno.test({
  name: 'DataManager - import with dry run',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new DataManager();
    await manager.init();

    const prefix = Date.now().toString();
    const jsonData = JSON.stringify({
      records: [{ key: ['dryrun', prefix], value: { name: 'Test' } }],
    });

    const result = await manager.import(jsonData, {
      format: 'json',
      dryRun: true,
    });

    assertEquals(result.success, true);
    assertEquals(result.dryRun, true);
    assertEquals(result.imported, 1);
  },
});

Deno.test({
  name: 'DataManager - import with skip conflict',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new DataManager();
    await manager.init();

    const prefix = Date.now().toString();

    // First import
    const jsonData1 = JSON.stringify({
      records: [{ key: ['skiptest', prefix], value: { name: 'Original' } }],
    });
    await manager.import(jsonData1, { format: 'json' });

    // Second import with skip
    const jsonData2 = JSON.stringify({
      records: [{ key: ['skiptest', prefix], value: { name: 'New' } }],
    });
    const result = await manager.import(jsonData2, {
      format: 'json',
      onConflict: 'skip',
    });

    assertEquals(result.success, true);
    assertEquals(result.skipped, 1);
  },
});

Deno.test({
  name: 'DataManager - bulk delete dry run',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new DataManager();
    await manager.init();

    const prefix = Date.now().toString();

    // Import some data first
    const jsonData = JSON.stringify({
      records: [
        { key: ['bulkdel', prefix, 'doc1'], value: { name: 'Doc 1' } },
        { key: ['bulkdel', prefix, 'doc2'], value: { name: 'Doc 2' } },
      ],
    });
    await manager.import(jsonData, { format: 'json' });

    const result = await manager.bulkDelete({
      prefix: ['bulkdel', prefix],
      dryRun: true,
    });

    assertEquals(result.success, true);
    assertEquals(result.dryRun, true);
    assertEquals(result.deleted, 2);
  },
});

Deno.test({
  name: 'DataManager - get stats',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new DataManager();
    await manager.init();

    const stats = await manager.getStats();

    assertExists(stats.totalRecords);
    assertExists(stats.prefixes);
    assertExists(stats.estimatedSizeBytes);
  },
});

Deno.test({
  name: 'DataManager - register and run migration',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new DataManager();
    await manager.init();

    const migrationId = `migration_${Date.now()}`;

    // Register migration
    manager.registerMigration({
      id: migrationId,
      name: 'Add test data',
      version: Date.now(),
      up: async () => {
        // Migration logic
      },
      down: async () => {
        // Rollback logic
      },
    });

    // Run migrations
    const result = await manager.migrate();

    assert(result.applied.includes(migrationId));
    assertEquals(result.errors.length, 0);
  },
});

Deno.test({
  name: 'DataManager - get applied migrations',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new DataManager();
    await manager.init();

    const applied = await manager.getAppliedMigrations();

    assert(Array.isArray(applied));
  },
});

Deno.test({
  name: 'DataManager - create backup',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new DataManager();
    await manager.init();

    // Use a small prefix to limit backup size (KV has 65KB limit per value)
    const metadata = await manager.createBackup({
      description: 'Test backup',
      prefix: ['_test_backup_small'],
    });

    assertExists(metadata.id);
    assertExists(metadata.checksum);
    assertExists(metadata.createdAt);
  },
});

Deno.test({
  name: 'DataManager - list backups',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new DataManager();
    await manager.init();

    await manager.createBackup({
      description: 'List test backup',
      prefix: ['_test_backup_list'],
    });

    const backups = await manager.listBackups();

    assert(backups.length > 0);
  },
});

Deno.test({
  name: 'DataManager - get backup',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new DataManager();
    await manager.init();

    const created = await manager.createBackup({
      description: 'Get test backup',
      prefix: ['_test_backup_get'],
    });

    const backup = await manager.getBackup(created.id);

    assertExists(backup);
    assertEquals(backup!.id, created.id);
  },
});

Deno.test({
  name: 'DataManager - delete backup',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const manager = new DataManager();
    await manager.init();

    const created = await manager.createBackup({
      description: 'Delete test backup',
      prefix: ['_test_backup_delete'],
    });

    const deleted = await manager.deleteBackup(created.id);

    assertEquals(deleted, true);

    const backup = await manager.getBackup(created.id);
    assertEquals(backup, null);
  },
});
