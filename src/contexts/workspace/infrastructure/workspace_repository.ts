/**
 * Workspace Repository
 *
 * Infrastructure layer for persisting and retrieving workspace aggregates.
 * Uses Deno KV for storage.
 */

import { getKV } from '@echelon/orm/kv.ts';
import { Workspace, type WorkspaceData } from '../domain/aggregates/workspace.ts';

/**
 * Repository for workspace aggregates
 */
export class WorkspaceRepository {
  private kv: Deno.Kv | null = null;

  async getKv(): Promise<Deno.Kv> {
    if (!this.kv) {
      this.kv = await getKV();
    }
    return this.kv;
  }

  /**
   * Save a workspace
   */
  async save(workspace: Workspace): Promise<void> {
    const kv = await this.getKv();
    const data = workspace.toData();

    // Store workspace by ID
    await kv.set(['workspaces', workspace.getId()], data);

    // Store workspace in owner's list
    await kv.set(
      ['users', workspace.getOwnerId(), 'workspaces', workspace.getId()],
      workspace.getId()
    );

    // Store workspace in each member's list
    for (const member of workspace.getMembers()) {
      await kv.set(
        ['users', member.userId, 'workspaces', workspace.getId()],
        workspace.getId()
      );
    }
  }

  /**
   * Find workspace by ID
   */
  async findById(id: string): Promise<Workspace | null> {
    const kv = await this.getKv();
    const result = await kv.get<WorkspaceData>(['workspaces', id]);

    if (!result.value) {
      return null;
    }

    return Workspace.fromData(result.value);
  }

  /**
   * Find all workspaces for a user
   */
  async findByUserId(userId: string): Promise<Workspace[]> {
    const kv = await this.getKv();

    // Get all workspace IDs for this user
    const entries = kv.list<string>({ prefix: ['users', userId, 'workspaces'] });
    const workspaceIds: string[] = [];

    for await (const entry of entries) {
      workspaceIds.push(entry.value);
    }

    // Fetch all workspaces
    const workspaces: Workspace[] = [];
    for (const id of workspaceIds) {
      const workspace = await this.findById(id);
      if (workspace) {
        workspaces.push(workspace);
      }
    }

    return workspaces;
  }

  /**
   * Find all workspaces owned by a user
   */
  async findByOwnerId(ownerId: string): Promise<Workspace[]> {
    const kv = await this.getKv();

    // List all workspaces
    const entries = kv.list<WorkspaceData>({ prefix: ['workspaces'] });
    const workspaces: Workspace[] = [];

    for await (const entry of entries) {
      if (entry.value.ownerId === ownerId) {
        workspaces.push(Workspace.fromData(entry.value));
      }
    }

    return workspaces;
  }

  /**
   * Check if workspace name exists for a user
   */
  async existsByNameAndUserId(name: string, userId: string): Promise<boolean> {
    const userWorkspaces = await this.findByUserId(userId);
    return userWorkspaces.some(
      ws => ws.getName().toLowerCase() === name.toLowerCase()
    );
  }

  /**
   * Delete a workspace
   */
  async delete(workspace: Workspace): Promise<void> {
    const kv = await this.getKv();
    const id = workspace.getId();

    // Delete workspace
    await kv.delete(['workspaces', id]);

    // Delete from all members' lists
    for (const member of workspace.getMembers()) {
      await kv.delete(['users', member.userId, 'workspaces', id]);
    }
  }

  /**
   * Count workspaces for a user
   */
  async countByUserId(userId: string): Promise<number> {
    const workspaces = await this.findByUserId(userId);
    return workspaces.length;
  }
}

// Singleton instance
let repository: WorkspaceRepository | null = null;

/**
 * Get the workspace repository instance
 */
export async function getWorkspaceRepository(): Promise<WorkspaceRepository> {
  if (!repository) {
    repository = new WorkspaceRepository();
  }
  return repository;
}
