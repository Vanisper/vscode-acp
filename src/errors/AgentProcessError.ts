/**
 * Error thrown when an agent process exits unexpectedly during connection.
 * Contains stderr output and exit information for better error diagnosis.
 */
export class AgentProcessError extends Error {
  constructor(
    message: string,
    public stderr: string[],
    public exitCode: number | null,
    public signal: NodeJS.Signals | null
  ) {
    super(message);
    this.name = 'AgentProcessError';
  }

  /**
   * Check if stderr contains a specific pattern
   */
  hasStderrPattern(pattern: RegExp): boolean {
    return this.stderr.some(line => pattern.test(line));
  }

  /**
   * Get stderr as a single string
   */
  getStderrText(): string {
    return this.stderr.join('\n');
  }

  /**
   * Get a summary of the error for display
   */
  getSummary(): string {
    const parts = [this.message];
    if (this.exitCode !== null) {
      parts.push(`Exit code: ${this.exitCode}`);
    }
    if (this.signal) {
      parts.push(`Signal: ${this.signal}`);
    }
    if (this.stderr.length > 0) {
      parts.push(`Stderr lines: ${this.stderr.length}`);
    }
    return parts.join(' | ');
  }
}
