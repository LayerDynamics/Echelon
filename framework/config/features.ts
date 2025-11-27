/**
 * Feature Flags
 *
 * Enable/disable features without deployment.
 */

export interface FeatureFlagOptions {
  name: string;
  enabled: boolean;
  description?: string;
  percentage?: number; // For gradual rollout
  users?: string[]; // Enabled for specific users
  groups?: string[]; // Enabled for specific groups
}

/**
 * Feature flag manager
 */
export class FeatureFlags {
  private flags = new Map<string, FeatureFlagOptions>();

  /**
   * Register a feature flag
   */
  register(flag: FeatureFlagOptions): this {
    this.flags.set(flag.name, flag);
    return this;
  }

  /**
   * Check if a feature is enabled
   */
  isEnabled(name: string, context?: FeatureContext): boolean {
    const flag = this.flags.get(name);
    if (!flag) return false;
    if (!flag.enabled) return false;

    // Check user-specific override
    if (context?.userId && flag.users?.includes(context.userId)) {
      return true;
    }

    // Check group-specific override
    if (context?.groups && flag.groups) {
      for (const group of context.groups) {
        if (flag.groups.includes(group)) {
          return true;
        }
      }
    }

    // Check percentage rollout
    if (flag.percentage !== undefined && flag.percentage < 100) {
      if (context?.userId) {
        // Consistent hashing for user
        const hash = this.hashString(context.userId + name);
        return hash % 100 < flag.percentage;
      }
      // Random for anonymous users
      return Math.random() * 100 < flag.percentage;
    }

    return flag.enabled;
  }

  /**
   * Enable a feature
   */
  enable(name: string): void {
    const flag = this.flags.get(name);
    if (flag) {
      flag.enabled = true;
    }
  }

  /**
   * Disable a feature
   */
  disable(name: string): void {
    const flag = this.flags.get(name);
    if (flag) {
      flag.enabled = false;
    }
  }

  /**
   * Set rollout percentage
   */
  setPercentage(name: string, percentage: number): void {
    const flag = this.flags.get(name);
    if (flag) {
      flag.percentage = Math.max(0, Math.min(100, percentage));
    }
  }

  /**
   * Get all flags
   */
  getAll(): FeatureFlagOptions[] {
    return Array.from(this.flags.values());
  }

  /**
   * Get a flag by name
   */
  get(name: string): FeatureFlagOptions | undefined {
    return this.flags.get(name);
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

interface FeatureContext {
  userId?: string;
  groups?: string[];
}

// Default feature flags instance
let defaultFlags: FeatureFlags | null = null;

/**
 * Get the default feature flags instance
 */
export function getFeatureFlags(): FeatureFlags {
  if (!defaultFlags) {
    defaultFlags = new FeatureFlags();
  }
  return defaultFlags;
}

/**
 * Check if a feature is enabled
 */
export function featureEnabled(name: string, context?: FeatureContext): boolean {
  return getFeatureFlags().isEnabled(name, context);
}
