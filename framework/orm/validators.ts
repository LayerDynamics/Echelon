/**
 * Field Validators
 *
 * Common validation functions for model fields.
 */

export type Validator = (value: unknown, field: string) => string | null;

/**
 * Built-in validators
 */
export const validators = {
  /**
   * Validate minimum length
   */
  minLength(min: number): Validator {
    return (value, field) => {
      if (typeof value === 'string' && value.length < min) {
        return `${field} must be at least ${min} characters`;
      }
      if (Array.isArray(value) && value.length < min) {
        return `${field} must have at least ${min} items`;
      }
      return null;
    };
  },

  /**
   * Validate maximum length
   */
  maxLength(max: number): Validator {
    return (value, field) => {
      if (typeof value === 'string' && value.length > max) {
        return `${field} must be at most ${max} characters`;
      }
      if (Array.isArray(value) && value.length > max) {
        return `${field} must have at most ${max} items`;
      }
      return null;
    };
  },

  /**
   * Validate minimum value
   */
  min(min: number): Validator {
    return (value, field) => {
      if (typeof value === 'number' && value < min) {
        return `${field} must be at least ${min}`;
      }
      return null;
    };
  },

  /**
   * Validate maximum value
   */
  max(max: number): Validator {
    return (value, field) => {
      if (typeof value === 'number' && value > max) {
        return `${field} must be at most ${max}`;
      }
      return null;
    };
  },

  /**
   * Validate email format
   */
  email(): Validator {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return (value, field) => {
      if (typeof value === 'string' && !emailRegex.test(value)) {
        return `${field} must be a valid email address`;
      }
      return null;
    };
  },

  /**
   * Validate URL format
   */
  url(): Validator {
    return (value, field) => {
      if (typeof value === 'string') {
        try {
          new URL(value);
        } catch {
          return `${field} must be a valid URL`;
        }
      }
      return null;
    };
  },

  /**
   * Validate UUID format
   */
  uuid(): Validator {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return (value, field) => {
      if (typeof value === 'string' && !uuidRegex.test(value)) {
        return `${field} must be a valid UUID`;
      }
      return null;
    };
  },

  /**
   * Validate against regex pattern
   */
  pattern(regex: RegExp, message?: string): Validator {
    return (value, field) => {
      if (typeof value === 'string' && !regex.test(value)) {
        return message ?? `${field} format is invalid`;
      }
      return null;
    };
  },

  /**
   * Validate value is one of allowed values
   */
  oneOf<T>(allowed: T[]): Validator {
    return (value, field) => {
      if (!allowed.includes(value as T)) {
        return `${field} must be one of: ${allowed.join(', ')}`;
      }
      return null;
    };
  },

  /**
   * Custom validation function
   */
  custom(fn: (value: unknown) => boolean, message: string): Validator {
    return (value, field) => {
      if (!fn(value)) {
        return message.replace('{field}', field);
      }
      return null;
    };
  },
};
