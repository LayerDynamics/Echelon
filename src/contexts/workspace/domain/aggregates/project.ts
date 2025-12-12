/**
 * Project Aggregate Root
 *
 * Represents a project within a workspace.
 * Projects organize tasks and track progress.
 */

export type ProjectStatus = 'planning' | 'active' | 'on-hold' | 'completed' | 'archived';

export interface ProjectData {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  ownerId: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  dueDate?: Date;
}

/**
 * Project aggregate root
 */
export class Project {
  private id: string;
  private workspaceId: string;
  private name: string;
  private description?: string;
  private status: ProjectStatus;
  private ownerId: string;
  private createdBy: string;
  private createdAt: Date;
  private updatedAt: Date;
  private dueDate?: Date;

  private constructor(data: ProjectData) {
    this.id = data.id;
    this.workspaceId = data.workspaceId;
    this.name = data.name;
    this.description = data.description;
    this.status = data.status;
    this.ownerId = data.ownerId;
    this.createdBy = data.createdBy;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
    this.dueDate = data.dueDate;
  }

  /**
   * Create a new project
   */
  static create(params: {
    id: string;
    workspaceId: string;
    name: string;
    description?: string;
    ownerId: string;
    createdBy: string;
    dueDate?: Date;
  }): Project {
    if (!params.name || params.name.trim().length === 0) {
      throw new Error('Project name is required');
    }

    if (params.name.length > 200) {
      throw new Error('Project name must be less than 200 characters');
    }

    const now = new Date();

    return new Project({
      id: params.id,
      workspaceId: params.workspaceId,
      name: params.name.trim(),
      description: params.description?.trim(),
      status: 'planning',
      ownerId: params.ownerId,
      createdBy: params.createdBy,
      createdAt: now,
      updatedAt: now,
      dueDate: params.dueDate,
    });
  }

  /**
   * Reconstitute project from persistence
   */
  static fromData(data: ProjectData): Project {
    return new Project({
      ...data,
      createdAt: data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt),
      updatedAt: data.updatedAt instanceof Date ? data.updatedAt : new Date(data.updatedAt),
      dueDate: data.dueDate ? (data.dueDate instanceof Date ? data.dueDate : new Date(data.dueDate)) : undefined,
    });
  }

  /**
   * Convert to plain object for persistence
   */
  toData(): ProjectData {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      name: this.name,
      description: this.description,
      status: this.status,
      ownerId: this.ownerId,
      createdBy: this.createdBy,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      dueDate: this.dueDate,
    };
  }

  // ============================================================================
  // Getters
  // ============================================================================

  getId(): string {
    return this.id;
  }

  getWorkspaceId(): string {
    return this.workspaceId;
  }

  getName(): string {
    return this.name;
  }

  getDescription(): string | undefined {
    return this.description;
  }

  getStatus(): ProjectStatus {
    return this.status;
  }

  getOwnerId(): string {
    return this.ownerId;
  }

  getCreatedBy(): string {
    return this.createdBy;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  getDueDate(): Date | undefined {
    return this.dueDate;
  }

  // ============================================================================
  // Business Methods
  // ============================================================================

  /**
   * Update project details
   */
  update(params: {
    name?: string;
    description?: string;
    dueDate?: Date;
    updatedBy: string;
  }): void {
    if (this.status === 'archived') {
      throw new Error('Cannot update an archived project');
    }

    if (params.name !== undefined) {
      if (!params.name || params.name.trim().length === 0) {
        throw new Error('Project name is required');
      }
      if (params.name.length > 200) {
        throw new Error('Project name must be less than 200 characters');
      }
      this.name = params.name.trim();
    }

    if (params.description !== undefined) {
      this.description = params.description?.trim();
    }

    if (params.dueDate !== undefined) {
      this.dueDate = params.dueDate;
    }

    this.updatedAt = new Date();
  }

  /**
   * Change project status
   */
  changeStatus(newStatus: ProjectStatus, changedBy: string): void {
    if (this.status === 'archived' && newStatus !== 'archived') {
      throw new Error('Cannot change status of an archived project');
    }

    this.status = newStatus;
    this.updatedAt = new Date();
  }

  /**
   * Start the project
   */
  start(startedBy: string): void {
    if (this.status !== 'planning') {
      throw new Error('Project must be in planning status to start');
    }

    this.status = 'active';
    this.updatedAt = new Date();
  }

  /**
   * Complete the project
   */
  complete(completedBy: string): void {
    if (this.status === 'completed') {
      throw new Error('Project is already completed');
    }

    if (this.status === 'archived') {
      throw new Error('Cannot complete an archived project');
    }

    this.status = 'completed';
    this.updatedAt = new Date();
  }

  /**
   * Archive the project
   */
  archive(archivedBy: string): void {
    if (this.status === 'archived') {
      throw new Error('Project is already archived');
    }

    this.status = 'archived';
    this.updatedAt = new Date();
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Check if project is active
   */
  isActive(): boolean {
    return this.status === 'active';
  }

  /**
   * Check if project is completed
   */
  isCompleted(): boolean {
    return this.status === 'completed';
  }

  /**
   * Check if project is archived
   */
  isArchived(): boolean {
    return this.status === 'archived';
  }

  /**
   * Check if project is overdue
   */
  isOverdue(): boolean {
    if (!this.dueDate || this.status === 'completed' || this.status === 'archived') {
      return false;
    }
    return this.dueDate < new Date();
  }
}
