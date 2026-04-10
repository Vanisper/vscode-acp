import * as vscode from 'vscode';
import { AgentProcessError } from './AgentProcessError';
import { getOutputChannel } from '../utils/Logger';

/**
 * Generic error handler for displaying errors to users
 */
export class ErrorHandler {
  /**
   * Handle an error from agent connection attempt
   * Returns true if the error was handled with a custom message
   */
  static async handleConnectionError(e: unknown, agentName?: string): Promise<boolean> {
    if (e instanceof AgentProcessError) {
      return this.handleAgentProcessError(e, agentName);
    }
    return false;
  }

  /**
   * Handle AgentProcessError by showing stderr in output channel
   */
  private static async handleAgentProcessError(
    error: AgentProcessError,
    agentName?: string
  ): Promise<boolean> {
    // If there's stderr output, show it in the output channel
    if (error.stderr.length > 0) {
      this.showErrorWithStderr(error);
      return true;
    }

    return false;
  }

  /**
   * Show error with stderr details in output channel
   */
  private static showErrorWithStderr(error: AgentProcessError): void {
    const outputChannel = getOutputChannel();
    outputChannel.appendLine('Agent Error Output:');
    outputChannel.appendLine(error.getStderrText());
    outputChannel.show(true);

    vscode.window.showErrorMessage(
      `Failed to connect: ${error.message}`,
      'View Details'
    ).then(selection => {
      if (selection === 'View Details') {
        outputChannel.show(true);
      }
    });
  }

  /**
   * Show a simple error message without stderr
   */
  static showErrorMessage(message: string): void {
    vscode.window.showErrorMessage(message);
  }

  /**
   * Show an error message with action buttons
   */
  static async showErrorWithActions(
    message: string,
    actions: string[]
  ): Promise<string | undefined> {
    return await vscode.window.showErrorMessage(message, ...actions);
  }
}
