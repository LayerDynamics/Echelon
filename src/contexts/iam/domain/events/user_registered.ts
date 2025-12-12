/**
 * User Registered Event
 *
 * Emitted when a new user registers in the system.
 *
 * @module
 */

import { DomainEvent, type DomainEventMetadata } from '../../../../shared/domain/domain_event.ts';

/**
 * User registered domain event
 */
export class UserRegistered extends DomainEvent {
  constructor(
    public override readonly userId: string,
    public readonly email: string,
    public readonly name: string,
    public readonly role: string,
    metadata?: Partial<DomainEventMetadata>
  ) {
    super(userId, 'User', 'UserRegistered', metadata);
  }

  protected getEventData(): Record<string, unknown> {
    return {
      userId: this.userId,
      email: this.email,
      name: this.name,
      role: this.role,
    };
  }
}
