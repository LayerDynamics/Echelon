/**
 * User Profile Updated Event
 *
 * Emitted when a user's profile is updated.
 *
 * @module
 */

import { DomainEvent, type DomainEventMetadata } from '../../../../shared/domain/domain_event.ts';

/**
 * User profile updated domain event
 */
export class UserProfileUpdated extends DomainEvent {
  constructor(
    public override readonly userId: string,
    public readonly updatedFields: string[],
    metadata?: Partial<DomainEventMetadata>
  ) {
    super(userId, 'User', 'UserProfileUpdated', metadata);
  }

  protected getEventData(): Record<string, unknown> {
    return {
      userId: this.userId,
      updatedFields: this.updatedFields,
    };
  }
}
