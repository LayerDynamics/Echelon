/**
 * Entity
 *
 * Base class for entities - objects with identity that are not defined by their attributes.
 * Entities have a unique identifier and their equality is based on that identifier, not their properties.
 *
 * @module
 */

/**
 * Base class for all entities
 */
export abstract class Entity<TId = string> {
  protected readonly _id: TId;
  protected _createdAt: Date;
  protected _updatedAt: Date;

  constructor(id: TId, createdAt?: Date, updatedAt?: Date) {
    this._id = id;
    this._createdAt = createdAt ?? new Date();
    this._updatedAt = updatedAt ?? new Date();
  }

  /**
   * Get entity ID
   */
  get id(): TId {
    return this._id;
  }

  /**
   * Get creation timestamp
   */
  get createdAt(): Date {
    return this._createdAt;
  }

  /**
   * Get last update timestamp
   */
  get updatedAt(): Date {
    return this._updatedAt;
  }

  /**
   * Mark entity as updated
   */
  protected touch(): void {
    this._updatedAt = new Date();
  }

  /**
   * Check equality based on identity
   */
  equals(other: Entity<TId>): boolean {
    if (other === null || other === undefined) {
      return false;
    }

    if (this === other) {
      return true;
    }

    if (!(other instanceof Entity)) {
      return false;
    }

    return this._id === other._id;
  }

  /**
   * Convert entity to plain object
   */
  abstract toJSON(): Record<string, unknown>;
}

/**
 * Type guard for Entity
 */
export function isEntity(obj: unknown): obj is Entity {
  return obj instanceof Entity;
}
