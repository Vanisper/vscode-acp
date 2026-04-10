/**
 * Error thrown when an agent connection is cancelled by the user.
 */
export class AgentCancellationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentCancellationError';
  }

  /**
   * Check if an error is a cancellation error
   */
  static isCancellationError(error: unknown): error is AgentCancellationError {
    return error instanceof AgentCancellationError;
  }
}
