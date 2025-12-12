/**
 * User Repository
 *
 * Repository for User aggregates using Deno KV.
 *
 * @module
 */

import { KVRepository } from '../../../shared/infrastructure/kv_repository.ts';
import { User } from '../domain/aggregates/user.ts';
import { UserRole } from '../domain/value_objects/user_role.ts';

/**
 * User repository implementation
 */
export class UserRepository extends KVRepository<User> {
  constructor() {
    super('users', 'User', false); // Event sourcing disabled for users
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    await this.ensureInit();

    // List all users and filter by email
    // Note: In production, we'd use a secondary index
    const entries = await this.kv.list<Record<string, unknown>>([this.prefix]);

    for (const { value } of entries) {
      if (value.email === email.toLowerCase()) {
        return this.fromData(value);
      }
    }

    return null;
  }

  /**
   * Find users by role
   */
  async findByRole(role: string): Promise<User[]> {
    await this.ensureInit();

    const entries = await this.kv.list<Record<string, unknown>>([this.prefix]);
    const users: User[] = [];

    for (const { value } of entries) {
      if (value.role === role) {
        const user = this.fromData(value);
        if (user) {
          users.push(user);
        }
      }
    }

    return users;
  }

  /**
   * Find active users
   */
  async findActiveUsers(): Promise<User[]> {
    await this.ensureInit();

    const entries = await this.kv.list<Record<string, unknown>>([this.prefix]);
    const users: User[] = [];

    for (const { value } of entries) {
      if (value.isActive === true) {
        const user = this.fromData(value);
        if (user) {
          users.push(user);
        }
      }
    }

    return users;
  }

  /**
   * Find users with unverified emails
   */
  async findUnverifiedUsers(): Promise<User[]> {
    await this.ensureInit();

    const entries = await this.kv.list<Record<string, unknown>>([this.prefix]);
    const users: User[] = [];

    for (const { value } of entries) {
      if (value.emailVerified === false) {
        const user = this.fromData(value);
        if (user) {
          users.push(user);
        }
      }
    }

    return users;
  }

  /**
   * Convert user to data for storage
   */
  protected toData(user: User): Record<string, unknown> {
    return {
      id: user.id,
      email: user.email.value,
      name: user.name,
      passwordHash: user.passwordHash,
      role: user.role.value,
      emailVerified: user.emailVerified,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString(),
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      version: user.version,
    };
  }

  /**
   * Convert data to user
   */
  protected fromData(data: Record<string, unknown>): User | null {
    try {
      return User.fromData(
        data.id as string,
        data.email as string,
        data.name as string,
        data.passwordHash as string,
        data.role as string,
        data.emailVerified as boolean,
        data.emailVerifiedAt ? new Date(data.emailVerifiedAt as string) : undefined,
        data.lastLoginAt ? new Date(data.lastLoginAt as string) : undefined,
        data.isActive as boolean,
        data.createdAt ? new Date(data.createdAt as string) : undefined,
        data.updatedAt ? new Date(data.updatedAt as string) : undefined,
        data.version as number
      );
    } catch (error) {
      console.error('[UserRepository] Failed to reconstitute user from data', {
        error: error instanceof Error ? error.message : String(error),
        data,
      });
      return null;
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _defaultUserRepository: UserRepository | null = null;

/**
 * Get the default user repository instance (singleton)
 */
export async function getUserRepository(): Promise<UserRepository> {
  if (!_defaultUserRepository) {
    _defaultUserRepository = new UserRepository();
    await _defaultUserRepository.init();
  }
  return _defaultUserRepository;
}

/**
 * Create a new user repository instance
 */
export async function createUserRepository(): Promise<UserRepository> {
  const repo = new UserRepository();
  await repo.init();
  return repo;
}
