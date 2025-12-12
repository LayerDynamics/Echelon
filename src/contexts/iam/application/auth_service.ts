/**
 * Authentication Service
 *
 * Application service for user authentication operations.
 * Integrates with framework Auth layer and User aggregate.
 *
 * @module
 */

import { hashPassword, verifyPassword, generateToken } from '@echelon/auth/password.ts';
import type { AuthUser } from '@echelon/auth/auth.ts';
import { User } from '../domain/aggregates/user.ts';
import { UserRole } from '../domain/value_objects/user_role.ts';
import { Email } from '../domain/value_objects/email.ts';
import { getUserRepository, type UserRepository } from '../infrastructure/user_repository.ts';

/**
 * Registration result
 */
export interface RegistrationResult {
  success: boolean;
  userId?: string;
  verificationToken?: string;
  error?: string;
}

/**
 * Login result
 */
export interface LoginResult {
  success: boolean;
  user?: AuthUser;
  error?: string;
}

/**
 * Email verification result
 */
export interface VerificationResult {
  success: boolean;
  error?: string;
}

/**
 * Authentication service
 */
export class AuthService {
  private userRepository: UserRepository;
  private verificationTokens = new Map<string, { userId: string; expiresAt: Date }>();

  private constructor(userRepository: UserRepository) {
    this.userRepository = userRepository;
  }

  /**
   * Create authentication service instance
   */
  static async create(): Promise<AuthService> {
    const userRepository = await getUserRepository();
    return new AuthService(userRepository);
  }

  // ============================================================================
  // User Registration
  // ============================================================================

  /**
   * Register a new user
   */
  async register(
    email: string,
    name: string,
    password: string,
    role: 'owner' | 'admin' | 'member' | 'guest' = 'member'
  ): Promise<RegistrationResult> {
    try {
      // Validate email format
      if (!Email.isValid(email)) {
        return { success: false, error: 'Invalid email address' };
      }

      // Check if user already exists
      const existingUser = await this.userRepository.findByEmail(email);
      if (existingUser) {
        return { success: false, error: 'Email already registered' };
      }

      // Validate password
      if (!password || password.length < 8) {
        return { success: false, error: 'Password must be at least 8 characters' };
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Create user aggregate
      const userId = crypto.randomUUID();
      const userRole = UserRole.create(role);
      const user = User.register(userId, email, name, passwordHash, userRole);

      // Save user
      await this.userRepository.save(user);

      // Generate verification token
      const verificationToken = generateToken(32);
      this.verificationTokens.set(verificationToken, {
        userId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      });

      console.log('[AuthService] User registered', {
        userId,
        email,
        role,
      });

      return {
        success: true,
        userId,
        verificationToken,
      };
    } catch (error) {
      console.error('[AuthService] Registration failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed',
      };
    }
  }

  // ============================================================================
  // User Login
  // ============================================================================

  /**
   * Login with email and password
   */
  async login(email: string, password: string): Promise<LoginResult> {
    try {
      // Find user by email
      const user = await this.userRepository.findByEmail(email);
      if (!user) {
        return { success: false, error: 'Invalid credentials' };
      }

      // Check if user is active
      if (!user.isActive) {
        return { success: false, error: 'Account is inactive' };
      }

      // Verify password
      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        return { success: false, error: 'Invalid credentials' };
      }

      // Record login
      user.recordLogin();
      await this.userRepository.save(user);

      // Convert to AuthUser for framework
      const authUser = this.toAuthUser(user);

      console.log('[AuthService] User logged in', {
        userId: user.id,
        email: user.email.value,
      });

      return {
        success: true,
        user: authUser,
      };
    } catch (error) {
      console.error('[AuthService] Login failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: 'Login failed',
      };
    }
  }

  /**
   * Find user for authentication (framework callback)
   */
  async findUserForAuth(
    email: string
  ): Promise<{ id: string; passwordHash: string } | null> {
    const user = await this.userRepository.findByEmail(email);
    if (!user || !user.isActive) {
      return null;
    }

    return {
      id: user.id,
      passwordHash: user.passwordHash,
    };
  }

