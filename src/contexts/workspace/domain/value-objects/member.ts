/**
 * Member Value Object
 *
 * Represents a workspace member with their role and permissions.
 */

export type MemberRole = 'owner' | 'admin' | 'member' | 'guest';

export interface MemberData {
  userId: string;
  email: string;
  name: string;
  role: MemberRole;
  joinedAt: Date;
}

/**
 * Member value object
 */
export class Member {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly role: MemberRole;
  readonly joinedAt: Date;

  private constructor(data: MemberData) {
    this.userId = data.userId;
    this.email = data.email;
    this.name = data.name;
    this.role = data.role;
    this.joinedAt = data.joinedAt;
  }

  /**
   * Create a new member
   */
  static create(data: MemberData): Member {
    if (!data.userId) {
      throw new Error('User ID is required');
    }
    if (!data.email) {
      throw new Error('Email is required');
    }
    if (!data.name) {
      throw new Error('Name is required');
    }

    return new Member(data);
  }

  /**
   * Create member from persistence data
   */
  static fromData(data: MemberData): Member {
    return new Member({
      ...data,
      joinedAt: data.joinedAt instanceof Date ? data.joinedAt : new Date(data.joinedAt),
    });
  }

  /**
   * Convert to plain object for persistence
   */
  toData(): MemberData {
    return {
      userId: this.userId,
      email: this.email,
      name: this.name,
      role: this.role,
      joinedAt: this.joinedAt,
    };
  }

  /**
   * Check if member has a specific role
   */
  hasRole(role: MemberRole): boolean {
    return this.role === role;
  }

  /**
   * Check if member is owner or admin
   */
  isOwnerOrAdmin(): boolean {
    return this.role === 'owner' || this.role === 'admin';
  }

  /**
   * Check if member can manage other members
   */
  canManageMembers(): boolean {
    return this.isOwnerOrAdmin();
  }

  /**
   * Check if member can delete workspace
   */
  canDeleteWorkspace(): boolean {
    return this.role === 'owner';
  }

  /**
   * Change role (returns new instance)
   */
  withRole(newRole: MemberRole): Member {
    return new Member({
      userId: this.userId,
      email: this.email,
      name: this.name,
      role: newRole,
      joinedAt: this.joinedAt,
    });
  }
}
