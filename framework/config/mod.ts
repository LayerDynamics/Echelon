/**
 * Layer 14: Configuration & Environment Management
 *
 * Manage settings, secrets, and environment-specific configuration.
 *
 * Responsibilities:
 * - Separate configuration from code
 * - Manage secrets securely
 * - Enable environment-specific behavior
 * - Support feature flags and experimentation
 * - Configure logging and monitoring
 */

export { Config, type ConfigOptions, loadConfig } from './config.ts';
export { FeatureFlags, type FeatureFlagOptions } from './features.ts';
