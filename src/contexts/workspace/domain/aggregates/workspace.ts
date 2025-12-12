/**
 * Workspace Aggregate Root
 *
 * Represents a workspace (organization/team) that contains projects and members.
 * Enforces all business rules and invariants.
 */

import { Member, type MemberData, type MemberRole } from '../value-objects/member.ts';
import type { WorkspaceDomainEvent } from '../events/workspace_events.ts';

export interface WorkspaceData {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  members: MemberData[];
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Workspace aggregate root
 */
export class Workspace {
  private id: string;
  private name: string;
  private description?: string;
  private ownerId: string;
  private members: Map<string, Member>;
  private isArchived: boolean;
  private createdAt: Date;
  private updatedAt: Date;
  private domainEvents: WorkspaceDomainEvent[] = [];

  private constructor(data: WorkspaceData) {
    this.id = data.id;
    this.name = data.name;
    this.description = data.description;
    this.ownerId = data.ownerId;
    this.members = new Map(
      data.members.map(m => [m.userId, Member.fromData(m)])
    );
    this.isArchived = data.isArchived;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  /**
   * Create a new workspace
   */
  static create(params: {
    id: string;
    name: string;
    description?: string;
    owner: { id: string; email: string; name: string };
  }): Workspace {
    if (!params.name || params.name.trim().length === 0) {
      throw new Error('Workspace name is required');
    }

    if (params.name.length > 100) {
      throw new Error('Workspace name must be less than 100 characters');
    }

    const now = new Date();
    const ownerMember = Member.create({
      userId: params.owner.id,
      email: params.owner.email,
      name: params.owner.name,
      role: 'owner',
      joinedAt: now,
    });

    const workspace = new Workspace({
      id: params.id,
      name: params.name.trim(),
      description: params.description?.trim(),
      ownerId: params.owner.id,
      members: [ownerMember.toData()],
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    });

    workspace.addDomainEvent({
      eventType: 'WorkspaceCreated',
      occurredAt: now,
      aggregateId: workspace.id,
      workspaceName: workspace.name,
      ownerId: params.owner.id,
      ownerEmail: params.owner.email,
    });

    return workspace;
  }

  /**
   * Reconstitute workspace from persistence
   */
  static fromData(data: WorkspaceData): Workspace {
    return new Workspace({
      ...data,
      createdAt: data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt),
      updatedAt: data.updatedAt instanceof Date ? data.updatedAt : new Date(data.updatedAt),
    });
  }

