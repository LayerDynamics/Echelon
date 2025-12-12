/**
 * Command
 *
 * Base interface for commands in CQRS pattern.
 * Commands represent an intent to change the system state.
 *
 * @module
 */

/**
 * Base interface for all commands
 */
export interface Command {
  readonly commandId: string;
  readonly timestamp: Date;
  readonly userId: string;
  readonly workspaceId?: string;
}

/**
 * Command metadata
 */
export interface CommandMetadata {
  commandId: string;
  commandType: string;
  timestamp: Date;
  userId: string;
  workspaceId?: string;
  correlationId?: string;
  causationId?: string;
}

/**
 * Result of command execution
 */
export interface CommandResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: Error;
  events?: unknown[];
}

/**
 * Create command metadata
 */
export function createCommandMetadata(
  commandType: string,
  userId: string,
  workspaceId?: string,
  correlationId?: string,
  causationId?: string
): CommandMetadata {
  return {
    commandId: crypto.randomUUID(),
    commandType,
    timestamp: new Date(),
    userId,
    workspaceId,
    correlationId,
    causationId,
  };
}

/**
 * Type guard for Command
 */
export function isCommand(obj: unknown): obj is Command {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'commandId' in obj &&
    'timestamp' in obj &&
    'userId' in obj
  );
}
