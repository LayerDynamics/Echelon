/**
 * Use Case
 *
 * Base interface for use cases (application services).
 * Use cases orchestrate domain logic and infrastructure concerns.
 *
 * @module
 */

/**
 * Base interface for use cases
 */
export interface UseCase<TRequest, TResponse> {
  /**
   * Execute the use case
   */
  execute(request: TRequest): Promise<TResponse>;
}

/**
 * Use case execution context
 */
export interface UseCaseContext {
  userId: string;
  workspaceId?: string;
  correlationId?: string;
  timestamp: Date;
}

/**
 * Use case result
 */
export interface UseCaseResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: UseCaseError;
}

/**
 * Use case error
 */
export class UseCaseError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'UseCaseError';
  }
}

/**
 * Common use case error codes
 */
export const UseCaseErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

/**
 * Create use case context
 */
export function createUseCaseContext(
  userId: string,
  workspaceId?: string,
  correlationId?: string
): UseCaseContext {
  return {
    userId,
    workspaceId,
    correlationId: correlationId ?? crypto.randomUUID(),
    timestamp: new Date(),
  };
}

/**
 * Base use case implementation
 */
export abstract class BaseUseCase<TRequest, TResponse> implements UseCase<TRequest, TResponse> {
  /**
   * Execute the use case
   */
  abstract execute(request: TRequest): Promise<TResponse>;

  /**
   * Create success result
   */
  protected success<T>(data?: T): UseCaseResult<T> {
    return {
      success: true,
      data,
    };
  }

  /**
   * Create error result
   */
  protected failure(code: string, message: string, details?: Record<string, unknown>): UseCaseResult {
    return {
      success: false,
      error: new UseCaseError(message, code, details),
    };
  }

  /**
   * Validate request
   */
  protected async validate(request: TRequest): Promise<void> {
    // Override in subclasses
  }
}

/**
 * Use case decorator for logging
 */
export function withUseCaseLogging<TRequest, TResponse>(
  useCase: UseCase<TRequest, TResponse>
): UseCase<TRequest, TResponse> {
  return {
    async execute(request: TRequest): Promise<TResponse> {
      const start = performance.now();
      try {
        console.log(`[UseCase] Executing ${useCase.constructor.name}`);
        const response = await useCase.execute(request);
        const duration = performance.now() - start;
        console.log(`[UseCase] Completed ${useCase.constructor.name}`, {
          duration: `${duration.toFixed(2)}ms`,
        });
        return response;
      } catch (error) {
        const duration = performance.now() - start;
        console.error(`[UseCase] Failed ${useCase.constructor.name}`, {
          error: error instanceof Error ? error.message : String(error),
          duration: `${duration.toFixed(2)}ms`,
        });
        throw error;
      }
    },
  };
}