  /**
   * Convert to plain object for persistence
   */
  toData(): WorkspaceData {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      ownerId: this.ownerId,
      members: Array.from(this.members.values()).map(m => m.toData()),
      isArchived: this.isArchived,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  // ============================================================================
  // Getters
  // ============================================================================

  getId(): string {
    return this.id;
  }

  getName(): string {
    return this.name;
  }

  getDescription(): string | undefined {
    return this.description;
  }

  getOwnerId(): string {
    return this.ownerId;
  }

  getMembers(): Member[] {
    return Array.from(this.members.values());
  }

  getMember(userId: string): Member | undefined {
    return this.members.get(userId);
  }

  getMemberCount(): number {
    return this.members.size;
  }

  getIsArchived(): boolean {
    return this.isArchived;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  getDomainEvents(): WorkspaceDomainEvent[] {
    return [...this.domainEvents];
  }

  clearDomainEvents(): void {
    this.domainEvents = [];
  }

  // ============================================================================
  // Business Methods
  // ============================================================================

  /**
   * Add a member to the workspace
   */
  addMember(params: {
    userId: string;
    email: string;
    name: string;
    role: MemberRole;
    addedBy: string;
  }): void {
    this.ensureNotArchived();

    const adder = this.members.get(params.addedBy);
    if (!adder || !adder.canManageMembers()) {
      throw new Error('Only owners and admins can add members');
    }

    if (this.members.has(params.userId)) {
      throw new Error('User is already a member of this workspace');
    }

    const member = Member.create({
      userId: params.userId,
      email: params.email,
      name: params.name,
      role: params.role,
      joinedAt: new Date(),
    });

    this.members.set(params.userId, member);
    this.updatedAt = new Date();

    this.addDomainEvent({
      eventType: 'MemberJoined',
      occurredAt: new Date(),
      aggregateId: this.id,
      workspaceId: this.id,
      workspaceName: this.name,
      userId: params.userId,
      email: params.email,
      name: params.name,
      role: params.role,
    });
  }

  /**
   * Remove a member from the workspace
   */
  removeMember(userId: string, removedBy: string): void {
    this.ensureNotArchived();

    if (userId === this.ownerId) {
      throw new Error('Cannot remove the workspace owner');
    }

    const remover = this.members.get(removedBy);
    if (!remover || !remover.canManageMembers()) {
      throw new Error('Only owners and admins can remove members');
    }

    const member = this.members.get(userId);
    if (!member) {
      throw new Error('User is not a member of this workspace');
    }

    this.members.delete(userId);
    this.updatedAt = new Date();

    this.addDomainEvent({
      eventType: 'MemberRemoved',
      occurredAt: new Date(),
      aggregateId: this.id,
      workspaceId: this.id,
      workspaceName: this.name,
      userId,
      email: member.email,
      removedBy,
    });
  }

  /**
   * Change a member's role
   */
  changeMemberRole(userId: string, newRole: MemberRole, changedBy: string): void {
    this.ensureNotArchived();

    if (userId === this.ownerId && newRole !== 'owner') {
      throw new Error('Cannot change the owner\'s role');
    }

    const changer = this.members.get(changedBy);
    if (!changer || !changer.canManageMembers()) {
      throw new Error('Only owners and admins can change member roles');
    }

    const member = this.members.get(userId);
    if (!member) {
      throw new Error('User is not a member of this workspace');
    }

    const oldRole = member.role;
    const updatedMember = member.withRole(newRole);
    this.members.set(userId, updatedMember);
    this.updatedAt = new Date();

    this.addDomainEvent({
      eventType: 'MemberRoleChanged',
      occurredAt: new Date(),
      aggregateId: this.id,
      workspaceId: this.id,
      workspaceName: this.name,
      userId,
      email: member.email,
      oldRole,
      newRole,
      changedBy,
    });
  }

  /**
   * Rename the workspace
   */
  rename(newName: string, renamedBy: string): void {
    this.ensureNotArchived();

    if (!newName || newName.trim().length === 0) {
      throw new Error('Workspace name is required');
    }

    if (newName.length > 100) {
      throw new Error('Workspace name must be less than 100 characters');
    }

    const renamer = this.members.get(renamedBy);
    if (!renamer || !renamer.isOwnerOrAdmin()) {
      throw new Error('Only owners and admins can rename the workspace');
    }

    const oldName = this.name;
    this.name = newName.trim();
    this.updatedAt = new Date();

    this.addDomainEvent({
      eventType: 'WorkspaceRenamed',
      occurredAt: new Date(),
      aggregateId: this.id,
      oldName,
      newName: this.name,
      renamedBy,
    });
  }

  /**
   * Update workspace description
   */
  updateDescription(description: string | undefined, updatedBy: string): void {
    this.ensureNotArchived();

    const updater = this.members.get(updatedBy);
    if (!updater || !updater.isOwnerOrAdmin()) {
      throw new Error('Only owners and admins can update the workspace description');
    }

    this.description = description?.trim();
    this.updatedAt = new Date();
  }

  /**
   * Archive the workspace
   */
  archive(archivedBy: string): void {
    this.ensureNotArchived();

    const archiver = this.members.get(archivedBy);
    if (!archiver || !archiver.canDeleteWorkspace()) {
      throw new Error('Only the owner can archive the workspace');
    }

    this.isArchived = true;
    this.updatedAt = new Date();

    this.addDomainEvent({
      eventType: 'WorkspaceArchived',
      occurredAt: new Date(),
      aggregateId: this.id,
      workspaceName: this.name,
      archivedBy,
    });
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private ensureNotArchived(): void {
    if (this.isArchived) {
      throw new Error('Cannot modify an archived workspace');
    }
  }

  private addDomainEvent(event: WorkspaceDomainEvent): void {
    this.domainEvents.push(event);
  }

  /**
   * Check if user is a member
   */
  hasMember(userId: string): boolean {
    return this.members.has(userId);
  }

  /**
   * Check if user is owner
   */
  isOwner(userId: string): boolean {
    return this.ownerId === userId;
  }

  /**
   * Check if user can manage workspace
   */
  canManage(userId: string): boolean {
    const member = this.members.get(userId);
    return member ? member.isOwnerOrAdmin() : false;
  }
}
