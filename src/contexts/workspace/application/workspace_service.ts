/**
 * Workspace Application Service
 *
 * Orchestrates workspace use cases and coordinates domain logic.
 */

import { Workspace } from '../domain/aggregates/workspace.ts';
import { getWorkspaceRepository, type WorkspaceRepository } from '../infrastructure/workspace_repository.ts';
import type { MemberRole } from '../domain/value-objects/member.ts';
import type { AuthUser } from '@echelon/auth/auth.ts';

export interface CreateWorkspaceCommand {
  name: string;
  description?: string;
  owner: AuthUser;
}

export interface AddMemberCommand {
  workspaceId: string;
  userId: string;
  email: string;
  name: string;
  role: MemberRole;
  addedBy: string;
}

export interface RemoveMemberCommand {
  workspaceId: string;
  userId: string;
  removedBy: string;
}

export interface ChangeMemberRoleCommand {
  workspaceId: string;
  userId: string;
  newRole: MemberRole;
  changedBy: string;
}

export interface RenameWorkspaceCommand {
  workspaceId: string;
  newName: string;
  renamedBy: string;
}

export interface UpdateWorkspaceCommand {
  workspaceId: string;
  description?: string;
  updatedBy: string;
}

export interface ArchiveWorkspaceCommand {
  workspaceId: string;
  archivedBy: string;
}

export interface WorkspaceResult {
  success: boolean;
  workspace?: Workspace;
  error?: string;
}

export interface WorkspaceListResult {
  success: boolean;
  workspaces?: Workspace[];
  error?: string;
}

/**
 * Workspace application service
 */
export class WorkspaceService {
  constructor(private repository: WorkspaceRepository) {}

  /**
   * Create a new workspace
   */
  async createWorkspace(command: CreateWorkspaceCommand): Promise<WorkspaceResult> {
    try {
      // Business rule: Workspace name must be unique for the user
      const exists = await this.repository.existsByNameAndUserId(
        command.name,
        command.owner.id
      );

      if (exists) {
        return {
          success: false,
          error: 'A workspace with this name already exists',
        };
      }

      // Create workspace aggregate
      const workspace = Workspace.create({
        id: crypto.randomUUID(),
        name: command.name,
        description: command.description,
        owner: {
          id: command.owner.id,
          email: command.owner.email!,
          name: command.owner.username || command.owner.email || 'Unknown',
        },
      });

      // Persist workspace
      await this.repository.save(workspace);

      // TODO: Publish domain events to event bus
      // For now, just clear them
      workspace.clearDomainEvents();

      return {
        success: true,
        workspace,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get workspace by ID
   */
  async getWorkspace(workspaceId: string, userId: string): Promise<WorkspaceResult> {
    try {
      const workspace = await this.repository.findById(workspaceId);

      if (!workspace) {
        return {
          success: false,
          error: 'Workspace not found',
        };
      }

      // Check if user is a member
      if (!workspace.hasMember(userId)) {
        return {
          success: false,
          error: 'Access denied',
        };
      }

      return {
        success: true,
        workspace,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * List workspaces for a user
   */
  async listWorkspaces(userId: string): Promise<WorkspaceListResult> {
    try {
      const workspaces = await this.repository.findByUserId(userId);

      return {
        success: true,
        workspaces,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Add a member to workspace
   */
  async addMember(command: AddMemberCommand): Promise<WorkspaceResult> {
    try {
      const workspace = await this.repository.findById(command.workspaceId);

      if (!workspace) {
        return {
          success: false,
          error: 'Workspace not found',
        };
      }

      // Domain logic handles authorization
      workspace.addMember(command);

      await this.repository.save(workspace);

      // TODO: Publish domain events
      workspace.clearDomainEvents();

      return {
        success: true,
        workspace,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Remove a member from workspace
   */
  async removeMember(command: RemoveMemberCommand): Promise<WorkspaceResult> {
    try {
      const workspace = await this.repository.findById(command.workspaceId);

      if (!workspace) {
        return {
          success: false,
          error: 'Workspace not found',
        };
      }

      workspace.removeMember(command.userId, command.removedBy);

      await this.repository.save(workspace);

      // TODO: Publish domain events
      workspace.clearDomainEvents();

      return {
        success: true,
        workspace,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Change member role
   */
  async changeMemberRole(command: ChangeMemberRoleCommand): Promise<WorkspaceResult> {
    try {
      const workspace = await this.repository.findById(command.workspaceId);

      if (!workspace) {
        return {
          success: false,
          error: 'Workspace not found',
        };
      }

      workspace.changeMemberRole(command.userId, command.newRole, command.changedBy);

      await this.repository.save(workspace);

      // TODO: Publish domain events
      workspace.clearDomainEvents();

      return {
        success: true,
        workspace,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Rename workspace
   */
  async renameWorkspace(command: RenameWorkspaceCommand): Promise<WorkspaceResult> {
    try {
      const workspace = await this.repository.findById(command.workspaceId);

      if (!workspace) {
        return {
          success: false,
          error: 'Workspace not found',
        };
      }

      workspace.rename(command.newName, command.renamedBy);

      await this.repository.save(workspace);

      // TODO: Publish domain events
      workspace.clearDomainEvents();

      return {
        success: true,
        workspace,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update workspace details
   */
  async updateWorkspace(command: UpdateWorkspaceCommand): Promise<WorkspaceResult> {
    try {
      const workspace = await this.repository.findById(command.workspaceId);

      if (!workspace) {
        return {
          success: false,
          error: 'Workspace not found',
        };
      }

      workspace.updateDescription(command.description, command.updatedBy);

      await this.repository.save(workspace);

      return {
        success: true,
        workspace,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Archive workspace
   */
  async archiveWorkspace(command: ArchiveWorkspaceCommand): Promise<WorkspaceResult> {
    try {
      const workspace = await this.repository.findById(command.workspaceId);

      if (!workspace) {
        return {
          success: false,
          error: 'Workspace not found',
        };
      }

      workspace.archive(command.archivedBy);

      await this.repository.save(workspace);

      // TODO: Publish domain events
      workspace.clearDomainEvents();

      return {
        success: true,
        workspace,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get workspace count for user
   */
  async getWorkspaceCount(userId: string): Promise<number> {
    return await this.repository.countByUserId(userId);
  }
}

// Singleton instance
let service: WorkspaceService | null = null;

/**
 * Get the workspace service instance
 */
export async function getWorkspaceService(): Promise<WorkspaceService> {
  if (!service) {
    const repository = await getWorkspaceRepository();
    service = new WorkspaceService(repository);
  }
  return service;
}
