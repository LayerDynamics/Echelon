/**
 * Role-Based Access Control (RBAC)
 *
 * Manages roles and permissions for authorization.
 */

export interface Permission {
  name: string;
  description?: string;
  resource?: string;
  action?: string;
}

export interface Role {
  name: string;
  description?: string;
  permissions: string[];
  inherits?: string[];
}

export interface RBACOptions {
  roles?: Role[];
  permissions?: Permission[];
}

/**
 * RBAC Manager
 */
export class RBAC {
  private roles = new Map<string, Role>();
  private permissions = new Map<string, Permission>();

  constructor(options: RBACOptions = {}) {
    // Register permissions
    for (const perm of options.permissions ?? []) {
      this.addPermission(perm);
    }

    // Register roles
    for (const role of options.roles ?? []) {
      this.addRole(role);
    }
  }

  /**
   * Add a permission
   */
  addPermission(permission: Permission): this {
    this.permissions.set(permission.name, permission);
    return this;
  }

  /**
   * Add a role
   */
  addRole(role: Role): this {
    this.roles.set(role.name, role);
    return this;
  }

  /**
   * Get a role by name
   */
  getRole(name: string): Role | undefined {
    return this.roles.get(name);
  }

  /**
   * Get a permission by name
   */
  getPermission(name: string): Permission | undefined {
    return this.permissions.get(name);
  }

  /**
   * Get all permissions for a role (including inherited)
   */
  getRolePermissions(roleName: string, visited = new Set<string>()): Set<string> {
    const permissions = new Set<string>();
    const role = this.roles.get(roleName);

    if (!role || visited.has(roleName)) {
      return permissions;
    }

    visited.add(roleName);

    // Add direct permissions
    for (const perm of role.permissions) {
      permissions.add(perm);
    }

    // Add inherited permissions
    for (const inheritedRole of role.inherits ?? []) {
      const inheritedPerms = this.getRolePermissions(inheritedRole, visited);
      for (const perm of inheritedPerms) {
        permissions.add(perm);
      }
    }

    return permissions;
  }

  /**
   * Check if a role has a permission
   */
  roleHasPermission(roleName: string, permissionName: string): boolean {
    const permissions = this.getRolePermissions(roleName);
    return permissions.has(permissionName) || permissions.has('*');
  }

  /**
   * Check if any of the roles has a permission
   */
  rolesHavePermission(roleNames: string[], permissionName: string): boolean {
    return roleNames.some((role) => this.roleHasPermission(role, permissionName));
  }

  /**
   * Get all permissions for a set of roles
   */
  getPermissionsForRoles(roleNames: string[]): string[] {
    const permissions = new Set<string>();

    for (const roleName of roleNames) {
      const rolePerms = this.getRolePermissions(roleName);
      for (const perm of rolePerms) {
        permissions.add(perm);
      }
    }

    return Array.from(permissions);
  }

  /**
   * Create a permission string for resource:action
   */
  static permission(resource: string, action: string): string {
    return `${resource}:${action}`;
  }

  /**
   * Parse a permission string
   */
  static parsePermission(permission: string): { resource: string; action: string } {
    const [resource, action] = permission.split(':');
    return { resource: resource ?? permission, action: action ?? '*' };
  }
}

/**
 * Default RBAC configuration
 */
export const defaultRBAC = new RBAC({
  permissions: [
    { name: 'admin:*', description: 'Full admin access' },
    { name: 'users:read', description: 'Read users' },
    { name: 'users:write', description: 'Create/update users' },
    { name: 'users:delete', description: 'Delete users' },
    { name: 'content:read', description: 'Read content' },
    { name: 'content:write', description: 'Create/update content' },
    { name: 'content:delete', description: 'Delete content' },
    { name: 'content:publish', description: 'Publish content' },
  ],
  roles: [
    {
      name: 'admin',
      description: 'Administrator',
      permissions: ['admin:*'],
    },
    {
      name: 'editor',
      description: 'Content editor',
      permissions: ['content:read', 'content:write', 'content:publish'],
    },
    {
      name: 'author',
      description: 'Content author',
      permissions: ['content:read', 'content:write'],
    },
    {
      name: 'viewer',
      description: 'Read-only user',
      permissions: ['content:read', 'users:read'],
    },
  ],
});
