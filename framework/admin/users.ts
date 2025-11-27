/**
 * Admin User Management
 *
 * Provides comprehensive user management functionality for the admin panel.
 * Supports CRUD operations, role management, password resets, and impersonation.
 */

import { getKV } from '../orm/kv.ts';
import { getLogger } from '../telemetry/logger.ts';
import { hashPassword, verifyPassword } from '../auth/password.ts';
import { getAuditLogger } from './audit.ts';
import type { EchelonRequest } from '../http/request.ts';
import type { EchelonResponse } from '../http/response.ts';

const logger = getLogger();

// ============================================================================
// Types
// ============================================================================

/**
 * User entity
 */
export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash?: string;
  displayName?: string;
  avatar?: string;
  roles: string[];
  permissions: string[];
  enabled: boolean;
  verified: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  lastLoginIP?: string;
  failedLoginAttempts?: number;
  lockedUntil?: Date;
}

/**
 * User creation data
 */
export interface CreateUserData {
  username: string;
  email: string;
  password: string;
  displayName?: string;
  roles?: string[];
  permissions?: string[];
  enabled?: boolean;
  verified?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * User update data
 */
export interface UpdateUserData {
  username?: string;
  email?: string;
  displayName?: string;
  avatar?: string;
  roles?: string[];
  permissions?: string[];
  enabled?: boolean;
  verified?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * User query filters
 */
export interface UserQueryFilter {
  username?: string;
  email?: string;
  role?: string;
  enabled?: boolean;
  verified?: boolean;
  search?: string;  // Search in username, email, displayName
}

/**
 * User query options
 */
export interface UserQueryOptions {
  filter?: UserQueryFilter;
  limit?: number;
  offset?: number;
  sortBy?: 'username' | 'email' | 'createdAt' | 'lastLoginAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Password reset token
 */
export interface PasswordResetToken {
  userId: string;
  token: string;
  expiresAt: Date;
  used: boolean;
}

/**
 * Impersonation session
 */
export interface ImpersonationSession {
  id: string;
  adminUserId: string;
  targetUserId: string;
  startedAt: Date;
  expiresAt: Date;
  reason?: string;
}

/**
 * User manager configuration
 */
export interface UserManagerConfig {
  kvPrefix?: string;
  passwordResetExpiry?: number;  // Hours
  impersonationExpiry?: number;  // Minutes
  maxFailedLogins?: number;
  lockoutDuration?: number;  // Minutes
  requireEmailVerification?: boolean;
  enableAuditLogging?: boolean;  // Enable/disable audit logging for user operations
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: Required<UserManagerConfig> = {
  kvPrefix: 'users',
  passwordResetExpiry: 24,       // 24 hours
  impersonationExpiry: 60,       // 60 minutes
  maxFailedLogins: 5,
  lockoutDuration: 30,           // 30 minutes
  requireEmailVerification: false,
  enableAuditLogging: true,      // Enable audit logging by default
};

const KV_KEYS = {
  USER: (id: string) => ['users', 'user', id],
  BY_USERNAME: (username: string) => ['users', 'by_username', username.toLowerCase()],
  BY_EMAIL: (email: string) => ['users', 'by_email', email.toLowerCase()],
  BY_ROLE: (role: string, userId: string) => ['users', 'by_role', role, userId],
  RESET_TOKEN: (token: string) => ['users', 'reset', token],
  IMPERSONATION: (id: string) => ['users', 'impersonation', id],
  ALL_USERS: () => ['users', 'all'],
};

// ============================================================================
// UserManager Class
// ============================================================================

/**
 * User manager for admin operations
 */
export class UserManager {
  private config: Required<UserManagerConfig>;

