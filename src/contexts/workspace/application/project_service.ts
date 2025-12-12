/**
 * Project Application Service
 *
 * Orchestrates project use cases and coordinates domain logic.
 */

import { Project, type ProjectStatus } from '../domain/aggregates/project.ts';
import { getProjectRepository, type ProjectRepository } from '../infrastructure/project_repository.ts';
import { getWorkspaceRepository } from '../infrastructure/workspace_repository.ts';

export interface CreateProjectCommand {
  workspaceId: string;
  name: string;
  description?: string;
  userId: string;
  dueDate?: Date;
}

export interface UpdateProjectCommand {
  projectId: string;
  workspaceId: string;
  name?: string;
  description?: string;
  dueDate?: Date;
  userId: string;
}

export interface ChangeProjectStatusCommand {
  projectId: string;
  workspaceId: string;
  status: ProjectStatus;
  userId: string;
}

export interface ProjectResult {
  success: boolean;
  project?: Project;
  error?: string;
}

export interface ProjectListResult {
  success: boolean;
  projects?: Project[];
  error?: string;
}

/**
 * Project application service
 */
export class ProjectService {
  constructor(
    private repository: ProjectRepository,
    private workspaceRepository: ReturnType<typeof getWorkspaceRepository>
  ) {}

  /**
   * Create a new project
   */
  async createProject(command: CreateProjectCommand): Promise<ProjectResult> {
    try {
      // Verify workspace exists and user has access
      const workspace = await (await this.workspaceRepository).findById(command.workspaceId);

      if (!workspace) {
        return {
          success: false,
          error: 'Workspace not found',
        };
      }

      if (!workspace.hasMember(command.userId)) {
        return {
          success: false,
          error: 'Access denied',
        };
      }

      // Create project aggregate
      const project = Project.create({
        id: crypto.randomUUID(),
        workspaceId: command.workspaceId,
        name: command.name,
        description: command.description,
        ownerId: command.userId,
        createdBy: command.userId,
        dueDate: command.dueDate,
      });

      // Persist project
      await this.repository.save(project);

      return {
        success: true,
        project,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get project by ID
   */
  async getProject(projectId: string, userId: string): Promise<ProjectResult> {
    try {
      const project = await this.repository.findById(projectId);

      if (!project) {
        return {
          success: false,
          error: 'Project not found',
        };
      }

      // Verify user has access to workspace
      const workspace = await (await this.workspaceRepository).findById(project.getWorkspaceId());

      if (!workspace || !workspace.hasMember(userId)) {
        return {
          success: false,
          error: 'Access denied',
        };
      }

      return {
        success: true,
        project,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * List projects in a workspace
   */
  async listProjects(workspaceId: string, userId: string): Promise<ProjectListResult> {
    try {
      // Verify user has access to workspace
      const workspace = await (await this.workspaceRepository).findById(workspaceId);

      if (!workspace) {
        return {
          success: false,
          error: 'Workspace not found',
        };
      }

      if (!workspace.hasMember(userId)) {
        return {
          success: false,
          error: 'Access denied',
        };
      }

      const projects = await this.repository.findByWorkspaceId(workspaceId);

      return {
        success: true,
        projects,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update project details
   */
  async updateProject(command: UpdateProjectCommand): Promise<ProjectResult> {
    try {
      const project = await this.repository.findById(command.projectId);

      if (!project) {
        return {
          success: false,
          error: 'Project not found',
        };
      }

      // Verify user has access
      const workspace = await (await this.workspaceRepository).findById(command.workspaceId);

      if (!workspace || !workspace.hasMember(command.userId)) {
        return {
          success: false,
          error: 'Access denied',
        };
      }

      project.update({
        name: command.name,
        description: command.description,
        dueDate: command.dueDate,
        updatedBy: command.userId,
      });

      await this.repository.save(project);

      return {
        success: true,
        project,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Change project status
   */
  async changeStatus(command: ChangeProjectStatusCommand): Promise<ProjectResult> {
    try {
      const project = await this.repository.findById(command.projectId);

      if (!project) {
        return {
          success: false,
          error: 'Project not found',
        };
      }

      // Verify user has access
      const workspace = await (await this.workspaceRepository).findById(command.workspaceId);

      if (!workspace || !workspace.hasMember(command.userId)) {
        return {
          success: false,
          error: 'Access denied',
        };
      }

      project.changeStatus(command.status, command.userId);

      await this.repository.save(project);

      return {
        success: true,
        project,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get project count for workspace
   */
  async getProjectCount(workspaceId: string): Promise<number> {
    return await this.repository.countByWorkspaceId(workspaceId);
  }

  /**
   * Get active project count for workspace
   */
  async getActiveProjectCount(workspaceId: string): Promise<number> {
    return await this.repository.countByStatus(workspaceId, 'active');
  }
}

// Singleton instance
let service: ProjectService | null = null;

/**
 * Get the project service instance
 */
export async function getProjectService(): Promise<ProjectService> {
  if (!service) {
    const repository = await getProjectRepository();
    const workspaceRepository = getWorkspaceRepository();
    service = new ProjectService(repository, workspaceRepository);
  }
  return service;
}
