/**
 * Layer 13: API Layer
 *
 * Expose application functionality via REST APIs.
 *
 * Responsibilities:
 * - Expose functionality programmatically
 * - Support multiple clients (web, mobile, third-party)
 * - Provide authentication and authorization
 * - Version APIs for backward compatibility
 * - Document APIs comprehensively
 * - Rate limit and throttle
 */

export { ApiRouter, type ApiRouterOptions } from './router.ts';
export { Serializer, type SerializerOptions } from './serializer.ts';
export {
  apiResponse,
  apiError,
  validationError,
  notFoundError,
  unauthorizedError,
  forbiddenError,
  serverError,
  HttpStatus,
  type ApiResponse,
  type ApiError,
} from './response.ts';

// Alias for common usage
import { Serializer as SerializerClass } from './serializer.ts';
export function createSerializer<T extends Record<string, unknown> = Record<string, unknown>>(
  options?: import('./serializer.ts').SerializerOptions
): SerializerClass<T> {
  return new SerializerClass<T>(options);
}
