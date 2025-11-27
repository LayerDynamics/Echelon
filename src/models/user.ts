/**
 * User Model
 *
 * Example user model using Deno KV.
 */

import { Model, type ModelOptions, ValidationBuilder, createValidator } from '../../framework/mod.ts';

export interface UserData {
  id: string;
  email: string;
  name: string;
  password?: string;
  role: 'admin' | 'user' | 'guest';
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userValidation = createValidator<UserData>()
  .field('email', new ValidationBuilder().required().email())
  .field('name', new ValidationBuilder().required().min(2).max(100))
  .field('password', new ValidationBuilder().min(8).pattern(/[A-Z]/, 'Must contain uppercase'))
  .field('role', new ValidationBuilder().required());

const userOptions: ModelOptions = {
  prefix: 'users',
  indexes: ['email'],
  timestamps: true,
};

/**
 * User model class
 */
export class User extends Model<UserData> {
  constructor() {
    super(userOptions);
  }

  /**
   * Validate user data
   */
  validate(data: Partial<UserData>): { valid: boolean; errors: Record<string, string[]> } {
    return userValidation.validate(data as UserData);
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<UserData | null> {
    const results = await this.query().where('email', '=', email).limit(1).execute();
    return results[0] ?? null;
  }

  /**
   * Create a new user with validation
   */
  async createUser(data: Omit<UserData, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserData> {
    const validation = this.validate(data as Partial<UserData>);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${JSON.stringify(validation.errors)}`);
    }

    const id = crypto.randomUUID();
    const now = new Date();

    const user: UserData = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.save(user);
    return user;
  }

  /**
   * Update user
   */
  async updateUser(id: string, data: Partial<UserData>): Promise<UserData | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updated: UserData = {
      ...existing,
      ...data,
      id,
      updatedAt: new Date(),
    };

    await this.save(updated);
    return updated;
  }

  /**
   * Serialize user for API response (exclude password)
   */
  serialize(user: UserData): Omit<UserData, 'password'> {
    const { password: _password, ...safe } = user;
    return safe;
  }
}
