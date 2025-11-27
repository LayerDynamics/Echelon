/**
 * Layer 4: Controller/View Layer
 *
 * Request handling logic that processes requests and coordinates responses.
 *
 * Responsibilities:
 * - Implement application-specific logic
 * - Coordinate between layers (models, services, views)
 * - Handle input validation and output formatting
 * - Maintain thin controllers (delegate to services)
 * - Provide clear API contracts
 */

export { Controller, type ControllerContext } from './base.ts';
export { ResourceController } from './resource.ts';