  constructor(config: UserManagerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if audit logging is enabled
   */
  private shouldAuditLog(): boolean {
    return this.config.enableAuditLogging;
  }

  /**
   * Create a new user
   */
  async createUser(data: CreateUserData, adminReq?: EchelonRequest): Promise<User> {
    const kv = await getKV();
    const rawKv = kv.raw;

    // Validate username and email uniqueness
    const existingByUsername = await kv.get<string>(KV_KEYS.BY_USERNAME(data.username));
    if (existingByUsername) {
      throw new Error('Username already exists');
    }

    const existingByEmail = await kv.get<string>(KV_KEYS.BY_EMAIL(data.email));
    if (existingByEmail) {
      throw new Error('Email already exists');
    }

    // Hash password
    const passwordHash = await hashPassword(data.password);

    // Create user
    const user: User = {
      id: crypto.randomUUID(),
      username: data.username,
      email: data.email,
      passwordHash,
      displayName: data.displayName,
      roles: data.roles ?? ['user'],
      permissions: data.permissions ?? [],
      enabled: data.enabled ?? true,
      verified: data.verified ?? !this.config.requireEmailVerification,
      metadata: data.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Atomic write
    const atomic = rawKv.atomic();
    atomic.set(KV_KEYS.USER(user.id), user);
    atomic.set(KV_KEYS.BY_USERNAME(user.username), user.id);
    atomic.set(KV_KEYS.BY_EMAIL(user.email), user.id);

    // Index by roles
    for (const role of user.roles) {
      atomic.set(KV_KEYS.BY_ROLE(role, user.id), user.id);
    }

    const result = await atomic.commit();
    if (!result.ok) {
      throw new Error('Failed to create user');
    }

    // Audit log
    if (this.shouldAuditLog()) {
      const auditLogger = getAuditLogger();
      await auditLogger.logFromRequest(
        adminReq ?? {} as EchelonRequest,
        'user_create',
        'user',
        { userId: user.id, username: user.username }
      );
    }

    logger.info('User created', { userId: user.id, username: user.username });

    // Return user without sensitive fields
    return this.sanitizeUser(user);
  }

  /**
   * Get a user by ID
   */
  async getUserById(id: string): Promise<User | null> {
    const kv = await getKV();
    const user = await kv.get<User>(KV_KEYS.USER(id));
    return user ? this.sanitizeUser(user) : null;
  }

  /**
   * Get a user by username
   */
  async getUserByUsername(username: string): Promise<User | null> {
    const kv = await getKV();
    const userId = await kv.get<string>(KV_KEYS.BY_USERNAME(username));
    if (!userId) return null;
    return this.getUserById(userId);
  }

  /**
   * Get a user by email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    const kv = await getKV();
    const userId = await kv.get<string>(KV_KEYS.BY_EMAIL(email));
    if (!userId) return null;
    return this.getUserById(userId);
  }

  /**
   * Query users with filtering and pagination
   */
  async queryUsers(options: UserQueryOptions = {}): Promise<{
    users: User[];
    total: number;
    hasMore: boolean;
  }> {
    const kv = await getKV();
    const filter = options.filter ?? {};
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    const sortOrder = options.sortOrder ?? 'asc';

    // Get all users (we'll filter in memory)
    // In a real implementation, you'd want better indexing for large user bases
    const allUsers: User[] = [];

    // If filtering by role, use the role index
    if (filter.role) {
      const roleItems = await kv.list<string>(['users', 'by_role', filter.role]);
      for (const item of roleItems) {
        const user = await this.getUserById(item.value);
        if (user) allUsers.push(user);
      }
    } else {
      // Scan all users by username index
      const userItems = await kv.list<string>(['users', 'by_username']);
      for (const item of userItems) {
        const user = await this.getUserById(item.value);
        if (user) allUsers.push(user);
      }
    }

    // Apply filters
    let filtered = allUsers.filter(user => {
      if (filter.username && !user.username.toLowerCase().includes(filter.username.toLowerCase())) {
        return false;
      }
      if (filter.email && !user.email.toLowerCase().includes(filter.email.toLowerCase())) {
        return false;
      }
      if (filter.enabled !== undefined && user.enabled !== filter.enabled) {
        return false;
      }
      if (filter.verified !== undefined && user.verified !== filter.verified) {
        return false;
      }
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        const matches =
          user.username.toLowerCase().includes(searchLower) ||
          user.email.toLowerCase().includes(searchLower) ||
          (user.displayName?.toLowerCase().includes(searchLower) ?? false);
        if (!matches) return false;
      }
      return true;
    });

    // Sort
    const sortBy = options.sortBy ?? 'username';
    filtered.sort((a, b) => {
      let aVal: string | Date | undefined;
      let bVal: string | Date | undefined;

      switch (sortBy) {
        case 'username':
          aVal = a.username;
          bVal = b.username;
          break;
        case 'email':
          aVal = a.email;
          bVal = b.email;
          break;
        case 'createdAt':
          aVal = a.createdAt;
          bVal = b.createdAt;
          break;
        case 'lastLoginAt':
          aVal = a.lastLoginAt;
          bVal = b.lastLoginAt;
          break;
      }

      if (aVal === undefined) return 1;
      if (bVal === undefined) return -1;

      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    // Paginate
    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit + 1);
    const hasMore = paginated.length > limit;
    if (hasMore) paginated.pop();

    return {
      users: paginated,
      total,
      hasMore,
    };
  }

  /**
   * Update a user
   */
  async updateUser(id: string, data: UpdateUserData, adminReq?: EchelonRequest): Promise<User> {
    const kv = await getKV();
    const rawKv = kv.raw;

    // Get existing user (with password hash)
    const existing = await rawKv.get<User>(KV_KEYS.USER(id));
    if (!existing.value) {
      throw new Error('User not found');
    }

    const user = existing.value;
    const oldUsername = user.username;
    const oldEmail = user.email;
    const oldRoles = [...user.roles];

    // Check uniqueness if username/email changed
    if (data.username && data.username !== user.username) {
      const existingByUsername = await kv.get<string>(KV_KEYS.BY_USERNAME(data.username));
      if (existingByUsername) {
        throw new Error('Username already exists');
      }
    }

    if (data.email && data.email !== user.email) {
      const existingByEmail = await kv.get<string>(KV_KEYS.BY_EMAIL(data.email));
      if (existingByEmail) {
        throw new Error('Email already exists');
      }
    }

    // Update user fields
    const updatedUser: User = {
      ...user,
      ...data,
      updatedAt: new Date(),
    };

    // Atomic update
    const atomic = rawKv.atomic();
    atomic.check(existing);
    atomic.set(KV_KEYS.USER(id), updatedUser);

    // Update username index if changed
    if (data.username && data.username !== oldUsername) {
      atomic.delete(KV_KEYS.BY_USERNAME(oldUsername));
      atomic.set(KV_KEYS.BY_USERNAME(data.username), id);
    }

    // Update email index if changed
    if (data.email && data.email !== oldEmail) {
      atomic.delete(KV_KEYS.BY_EMAIL(oldEmail));
      atomic.set(KV_KEYS.BY_EMAIL(data.email), id);
    }

    // Update role indexes if changed
    if (data.roles) {
      // Remove old role indexes
      for (const role of oldRoles) {
        atomic.delete(KV_KEYS.BY_ROLE(role, id));
      }
      // Add new role indexes
      for (const role of data.roles) {
        atomic.set(KV_KEYS.BY_ROLE(role, id), id);
      }
    }

    const result = await atomic.commit();
    if (!result.ok) {
      throw new Error('Failed to update user');
    }

    // Audit log
    if (this.shouldAuditLog()) {
      const auditLogger = getAuditLogger();
      await auditLogger.logDataChange(
        'user_update',
        'user',
        id,
        Object.entries(data).map(([field, newValue]) => ({
          field,
          oldValue: (user as unknown as Record<string, unknown>)[field],
          newValue,
        })),
        adminReq
      );
    }

    logger.info('User updated', { userId: id });

    return this.sanitizeUser(updatedUser);
  }

  /**
   * Delete a user
   */
  async deleteUser(id: string, adminReq?: EchelonRequest): Promise<void> {
    const kv = await getKV();
    const rawKv = kv.raw;

    const existing = await rawKv.get<User>(KV_KEYS.USER(id));
    if (!existing.value) {
      throw new Error('User not found');
    }

    const user = existing.value;

    // Atomic delete
    const atomic = rawKv.atomic();
    atomic.check(existing);
    atomic.delete(KV_KEYS.USER(id));
    atomic.delete(KV_KEYS.BY_USERNAME(user.username));
    atomic.delete(KV_KEYS.BY_EMAIL(user.email));

    // Remove role indexes
    for (const role of user.roles) {
      atomic.delete(KV_KEYS.BY_ROLE(role, id));
    }

    const result = await atomic.commit();
    if (!result.ok) {
      throw new Error('Failed to delete user');
    }

    // Audit log
    if (this.shouldAuditLog()) {
      const auditLogger = getAuditLogger();
      await auditLogger.logFromRequest(
        adminReq ?? {} as EchelonRequest,
        'user_delete',
        'user',
        { userId: id, username: user.username }
      );
    }

    logger.info('User deleted', { userId: id, username: user.username });
  }

  /**
   * Enable a user
   */
  async enableUser(id: string, adminReq?: EchelonRequest): Promise<User> {
    const user = await this.updateUser(id, { enabled: true }, adminReq);

    if (this.shouldAuditLog()) {
      const auditLogger = getAuditLogger();
      await auditLogger.logFromRequest(
        adminReq ?? {} as EchelonRequest,
        'user_enable',
        'user',
        { userId: id }
      );
    }

    return user;
  }

  /**
   * Disable a user
   */
  async disableUser(id: string, adminReq?: EchelonRequest): Promise<User> {
    const user = await this.updateUser(id, { enabled: false }, adminReq);

    if (this.shouldAuditLog()) {
      const auditLogger = getAuditLogger();
      await auditLogger.logFromRequest(
        adminReq ?? {} as EchelonRequest,
        'user_disable',
        'user',
        { userId: id }
      );
    }

    return user;
  }

  /**
   * Assign roles to a user
   */
  async assignRoles(id: string, roles: string[], adminReq?: EchelonRequest): Promise<User> {
    const existing = await this.getUserById(id);
    if (!existing) {
      throw new Error('User not found');
    }

    const newRoles = [...new Set([...existing.roles, ...roles])];
    const user = await this.updateUser(id, { roles: newRoles }, adminReq);

    if (this.shouldAuditLog()) {
      const auditLogger = getAuditLogger();
      await auditLogger.logFromRequest(
        adminReq ?? {} as EchelonRequest,
        'role_assign',
        'access',
        { userId: id, roles }
      );
    }

    return user;
  }

  /**
   * Revoke roles from a user
   */
  async revokeRoles(id: string, roles: string[], adminReq?: EchelonRequest): Promise<User> {
    const existing = await this.getUserById(id);
    if (!existing) {
      throw new Error('User not found');
    }

    const newRoles = existing.roles.filter(r => !roles.includes(r));
    const user = await this.updateUser(id, { roles: newRoles }, adminReq);

    if (this.shouldAuditLog()) {
      const auditLogger = getAuditLogger();
      await auditLogger.logFromRequest(
        adminReq ?? {} as EchelonRequest,
        'role_revoke',
        'access',
        { userId: id, roles }
      );
    }

    return user;
  }

  /**
   * Change user password
   */
  async changePassword(id: string, newPassword: string, adminReq?: EchelonRequest): Promise<void> {
    const kv = await getKV();
    const rawKv = kv.raw;

    const existing = await rawKv.get<User>(KV_KEYS.USER(id));
    if (!existing.value) {
      throw new Error('User not found');
    }

    const passwordHash = await hashPassword(newPassword);

    const updatedUser: User = {
      ...existing.value,
      passwordHash,
      updatedAt: new Date(),
    };

    const atomic = rawKv.atomic();
    atomic.check(existing);
    atomic.set(KV_KEYS.USER(id), updatedUser);

    const result = await atomic.commit();
    if (!result.ok) {
      throw new Error('Failed to change password');
    }

    // Audit log
    if (this.shouldAuditLog()) {
      const auditLogger = getAuditLogger();
      await auditLogger.logFromRequest(
        adminReq ?? {} as EchelonRequest,
        'password_change',
        'auth',
        { userId: id }
      );
    }

    logger.info('Password changed', { userId: id });
  }

  /**
   * Verify user password (for validation)
   */
  async verifyUserPassword(id: string, password: string): Promise<boolean> {
    const kv = await getKV();
    const rawKv = kv.raw;

    const result = await rawKv.get<User>(KV_KEYS.USER(id));
    if (!result.value) return false;

    const user = result.value;
    if (!user.passwordHash) return false;

    return verifyPassword(password, user.passwordHash);
  }

  /**
   * Generate a password reset token
   */
  async generatePasswordResetToken(email: string): Promise<string | null> {
    const user = await this.getUserByEmail(email);
    if (!user) return null;

    const kv = await getKV();
    const token = crypto.randomUUID();

    const resetToken: PasswordResetToken = {
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + this.config.passwordResetExpiry * 60 * 60 * 1000),
      used: false,
    };

    await kv.set(KV_KEYS.RESET_TOKEN(token), resetToken, {
      expireIn: this.config.passwordResetExpiry * 60 * 60 * 1000,
    });

    logger.info('Password reset token generated', { userId: user.id });

    return token;
  }

  /**
   * Reset password using a token
   */
  async resetPasswordWithToken(token: string, newPassword: string): Promise<boolean> {
    const kv = await getKV();
    const rawKv = kv.raw;

    const resetResult = await rawKv.get<PasswordResetToken>(KV_KEYS.RESET_TOKEN(token));
    if (!resetResult.value) return false;

    const resetToken = resetResult.value;
    if (resetToken.used) return false;
    if (new Date() > new Date(resetToken.expiresAt)) return false;

    // Change password
    await this.changePassword(resetToken.userId, newPassword);

    // Mark token as used
    const atomic = rawKv.atomic();
    atomic.check(resetResult);
    atomic.set(KV_KEYS.RESET_TOKEN(token), { ...resetToken, used: true });
    await atomic.commit();

    // Audit log
    if (this.shouldAuditLog()) {
      const auditLogger = getAuditLogger();
      await auditLogger.log({
        category: 'auth',
        action: 'password_reset',
        userId: resetToken.userId,
        success: true,
      });
    }

    return true;
  }

  /**
   * Start an impersonation session
   */
  async startImpersonation(
    adminUserId: string,
    targetUserId: string,
    reason?: string,
    adminReq?: EchelonRequest
  ): Promise<ImpersonationSession> {
    const kv = await getKV();

    // Verify both users exist
    const adminUser = await this.getUserById(adminUserId);
    const targetUser = await this.getUserById(targetUserId);

    if (!adminUser || !targetUser) {
      throw new Error('User not found');
    }

    // Verify admin has permission
    if (!adminUser.roles.includes('admin') && !adminUser.roles.includes('superadmin')) {
      throw new Error('Insufficient permissions for impersonation');
    }

    // Create impersonation session
    const session: ImpersonationSession = {
      id: crypto.randomUUID(),
      adminUserId,
      targetUserId,
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + this.config.impersonationExpiry * 60 * 1000),
      reason,
    };

    await kv.set(KV_KEYS.IMPERSONATION(session.id), session, {
      expireIn: this.config.impersonationExpiry * 60 * 1000,
    });

    // Audit log (important for security)
    if (this.shouldAuditLog()) {
      const auditLogger = getAuditLogger();
      await auditLogger.logFromRequest(
        adminReq ?? {} as EchelonRequest,
        'custom',
        'security',
        {
          action: 'impersonation_start',
          adminUserId,
          targetUserId,
          targetUsername: targetUser.username,
          reason,
        }
      );
    }

    logger.warn('Impersonation session started', {
      sessionId: session.id,
      adminUserId,
      targetUserId,
    });

    return session;
  }

