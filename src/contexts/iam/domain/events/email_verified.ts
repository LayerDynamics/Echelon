/**
 * Email Verified Event
 *
 * Emitted when a user's email is verified.
 *
 * @module
 */

import { DomainEvent, type DomainEventMetadata } from '../../../../shared/domain/domain_event.ts';

/**
 * Email verified domain event
 */
export class EmailVerified extends DomainEvent {
  constructor(
    public override readonly userId: string,
    public readonly email: string,
    public readonly verifiedAt: Date,
    metadata?: Partial<DomainEventMetadata>
  ) {
    super(userId, 'User', 'EmailVerified', metadata);
  }

  protected getEventData(): Record<string, unknown> {
    return {
      userId: this.userId,
      email: this.email,
      verifiedAt: this.verifiedAt.toISOString(),
    };
  }
}
