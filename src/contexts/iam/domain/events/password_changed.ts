/**
 * Password Changed Event
 *
 * Emitted when a user's password is changed.
 *
 * @module
 */

import { DomainEvent, type DomainEventMetadata } from '../../../../shared/domain/domain_event.ts';

/**
 * Password changed domain event
 */
export class PasswordChanged extends DomainEvent {
  constructor(
    public override readonly userId: string,
    public readonly changedAt: Date,
    public readonly changedBy: string,
    metadata?: Partial<DomainEventMetadata>
  ) {
    super(userId, 'User', 'PasswordChanged', metadata);
  }

  protected getEventData(): Record<string, unknown> {
    return {
      userId: this.userId,
      changedAt: this.changedAt.toISOString(),
      changedBy: this.changedBy,
    };
  }
}
