/**
 * User Aggregate
 *
 * Represents a user in the Identity and Access Management context.
 * Root aggregate for user-related operations.
 *
 * @module
 */

import { AggregateRoot } from '../../../../shared/domain/aggregate_root.ts';
import { Email } from '../value_objects/email.ts';
import { UserRole } from '../value_objects/user_role.ts';
import { UserRegistered } from '../events/user_registered.ts';
import { EmailVerified } from '../events/email_verified.ts';
import { PasswordChanged } from '../events/password_changed.ts';
import { UserProfileUpdated } from '../events/user_profile_updated.ts';

/**
 * User aggregate
 */
export class User extends AggregateRoot<string> {
  private _email: Email;
  private _name: string;
  private _passwordHash: string;
  private _role: UserRole;
  private _emailVerified: boolean;
  private _emailVerifiedAt?: Date;
  private _lastLoginAt?: Date;
  private _isActive: boolean;

  private constructor(
    id: string,
    email: Email,
    name: string,
    passwordHash: string,
    role: UserRole,
    emailVerified: boolean = false,
    emailVerifiedAt?: Date,
    lastLoginAt?: Date,
    isActive: boolean = true,
    createdAt?: Date,
    updatedAt?: Date,
    version?: number
  ) {
    super(id, createdAt, updatedAt, version);
    this._email = email;
    this._name = name;
    this._passwordHash = passwordHash;
    this._role = role;
    this._emailVerified = emailVerified;
    this._emailVerifiedAt = emailVerifiedAt;
    this._lastLoginAt = lastLoginAt;
    this._isActive = isActive;
  }

  // ============================================================================
  // Factory Methods
  // ============================================================================

  /**
   * Register a new user
   */
  static register(
    id: string,
    email: string,
    name: string,
    passwordHash: string,
    role: UserRole = UserRole.member()
  ): User {
    const emailVO = Email.create(email);

    // Validate name
    if (!name || name.trim().length < 2) {
      throw new Error('Name must be at least 2 characters');
    }

    // Validate password hash
    if (!passwordHash) {
      throw new Error('Password hash is required');
    }

    const user = new User(
      id,
      emailVO,
      name.trim(),
      passwordHash,
      role,
      false,
      undefined,
      undefined,
      true
    );

    // Emit domain event
    user.addDomainEvent(
      new UserRegistered(id, emailVO.value, name.trim(), role.value, {
        userId: id,
      })
    );

    return user;
  }

  /**
   * Reconstitute user from data (for repository)
   */
  static fromData(
    id: string,
    email: string,
    name: string,
    passwordHash: string,
    role: string,
    emailVerified: boolean,
    emailVerifiedAt?: Date,
    lastLoginAt?: Date,
    isActive?: boolean,
    createdAt?: Date,
    updatedAt?: Date,
    version?: number
  ): User {
    const emailVO = Email.create(email);
    const roleVO = UserRole.create(role as 'owner' | 'admin' | 'member' | 'guest');

    return new User(
      id,
      emailVO,
      name,
      passwordHash,
      roleVO,
      emailVerified,
      emailVerifiedAt,
      lastLoginAt,
      isActive ?? true,
      createdAt,
      updatedAt,
      version
    );
  }

  // ============================================================================
  // Getters
  // ============================================================================

  get email(): Email {
    return this._email;
  }

  get name(): string {
    return this._name;
  }

  get passwordHash(): string {
    return this._passwordHash;
  }

  get role(): UserRole {
    return this._role;
  }

  get emailVerified(): boolean {
    return this._emailVerified;
  }

  get emailVerifiedAt(): Date | undefined {
    return this._emailVerifiedAt;
  }

  get lastLoginAt(): Date | undefined {
    return this._lastLoginAt;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  // ============================================================================
  // Business Logic
  // ============================================================================

  /**
   * Verify email address
   */
  verifyEmail(): void {
    if (this._emailVerified) {
      throw new Error('Email already verified');
    }

    this._emailVerified = true;
    this._emailVerifiedAt = new Date();
    this.update();

    this.addDomainEvent(
      new EmailVerified(this.id, this._email.value, this._emailVerifiedAt, {
        userId: this.id,
      })
    );
  }

  /**
   * Change password
   */
  changePassword(newPasswordHash: string, changedBy: string): void {
    if (!newPasswordHash) {
      throw new Error('Password hash is required');
    }

    this._passwordHash = newPasswordHash;
    this.update();

    this.addDomainEvent(
      new PasswordChanged(this.id, new Date(), changedBy, {
        userId: this.id,
      })
    );
  }

  /**
   * Update profile
   */
  updateProfile(name?: string): void {
    const updatedFields: string[] = [];

    if (name !== undefined && name !== this._name) {
      if (!name || name.trim().length < 2) {
        throw new Error('Name must be at least 2 characters');
      }
      this._name = name.trim();
      updatedFields.push('name');
    }

    if (updatedFields.length > 0) {
      this.update();
      this.addDomainEvent(
        new UserProfileUpdated(this.id, updatedFields, {
          userId: this.id,
        })
      );
    }
  }

  /**
   * Update role (admin operation)
   */
  updateRole(newRole: UserRole): void {
    if (this._role.equals(newRole)) {
      return;
    }

    this._role = newRole;
    this.update();

    this.addDomainEvent(
      new UserProfileUpdated(this.id, ['role'], {
        userId: this.id,
      })
    );
  }

  /**
   * Record login
   */
  recordLogin(): void {
    this._lastLoginAt = new Date();
    this.update();
  }

  /**
   * Deactivate user
   */
  deactivate(): void {
    if (!this._isActive) {
      throw new Error('User already inactive');
    }

    this._isActive = false;
    this.update();
  }

  /**
   * Reactivate user
   */
  reactivate(): void {
    if (this._isActive) {
      throw new Error('User already active');
    }

    this._isActive = true;
    this.update();
  }

  // ============================================================================
  // Authorization
  // ============================================================================

  /**
   * Check if user can perform admin actions
   */
  canPerformAdminActions(): boolean {
    return this._isActive && this._role.isAdminOrHigher();
  }

  /**
   * Check if user has higher privileges than another user
   */
  hasHigherPrivilegesThan(other: User): boolean {
    return this._role.hasHigherPrivilegesThan(other._role);
  }

  /**
   * Check if user is owner
   */
  isOwner(): boolean {
    return this._role.isOwner();
  }

  // ============================================================================
  // Serialization
  // ============================================================================

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      email: this._email.value,
      name: this._name,
      role: this._role.value,
      emailVerified: this._emailVerified,
      emailVerifiedAt: this._emailVerifiedAt?.toISOString(),
      lastLoginAt: this._lastLoginAt?.toISOString(),
      isActive: this._isActive,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      version: this.version,
    };
  }
}
