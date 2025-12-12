/**
 * Project Repository
 *
 * Infrastructure layer for persisting and retrieving project aggregates.
 */

import { getKV } from '@echelon/orm/kv.ts';
import { Project, type ProjectData } from '../domain/aggregates/project.ts';

/**
 * Repository for project aggregates
 */
export class ProjectRepository {
  private kv: Deno.Kv | null = null;

  async getKv(): Promise<Deno.Kv> {
    if (!this.kv) {
      this.kv = await getKV();
    }
    return this.kv;
  }

  /**
   * Save a project
   */
  async save(project: Project): Promise<void> {
    const kv = await this.getKv();
    const data = project.toData();

    // Store project by ID
    await kv.set(['projects', project.getId()], data);

    // Store project in workspace's list
    await kv.set(
      ['workspaces', project.getWorkspaceId(), 'projects', project.getId()],
      project.getId()
    );
  }

  /**
   * Find project by ID
   */
  async findById(id: string): Promise<Project | null> {
    const kv = await this.getKv();
    const result = await kv.get<ProjectData>(['projects', id]);

    if (!result.value) {
      return null;
    }

    return Project.fromData(result.value);
  }

  /**
   * Find all projects in a workspace
   */
  async findByWorkspaceId(workspaceId: string): Promise<Project[]> {
    const kv = await this.getKv();

    // Get all project IDs for this workspace
    const entries = kv.list<string>({ prefix: ['workspaces', workspaceId, 'projects'] });
    const projectIds: string[] = [];

    for await (const entry of entries) {
      projectIds.push(entry.value);
    }

    // Fetch all projects
    const projects: Project[] = [];
    for (const id of projectIds) {
      const project = await this.findById(id);
      if (project) {
        projects.push(project);
      }
    }

    return projects;
  }

  /**
   * Delete a project
   */
  async delete(project: Project): Promise<void> {
    const kv = await this.getKv();
    const id = project.getId();

    // Delete project
    await kv.delete(['projects', id]);

    // Delete from workspace's list
    await kv.delete(['workspaces', project.getWorkspaceId(), 'projects', id]);
  }

  /**
   * Count projects in a workspace
   */
  async countByWorkspaceId(workspaceId: string): Promise<number> {
    const projects = await this.findByWorkspaceId(workspaceId);
    return projects.length;
  }

  /**
   * Count projects by status in a workspace
   */
  async countByStatus(workspaceId: string, status: string): Promise<number> {
    const projects = await this.findByWorkspaceId(workspaceId);
    return projects.filter(p => p.getStatus() === status).length;
  }
}

// Singleton instance
let repository: ProjectRepository | null = null;

/**
 * Get the project repository instance
 */
export async function getProjectRepository(): Promise<ProjectRepository> {
  if (!repository) {
    repository = new ProjectRepository();
  }
  return repository;
}
