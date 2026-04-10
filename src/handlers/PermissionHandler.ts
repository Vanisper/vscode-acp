import * as vscode from 'vscode';
import { log } from '../utils/Logger';
import { sendEvent } from '../utils/TelemetryManager';

import type { RequestPermissionRequest, RequestPermissionResponse } from '@agentclientprotocol/sdk';

interface QueuedPermission {
  params: RequestPermissionRequest;
  resolve: (response: RequestPermissionResponse) => void;
  reject: (error: Error) => void;
}

/**
 * Handles ACP permission requests from agents.
 * Shows VS Code QuickPick for user to select from agent-provided options.
 *
 * Enhanced to batch concurrent permission requests and show them all at once.
 */
export class PermissionHandler {
  private queue: QueuedPermission[] = [];
  private showTimer: NodeJS.Timeout | null = null;
  private isShowing = false;

  async requestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const config = vscode.workspace.getConfiguration('acp');
    const autoApprove = config.get<string>('autoApprovePermissions', 'none');

    const title = params.toolCall?.title || 'Permission Request';
    log(`requestPermission: ${title} (autoApprove=${autoApprove})`);

    // Auto-approve: pick first allow-type option
    if (autoApprove === 'allowAll') {
      const allowOption = params.options.find(o =>
        o.kind === 'allow_once' || o.kind === 'allow_always'
      );
      if (allowOption) {
        sendEvent('permission/requested', { permissionType: title, autoApproved: 'true' });
        return {
          outcome: {
            outcome: 'selected',
            optionId: allowOption.optionId,
          },
        };
      }
    }

    // Add to queue and wait for response
    return new Promise<RequestPermissionResponse>((resolve, reject) => {
      this.queue.push({ params, resolve, reject });

      // Schedule showing the UI (with a small delay to allow more requests to queue up)
      if (!this.showTimer && !this.isShowing) {
        this.showTimer = setTimeout(() => {
          this.showTimer = null;
          void this.showPermissionUI();
        }, 100); // 100ms delay to batch concurrent requests
      }
    });
  }

  private async showPermissionUI(): Promise<void> {
    if (this.isShowing || this.queue.length === 0) {
      return;
    }

    this.isShowing = true;

    // Take all currently queued permissions
    const currentQueue = [...this.queue];
    this.queue = [];

    try {
      if (currentQueue.length === 1) {
        // Single permission - use the simple UI
        const { params, resolve, reject } = currentQueue[0];
        try {
          const response = await this.showSinglePermission(params);
          resolve(response);
        } catch (e) {
          reject(e as Error);
        }
      } else {
        // Multiple permissions - batch them together
        const responses = await this.showBatchedPermissions(currentQueue);
        for (let i = 0; i < currentQueue.length; i++) {
          currentQueue[i].resolve(responses[i]);
        }
      }
    } finally {
      this.isShowing = false;

      // If more permissions came in while showing the UI, schedule another round
      if (this.queue.length > 0 && !this.showTimer) {
        this.showTimer = setTimeout(() => {
          this.showTimer = null;
          void this.showPermissionUI();
        }, 100);
      }
    }
  }

  private async showSinglePermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const title = params.toolCall?.title || 'Permission Request';

    // Build QuickPick items from agent-provided options
    const items: (vscode.QuickPickItem & { optionId: string })[] = params.options.map(option => {
      const icon = option.kind.startsWith('allow') ? '$(check)' : '$(x)';
      return {
        label: `${icon} ${option.name}`,
        description: option.kind,
        optionId: option.optionId,
      };
    });

    sendEvent('permission/requested', { permissionType: title, autoApproved: 'false' });

    const selection = await vscode.window.showQuickPick(items, {
      placeHolder: title,
      title: 'ACP Agent Permission Request',
      ignoreFocusOut: true,
    });

    if (!selection) {
      log('Permission cancelled by user');
      sendEvent('permission/responded', { permissionType: title, outcome: 'cancelled' });
      return {
        outcome: { outcome: 'cancelled' },
      };
    }

    log(`Permission selected: ${selection.optionId}`);
    sendEvent('permission/responded', {
      permissionType: title,
      action: selection.optionId,
      outcome: 'selected',
    });
    return {
      outcome: {
        outcome: 'selected',
        optionId: selection.optionId,
      },
    };
  }

  private async showBatchedPermissions(
    queuedPermissions: QueuedPermission[],
  ): Promise<RequestPermissionResponse[]> {
    log(`Showing ${queuedPermissions.length} batched permissions`);

    // Create a multi-step QuickPick interface
    const responses: RequestPermissionResponse[] = [];

    for (let i = 0; i < queuedPermissions.length; i++) {
      const { params } = queuedPermissions[i];
      const title = params.toolCall?.title || 'Permission Request';

      // Build QuickPick items from agent-provided options
      const items: (vscode.QuickPickItem & { optionId: string })[] = params.options.map(option => {
        const icon = option.kind.startsWith('allow') ? '$(check)' : '$(x)';
        return {
          label: `${icon} ${option.name}`,
          description: option.kind,
          optionId: option.optionId,
        };
      });

      sendEvent('permission/requested', { permissionType: title, autoApproved: 'false', batched: 'true' });

      const selection = await vscode.window.showQuickPick(items, {
        placeHolder: title,
        title: `ACP Agent Permission Request (${i + 1}/${queuedPermissions.length})`,
        ignoreFocusOut: true,
      });

      if (!selection) {
        log('Permission cancelled by user');
        sendEvent('permission/responded', { permissionType: title, outcome: 'cancelled', batched: 'true' });
        responses.push({
          outcome: { outcome: 'cancelled' },
        });
      } else {
        log(`Permission selected: ${selection.optionId}`);
        sendEvent('permission/responded', {
          permissionType: title,
          action: selection.optionId,
          outcome: 'selected',
          batched: 'true',
        });
        responses.push({
          outcome: {
            outcome: 'selected',
            optionId: selection.optionId,
          },
        });
      }
    }

    return responses;
  }
}
