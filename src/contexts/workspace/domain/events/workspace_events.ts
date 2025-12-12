/**
 * Workspace Domain Events
 *
 * Events that represent significant business occurrences in the workspace domain.
 */

import type { MemberRole } from '../value-objects/member.ts';

export interface DomainEvent {
  eventType: string;
  occurredAt: Date;
  aggregateId: string;
}

/**
 * Event: Workspace was created
 */
export interface WorkspaceCreated extends DomainEvent {
  eventType: 'WorkspaceCreated';
  workspaceName: string;
  ownerId: string;
  ownerEmail: string;
}

/**
 * Event: Member was invited to workspace
 */
export interface MemberInvited extends DomainEvent {
  eventType: 'MemberInvited';
  workspaceId: string;
  workspaceName: string;
  invitedEmail: string;
  invitedBy: string;
  role: MemberRole;
}

/**
 * Event: Member joined workspace
 */
export interface MemberJoined extends DomainEvent {
  eventType: 'MemberJoined';
  workspaceId: string;
  workspaceName: string;
  userId: string;
  email: string;
  name: string;
  role: MemberRole;
}

/**
 * Event: Member was removed from workspace
 */
export interface MemberRemoved extends DomainEvent {
  eventType: 'MemberRemoved';
  workspaceId: string;
  workspaceName: string;
  userId: string;
  email: string;
  removedBy: string;
}

/**
 * Event: Member role was changed
 */
export interface MemberRoleChanged extends DomainEvent {
  eventType: 'MemberRoleChanged';
  workspaceId: string;
  workspaceName: string;
  userId: string;
  email: string;
  oldRole: MemberRole;
  newRole: MemberRole;
  changedBy: string;
}

/**
 * Event: Workspace was renamed
 */
export interface WorkspaceRenamed extends DomainEvent {
  eventType: 'WorkspaceRenamed';
  oldName: string;
  newName: string;
  renamedBy: string;
}

/**
 * Event: Workspace was archived
 */
export interface WorkspaceArchived extends DomainEvent {
  eventType: 'WorkspaceArchived';
  workspaceName: string;
  archivedBy: string;
}

/**
 * Event: Workspace was deleted
 */
export interface WorkspaceDeleted extends DomainEvent {
  eventType: 'WorkspaceDeleted';
  workspaceName: string;
  deletedBy: string;
}

export type WorkspaceDomainEvent =
  | WorkspaceCreated
  | MemberInvited
  | MemberJoined
  | MemberRemoved
  | MemberRoleChanged
  | WorkspaceRenamed
  | WorkspaceArchived
  | WorkspaceDeleted;