  /**
   * End an impersonation session
   */
  async endImpersonation(sessionId: string, adminReq?: EchelonRequest): Promise<void> {
    const kv = await getKV();
    const session = await kv.get<ImpersonationSession>(KV_KEYS.IMPERSONATION(sessionId));

    if (!session) {
      throw new Error('Impersonation session not found');
    }

    await kv.delete(KV_KEYS.IMPERSONATION(sessionId));

    // Audit log
    if (this.shouldAuditLog()) {
      const auditLogger = getAuditLogger();
      await auditLogger.logFromRequest(
        adminReq ?? {} as EchelonRequest,
        'custom',
        'security',
        {
          action: 'impersonation_end',
          sessionId,
          adminUserId: session.adminUserId,
          targetUserId: session.targetUserId,
        }
      );
    }

    logger.info('Impersonation session ended', { sessionId });
  }

  /**
   * Validate an impersonation session
   */
  async validateImpersonation(sessionId: string): Promise<ImpersonationSession | null> {
    const kv = await getKV();
    const session = await kv.get<ImpersonationSession>(KV_KEYS.IMPERSONATION(sessionId));

    if (!session) return null;
    if (new Date() > new Date(session.expiresAt)) {
      await kv.delete(KV_KEYS.IMPERSONATION(sessionId));
      return null;
    }

    return session;
  }

