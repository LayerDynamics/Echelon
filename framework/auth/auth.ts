/**
 * Authentication Manager
 *
 * Handles user authentication with multiple backends.
 */

import type { EchelonRequest } from '../http/request.ts';
import { Session, type SessionData } from './session.ts';
import { verifyPassword } from './password.ts';

export interface AuthUser {
  id: string;
  email?: string;
  username?: string;
  roles: string[];
  permissions: string[];
  metadata?: Record<string, unknown>;
}

export interface AuthOptions {
  sessionKey?: string;
  userLoader?: (id: string) => Promise<AuthUser | null>;
  passwordVerifier?: (password: string, hash: string) => Promise<boolean>;
}

/**
 * Authentication manager
 */
export class Auth {
  private session: Session;
  private options: AuthOptions;
  private currentUser: AuthUser | null = null;

  constructor(session: Session, options: AuthOptions = {}) {
    this.session = session;
    this.options = {
      sessionKey: options.sessionKey ?? 'auth_user_id',
      userLoader: options.userLoader,
      passwordVerifier: options.passwordVerifier ?? verifyPassword,
    };
  }

  /**
   * Get the current authenticated user
   */
  get user(): AuthUser | null {
    return this.currentUser;
  }

  /**
   * Check if user is authenticated
   */
  get isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  /**
   * Load user from session
   */
  async loadFromSession(): Promise<AuthUser | null> {
    const userId = this.session.get<string>(this.options.sessionKey!);

    if (!userId) {
      return null;
    }

    if (this.options.userLoader) {
      this.currentUser = await this.options.userLoader(userId);
    }

    return this.currentUser;
  }

  /**
   * Authenticate with credentials
   */
  async authenticate(
    credentials: { email?: string; username?: string; password: string },
    findUser: (identifier: string) => Promise<{ id: string; passwordHash: string } | null>
  ): Promise<AuthUser | null> {
    const identifier = credentials.email ?? credentials.username;
    if (!identifier) {
      throw new Error('Email or username is required');
    }

    const user = await findUser(identifier);
    if (!user) {
      return null;
    }

    const isValid = await this.options.passwordVerifier!(
      credentials.password,
      user.passwordHash
    );

    if (!isValid) {
      return null;
    }

    // Load full user and store in session
    if (this.options.userLoader) {
      this.currentUser = await this.options.userLoader(user.id);
    }

    if (this.currentUser) {
      this.session.set(this.options.sessionKey!, user.id);
      await this.session.save();
    }

    return this.currentUser;
  }

  /**
   * Login a user directly (after authentication)
   */
  async login(user: AuthUser): Promise<void> {
    this.currentUser = user;
    this.session.set(this.options.sessionKey!, user.id);
    await this.session.save();
  }

  /**
   * Logout the current user
   */
  async logout(): Promise<void> {
    this.currentUser = null;
    this.session.delete(this.options.sessionKey!);
    await this.session.save();
  }

  /**
   * Check if user has a specific role
   */
  hasRole(role: string): boolean {
    return this.currentUser?.roles.includes(role) ?? false;
  }

  /**
   * Check if user has any of the specified roles
   */
  hasAnyRole(roles: string[]): boolean {
    return roles.some((role) => this.hasRole(role));
  }

  /**
   * Check if user has all specified roles
   */
  hasAllRoles(roles: string[]): boolean {
    return roles.every((role) => this.hasRole(role));
  }

  /**
   * Check if user has a specific permission
   */
  hasPermission(permission: string): boolean {
    return this.currentUser?.permissions.includes(permission) ?? false;
  }

  /**
   * Check if user has any of the specified permissions
   */
  hasAnyPermission(permissions: string[]): boolean {
    return permissions.some((perm) => this.hasPermission(perm));
  }

  /**
   * Check if user has all specified permissions
   */
  hasAllPermissions(permissions: string[]): boolean {
    return permissions.every((perm) => this.hasPermission(perm));
  }
}

/**
 * Create authentication middleware
 */
export function authMiddleware(options?: AuthOptions) {
  return async (
    req: EchelonRequest,
    _res: unknown,
    next: () => Promise<Response | void>
  ) => {
    // Get or create session from request state
    const session = req.state.get('session') as Session | undefined;

    if (session) {
      const auth = new Auth(session, options);
      await auth.loadFromSession();
      req.state.set('auth', auth);
      req.state.set('user', auth.user);
    }

    return await next();
  };
}

/**
 * Create a guard that requires authentication
 */
export function requireAuth() {
  return async (
    req: EchelonRequest,
    res: { unauthorized: (msg?: string) => Response },
    next: () => Promise<Response | void>
  ) => {
    const auth = req.state.get('auth') as Auth | undefined;

    if (!auth?.isAuthenticated) {
      return res.unauthorized('Authentication required');
    }

    return await next();
  };
}

/**
 * Create a guard that requires specific roles
 */
export function requireRole(...roles: string[]) {
  return async (
    req: EchelonRequest,
    res: { forbidden: (msg?: string) => Response },
    next: () => Promise<Response | void>
  ) => {
    const auth = req.state.get('auth') as Auth | undefined;

    if (!auth?.hasAnyRole(roles)) {
      return res.forbidden('Insufficient permissions');
    }

    return await next();
  };
}

/**
 * Create a guard that requires specific permissions
 */
export function requirePermission(...permissions: string[]) {
  return async (
    req: EchelonRequest,
    res: { forbidden: (msg?: string) => Response },
    next: () => Promise<Response | void>
  ) => {
    const auth = req.state.get('auth') as Auth | undefined;

    if (!auth?.hasAnyPermission(permissions)) {
      return res.forbidden('Insufficient permissions');
    }

    return await next();
  };
}
