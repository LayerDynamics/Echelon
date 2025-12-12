/**
 * Email Value Object
 *
 * Represents an email address with validation.
 *
 * @module
 */

import { ValueObject } from '../../../../shared/domain/value_object.ts';

interface EmailProps {
  value: string;
}

/**
 * Email value object
 */
export class Email extends ValueObject<EmailProps> {
  private constructor(props: EmailProps) {
    super(props);
  }

  /**
   * Create an email from a string
   */
  static create(email: string): Email {
    if (!Email.isValid(email)) {
      throw new Error(`Invalid email address: ${email}`);
    }

    return new Email({ value: email.toLowerCase().trim() });
  }

  /**
   * Validate email format
   */
  static isValid(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Get email string value
   */
  get value(): string {
    return this.props.value;
  }

  /**
   * Get local part (before @)
   */
  get localPart(): string {
    return this.props.value.split('@')[0];
  }

  /**
   * Get domain part (after @)
   */
  get domain(): string {
    return this.props.value.split('@')[1];
  }

  /**
   * Check if email is from a specific domain
   */
  isFromDomain(domain: string): boolean {
    return this.domain.toLowerCase() === domain.toLowerCase();
  }

  override toString(): string {
    return this.props.value;
  }
}