  /**
   * Record a login attempt
   */
  async recordLoginAttempt(userId: string, success: boolean, ipAddress?: string): Promise<void> {
    const kv = await getKV();
    const rawKv = kv.raw;

    const existing = await rawKv.get<User>(KV_KEYS.USER(userId));
    if (!existing.value) return;

    const user = existing.value;
    const updates: Partial<User> = {
      updatedAt: new Date(),
    };

    if (success) {
      updates.lastLoginAt = new Date();
      updates.lastLoginIP = ipAddress;
      updates.failedLoginAttempts = 0;
      updates.lockedUntil = undefined;
    } else {
      const attempts = (user.failedLoginAttempts ?? 0) + 1;
      updates.failedLoginAttempts = attempts;

      // Lock account if too many failures
      if (attempts >= this.config.maxFailedLogins) {
        updates.lockedUntil = new Date(Date.now() + this.config.lockoutDuration * 60 * 1000);
        logger.warn('User account locked', { userId, attempts });
      }
    }

    const updatedUser: User = { ...user, ...updates };
    await rawKv.atomic()
      .check(existing)
      .set(KV_KEYS.USER(userId), updatedUser)
      .commit();
  }

  /**
   * Check if a user is locked
   */
  async isUserLocked(userId: string): Promise<boolean> {
    const kv = await getKV();
    const rawKv = kv.raw;

    const result = await rawKv.get<User>(KV_KEYS.USER(userId));
    if (!result.value) return true;  // Non-existent users are effectively locked

    const user = result.value;
    if (!user.enabled) return true;
    if (user.lockedUntil && new Date() < new Date(user.lockedUntil)) return true;

    return false;
  }

