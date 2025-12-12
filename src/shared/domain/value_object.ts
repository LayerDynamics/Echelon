/**
 * Value Object
 *
 * Base class for value objects - objects defined by their attributes, not identity.
 * Value objects are immutable and their equality is based on their attributes.
 *
 * Examples: Email, Money, DateRange, Address
 *
 * @module
 */

/**
 * Base class for value objects
 */
export abstract class ValueObject<T> {
  protected readonly props: T;

  constructor(props: T) {
    this.props = Object.freeze({ ...props });
  }

  /**
   * Check equality based on properties
   */
  equals(other: ValueObject<T>): boolean {
    if (other === null || other === undefined) {
      return false;
    }

    if (this === other) {
      return true;
    }

    if (!(other instanceof ValueObject)) {
      return false;
    }

    return this.propsAreEqual(this.props, other.props);
  }

  /**
   * Deep equality check for properties
   */
  private propsAreEqual(props1: T, props2: T): boolean {
    const keys1 = Object.keys(props1 as object);
    const keys2 = Object.keys(props2 as object);

    if (keys1.length !== keys2.length) {
      return false;
    }

    for (const key of keys1) {
      const val1 = (props1 as Record<string, unknown>)[key];
      const val2 = (props2 as Record<string, unknown>)[key];

      if (val1 instanceof Date && val2 instanceof Date) {
        if (val1.getTime() !== val2.getTime()) {
          return false;
        }
      } else if (val1 instanceof ValueObject && val2 instanceof ValueObject) {
        if (!val1.equals(val2)) {
          return false;
        }
      } else if (typeof val1 === 'object' && typeof val2 === 'object') {
        if (!this.propsAreEqual(val1 as T, val2 as T)) {
          return false;
        }
      } else if (val1 !== val2) {
        return false;
      }
    }

    return true;
  }

  /**
   * Convert to plain object
   */
  toJSON(): T {
    return { ...this.props };
  }

  /**
   * Get raw props (immutable)
   */
  getValue(): Readonly<T> {
    return this.props;
  }
}

/**
 * Type guard for ValueObject
 */
export function isValueObject(obj: unknown): obj is ValueObject<unknown> {
  return obj instanceof ValueObject;
}
