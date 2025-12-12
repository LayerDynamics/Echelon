/**
 * Command Handler
 *
 * Base interface for command handlers in CQRS pattern.
 * Handlers execute commands and return results.
 *
 * @module
 */

import type { Command, CommandResult } from './command.ts';

/**
 * Base interface for command handlers
 */
export interface CommandHandler<TCommand extends Command, TResult = unknown> {
  /**
   * Handle the command
   */
  handle(command: TCommand): Promise<CommandResult<TResult>>;

  /**
   * Validate the command before execution
   */
  validate?(command: TCommand): Promise<ValidationResult>;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validation error
 */
export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

/**
 * Command handler decorator for logging/telemetry
 */
export function withLogging<TCommand extends Command, TResult>(
  handler: CommandHandler<TCommand, TResult>
): CommandHandler<TCommand, TResult> {
  return {
    async handle(command: TCommand): Promise<CommandResult<TResult>> {
      const start = performance.now();
      try {
        console.log(`[Command] Handling ${command.constructor.name}`, {
          commandId: command.commandId,
          userId: command.userId,
        });

        const result = await handler.handle(command);

        const duration = performance.now() - start;
        console.log(`[Command] Completed ${command.constructor.name}`, {
          commandId: command.commandId,
          success: result.success,
          duration: `${duration.toFixed(2)}ms`,
        });

        return result;
      } catch (error) {
        const duration = performance.now() - start;
        console.error(`[Command] Failed ${command.constructor.name}`, {
          commandId: command.commandId,
          error: error instanceof Error ? error.message : String(error),
          duration: `${duration.toFixed(2)}ms`,
        });
        throw error;
      }
    },

    async validate(command: TCommand): Promise<ValidationResult> {
      if (handler.validate) {
        return handler.validate(command);
      }
      return { valid: true, errors: [] };
    },
  };
}

/**
 * Command handler decorator for validation
 */
export function withValidation<TCommand extends Command, TResult>(
  handler: CommandHandler<TCommand, TResult>
): CommandHandler<TCommand, TResult> {
  return {
    async handle(command: TCommand): Promise<CommandResult<TResult>> {
      // Run validation if available
      if (handler.validate) {
        const validation = await handler.validate(command);
        if (!validation.valid) {
          return {
            success: false,
            error: new Error(
              `Validation failed: ${validation.errors.map((e) => e.message).join(', ')}`
            ),
          };
        }
      }

      return handler.handle(command);
    },

    async validate(command: TCommand): Promise<ValidationResult> {
      if (handler.validate) {
        return handler.validate(command);
      }
      return { valid: true, errors: [] };
    },
  };
}

/**
 * Base command handler implementation
 */
export abstract class BaseCommandHandler<TCommand extends Command, TResult = unknown>
  implements CommandHandler<TCommand, TResult> {
  /**
   * Handle the command (must be implemented by subclasses)
   */
  abstract handle(command: TCommand): Promise<CommandResult<TResult>>;

  /**
   * Validate the command (optional override)
   */
  async validate(command: TCommand): Promise<ValidationResult> {
    return { valid: true, errors: [] };
  }

  /**
   * Create success result
   */
  protected success(data?: TResult, events?: unknown[]): CommandResult<TResult> {
    return {
      success: true,
      data,
      events,
    };
  }

  /**
   * Create error result
   */
  protected error(error: Error): CommandResult<TResult> {
    return {
      success: false,
      error,
    };
  }
}