  /**
   * Get user statistics
   */
  async getUserStats(): Promise<{
    totalUsers: number;
    enabledUsers: number;
    verifiedUsers: number;
    usersByRole: Record<string, number>;
    recentlyActive: number;
  }> {
    const { users } = await this.queryUsers({ limit: 10000 });

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const usersByRole: Record<string, number> = {};
    let enabledUsers = 0;
    let verifiedUsers = 0;
    let recentlyActive = 0;

    for (const user of users) {
      if (user.enabled) enabledUsers++;
      if (user.verified) verifiedUsers++;
      if (user.lastLoginAt && new Date(user.lastLoginAt) > oneWeekAgo) {
        recentlyActive++;
      }

      for (const role of user.roles) {
        usersByRole[role] = (usersByRole[role] ?? 0) + 1;
      }
    }

    return {
      totalUsers: users.length,
      enabledUsers,
      verifiedUsers,
      usersByRole,
      recentlyActive,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Remove sensitive fields from user
   */
  private sanitizeUser(user: User): User {
    const { passwordHash: _ph, ...sanitized } = user;
    return sanitized as User;
  }
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Create user management route handlers
 */
export function createUserRoutes(userManager: UserManager) {
  return {
    /**
     * List users
     */
    async list(req: EchelonRequest, res: EchelonResponse): Promise<Response> {
      const url = new URL(req.url);
      const params = url.searchParams;

      const filter: UserQueryFilter = {};
      if (params.has('username')) filter.username = params.get('username')!;
      if (params.has('email')) filter.email = params.get('email')!;
      if (params.has('role')) filter.role = params.get('role')!;
      if (params.has('enabled')) filter.enabled = params.get('enabled') === 'true';
      if (params.has('verified')) filter.verified = params.get('verified') === 'true';
      if (params.has('search')) filter.search = params.get('search')!;

      const options: UserQueryOptions = {
        filter,
        limit: parseInt(params.get('limit') ?? '50', 10),
        offset: parseInt(params.get('offset') ?? '0', 10),
        sortBy: (params.get('sortBy') as UserQueryOptions['sortBy']) ?? 'username',
        sortOrder: (params.get('sortOrder') as 'asc' | 'desc') ?? 'asc',
      };

      const result = await userManager.queryUsers(options);
      return res.json(result);
    },

    /**
     * Get a single user
     */
    async get(req: EchelonRequest, res: EchelonResponse): Promise<Response> {
      const id = req.params.id;
      if (!id) {
        return res.badRequest('Missing user ID');
      }

      const user = await userManager.getUserById(id);
      if (!user) {
        return res.notFound('User not found');
      }

      return res.json(user);
    },

    /**
     * Create a user
     */
    async create(req: EchelonRequest, res: EchelonResponse): Promise<Response> {
      try {
        const body = await req.json() as CreateUserData;
        const user = await userManager.createUser(body, req);
        res.status(201);
        return res.json(user);
      } catch (error) {
        return res.badRequest(error instanceof Error ? error.message : 'Failed to create user');
      }
    },

    /**
     * Update a user
     */
    async update(req: EchelonRequest, res: EchelonResponse): Promise<Response> {
      const id = req.params.id;
      if (!id) {
        return res.badRequest('Missing user ID');
      }

      try {
        const body = await req.json() as UpdateUserData;
        const user = await userManager.updateUser(id, body, req);
        return res.json(user);
      } catch (error) {
        return res.badRequest(error instanceof Error ? error.message : 'Failed to update user');
      }
    },

    /**
     * Delete a user
     */
    async delete(req: EchelonRequest, res: EchelonResponse): Promise<Response> {
      const id = req.params.id;
      if (!id) {
        return res.badRequest('Missing user ID');
      }

      try {
        await userManager.deleteUser(id, req);
        return res.json({ success: true });
      } catch (error) {
        return res.badRequest(error instanceof Error ? error.message : 'Failed to delete user');
      }
    },

    /**
     * Enable a user
     */
    async enable(req: EchelonRequest, res: EchelonResponse): Promise<Response> {
      const id = req.params.id;
      if (!id) {
        return res.badRequest('Missing user ID');
      }

      try {
        const user = await userManager.enableUser(id, req);
        return res.json(user);
      } catch (error) {
        return res.badRequest(error instanceof Error ? error.message : 'Failed to enable user');
      }
    },

    /**
     * Disable a user
     */
    async disable(req: EchelonRequest, res: EchelonResponse): Promise<Response> {
      const id = req.params.id;
      if (!id) {
        return res.badRequest('Missing user ID');
      }

      try {
        const user = await userManager.disableUser(id, req);
        return res.json(user);
      } catch (error) {
        return res.badRequest(error instanceof Error ? error.message : 'Failed to disable user');
      }
    },

    /**
     * Get user statistics
     */
    async stats(_req: EchelonRequest, res: EchelonResponse): Promise<Response> {
      const stats = await userManager.getUserStats();
      return res.json(stats);
    },

    /**
     * Request password reset
     */
    async requestPasswordReset(req: EchelonRequest, res: EchelonResponse): Promise<Response> {
      const body = await req.json() as { email: string };
      const token = await userManager.generatePasswordResetToken(body.email);

      // Always return success to prevent email enumeration
      return res.json({
        success: true,
        message: 'If the email exists, a reset link will be sent',
        token: token ?? undefined,  // In production, don't return this - send via email
      });
    },

    /**
     * Reset password with token
     */
    async resetPassword(req: EchelonRequest, res: EchelonResponse): Promise<Response> {
      const body = await req.json() as { token: string; password: string };

      const success = await userManager.resetPasswordWithToken(body.token, body.password);
      if (!success) {
        return res.badRequest('Invalid or expired reset token');
      }

      return res.json({ success: true });
    },

    /**
     * Start impersonation
     */
    async startImpersonation(req: EchelonRequest, res: EchelonResponse): Promise<Response> {
      const adminUserId = req.state?.get('userId') as string;
      if (!adminUserId) {
        return res.unauthorized('Authentication required');
      }

      const body = await req.json() as { targetUserId: string; reason?: string };

      try {
        const session = await userManager.startImpersonation(
          adminUserId,
          body.targetUserId,
          body.reason,
          req
        );
        return res.json(session);
      } catch (error) {
        return res.badRequest(error instanceof Error ? error.message : 'Failed to start impersonation');
      }
    },

    /**
     * End impersonation
     */
    async endImpersonation(req: EchelonRequest, res: EchelonResponse): Promise<Response> {
      const sessionId = req.params.sessionId;
      if (!sessionId) {
        return res.badRequest('Missing session ID');
      }

      try {
        await userManager.endImpersonation(sessionId, req);
        return res.json({ success: true });
      } catch (error) {
        return res.badRequest(error instanceof Error ? error.message : 'Failed to end impersonation');
      }
    },
  };
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new user manager instance
 */
export function createUserManager(config?: UserManagerConfig): UserManager {
  return new UserManager(config);
}

// ============================================================================
// Global Instance
// ============================================================================

let globalUserManager: UserManager | null = null;

/**
 * Get the global user manager instance
 */
export function getUserManager(): UserManager {
  if (!globalUserManager) {
    globalUserManager = new UserManager();
  }
  return globalUserManager;
}

/**
 * Set the global user manager instance
 */
export function setUserManager(manager: UserManager): void {
  globalUserManager = manager;
}