  /**
   * Load user for session (framework callback)
   */
  async loadUser(userId: string): Promise<AuthUser | null> {
    const user = await this.userRepository.findById(userId);
    if (!user || !user.isActive) {
      return null;
    }

    return this.toAuthUser(user);
  }

  // ============================================================================
  // Email Verification
  // ============================================================================

  /**
   * Verify email with token
   */
  async verifyEmail(token: string): Promise<VerificationResult> {
    try {
      const tokenData = this.verificationTokens.get(token);
      if (!tokenData) {
        return { success: false, error: 'Invalid verification token' };
      }

      // Check if token expired
      if (tokenData.expiresAt < new Date()) {
        this.verificationTokens.delete(token);
        return { success: false, error: 'Verification token expired' };
      }

      // Load user
      const user = await this.userRepository.findById(tokenData.userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Verify email
      user.verifyEmail();
      await this.userRepository.save(user);

      // Remove token
      this.verificationTokens.delete(token);

      console.log('[AuthService] Email verified', {
        userId: user.id,
        email: user.email.value,
      });

      return { success: true };
    } catch (error) {
      console.error('[AuthService] Email verification failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: 'Verification failed',
      };
    }
  }

  /**
   * Resend verification email
   */
  async resendVerificationEmail(userId: string): Promise<string | null> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      return null;
    }

    if (user.emailVerified) {
      return null;
    }

    // Generate new token
    const verificationToken = generateToken(32);
    this.verificationTokens.set(verificationToken, {
      userId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    });

    return verificationToken;
  }

  // ============================================================================
  // Password Management
  // ============================================================================

  /**
   * Change user password
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<VerificationResult> {
    try {
      // Load user
      const user = await this.userRepository.findById(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Verify current password
      const isValid = await verifyPassword(currentPassword, user.passwordHash);
      if (!isValid) {
        return { success: false, error: 'Current password is incorrect' };
      }

      // Validate new password
      if (!newPassword || newPassword.length < 8) {
        return { success: false, error: 'New password must be at least 8 characters' };
      }

      // Hash new password
      const newPasswordHash = await hashPassword(newPassword);

      // Change password
      user.changePassword(newPasswordHash, userId);
      await this.userRepository.save(user);

      console.log('[AuthService] Password changed', { userId });

      return { success: true };
    } catch (error) {
      console.error('[AuthService] Password change failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: 'Password change failed',
      };
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Convert User aggregate to framework AuthUser
   */
  private toAuthUser(user: User): AuthUser {
    return {
      id: user.id,
      email: user.email.value,
      roles: [user.role.value],
      permissions: this.getRolePermissions(user.role.value),
      metadata: {
        name: user.name,
        emailVerified: user.emailVerified,
        lastLoginAt: user.lastLoginAt?.toISOString(),
      },
    };
  }

  /**
   * Get permissions for a role
   */
  private getRolePermissions(role: string): string[] {
    const permissions: Record<string, string[]> = {
      owner: ['*'], // All permissions
      admin: [
        'users:read',
        'users:write',
        'users:delete',
        'workspaces:read',
        'workspaces:write',
        'projects:read',
        'projects:write',
        'projects:delete',
      ],
      member: [
        'workspaces:read',
        'projects:read',
        'projects:write',
        'tasks:read',
        'tasks:write',
      ],
      guest: ['workspaces:read', 'projects:read', 'tasks:read'],
    };

    return permissions[role] ?? [];
  }

  /**
   * Clean up expired verification tokens
   */
  cleanupExpiredTokens(): void {
    const now = new Date();
    for (const [token, data] of this.verificationTokens.entries()) {
      if (data.expiresAt < now) {
        this.verificationTokens.delete(token);
      }
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _defaultAuthService: AuthService | null = null;

/**
 * Get the default auth service instance (singleton)
 */
export async function getAuthService(): Promise<AuthService> {
  if (!_defaultAuthService) {
    _defaultAuthService = await AuthService.create();
  }
  return _defaultAuthService;
}
