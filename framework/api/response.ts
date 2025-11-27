/**
 * API Response Utilities
 *
 * Standard response formats for REST APIs.
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
}

/**
 * Create a success response
 */
export function apiResponse<T>(data: T, meta?: Record<string, unknown>): ApiResponse<T> {
  return {
    success: true,
    data,
    meta,
  };
}

/**
 * Create an error response
 */
export function apiError(
  code: string,
  message: string,
  details?: Record<string, unknown>
): ApiResponse {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
  };
}

/**
 * Create a validation error response
 */
export function validationError(errors: Record<string, string[]>): ApiResponse {
  return apiError('VALIDATION_ERROR', 'Validation failed', { fields: errors });
}

/**
 * Create a not found error response
 */
export function notFoundError(resource: string): ApiResponse {
  return apiError('NOT_FOUND', `${resource} not found`);
}

/**
 * Create an unauthorized error response
 */
export function unauthorizedError(message = 'Unauthorized'): ApiResponse {
  return apiError('UNAUTHORIZED', message);
}

/**
 * Create a forbidden error response
 */
export function forbiddenError(message = 'Forbidden'): ApiResponse {
  return apiError('FORBIDDEN', message);
}

/**
 * Create a server error response
 */
export function serverError(message = 'Internal server error', error?: Error): ApiResponse {
  const response = apiError('SERVER_ERROR', message);

  if (error && response.error) {
    response.error.details = {
      name: error.name,
      message: error.message,
    };

    // Include stack trace in development
    if (Deno.env.get('DENO_ENV') === 'development') {
      response.error.stack = error.stack;
    }
  }

  return response;
}

/**
 * HTTP status codes for common scenarios
 */
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;
