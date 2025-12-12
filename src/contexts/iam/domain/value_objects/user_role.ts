/**
 * User Role Value Object
 *
 * Represents a user's role in the system.
 *
 * @module
 */

import { ValueObject } from '../../../../shared/domain/value_object.ts';

/**
 * Valid user roles
 */
export type UserRoleType = 'owner' | 'admin' | 'member' | 'guest';

interface UserRoleProps {
  role: UserRoleType;
}

/**
 * User role value object
 */
export class UserRole extends ValueObject<UserRoleProps> {
  private static readonly ROLE_HIERARCHY: Record<UserRoleType, number> = {
    owner: 4,
    admin: 3,
    member: 2,
    guest: 1,
  };

  private constructor(props: UserRoleProps) {
    super(props);
  }

  /**
   * Create a user role
   */
  static create(role: UserRoleType): UserRole {
    return new UserRole({ role });
  }

  /**
   * Create owner role
   */
  static owner(): UserRole {
    return new UserRole({ role: 'owner' });
  }

  /**
   * Create admin role
   */
  static admin(): UserRole {
    return new UserRole({ role: 'admin' });
  }

  /**
   * Create member role
   */
  static member(): UserRole {
    return new UserRole({ role: 'member' });
  }

  /**
   * Create guest role
   */
  static guest(): UserRole {
    return new UserRole({ role: 'guest' });
  }

  /**
   * Get role value
   */
  get value(): UserRoleType {
    return this.props.role;
  }

  /**
   * Check if this role has higher privileges than another
   */
  hasHigherPrivilegesThan(other: UserRole): boolean {
    return UserRole.ROLE_HIERARCHY[this.value] > UserRole.ROLE_HIERARCHY[other.value];
  }

  /**
   * Check if this role has same or higher privileges
   */
  hasSameOrHigherPrivilegesThan(other: UserRole): boolean {
    return UserRole.ROLE_HIERARCHY[this.value] >= UserRole.ROLE_HIERARCHY[other.value];
  }

  /**
   * Check if user is owner
   */
  isOwner(): boolean {
    return this.value === 'owner';
  }

  /**
   * Check if user is admin or higher
   */
  isAdminOrHigher(): boolean {
    return this.value === 'owner' || this.value === 'admin';
  }

  /**
   * Check if user is member or higher
   */
  isMemberOrHigher(): boolean {
    return this.value !== 'guest';
  }

  override toString(): string {
    return this.value;
  }
}
