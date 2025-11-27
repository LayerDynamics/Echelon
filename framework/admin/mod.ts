/**
 * Layer 11: Admin & Management Layer
 *
 * Built-in tooling for managing application data, configuration, and operations.
 *
 * Responsibilities:
 * - Provide non-technical interface for data management
 * - Enable bulk operations and imports
 * - Support system administration tasks
 * - Audit and log changes
 * - Monitor system health
 * - Provide development/debugging tools
 */

export { AdminRouter, type AdminConfig } from './admin.ts';
export { HealthCheck, type HealthStatus } from './health.ts';
