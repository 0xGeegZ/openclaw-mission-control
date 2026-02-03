import { getConvexClient, api } from "./convex-client";
import { backoffMs } from "./backoff";
import { RuntimeConfig } from "./config";
import { sendToOpenClaw } from "./gateway";
import { createLogger } from "./logger";

const log = createLogger("[Delivery]");

interface DeliveryState {
  isRunning: boolean;
  lastDelivery: number | null;
  deliveredCount: number;
  failedCount: number;
  consecutiveFailures: number;
  lastErrorAt: number | null;
  lastErrorMessage: string | null;
}

const state: DeliveryState = {
  isRunning: false,
  lastDelivery: null,
  deliveredCount: 0,
  failedCount: 0,
  consecutiveFailures: 0,
  lastErrorAt: null,
  lastErrorMessage: null,
};

/**
 * Start the notification delivery loop.
 * Polls Convex for undelivered agent notifications and delivers to OpenClaw.
 * Uses exponential backoff with jitter on poll errors.
 */
export function startDeliveryLoop(config: RuntimeConfig): void {
  if (state.isRunning) return;
  state.isRunning = true;

  log.info("Starting delivery loop...");

  const poll = async () => {
    if (!state.isRunning) return;

    try {
      const client = getConvexClient();
      const notifications = await client.action(api.service.actions.listUndeliveredNotifications, {
        accountId: config.accountId,
        serviceToken: config.serviceToken,
        limit: 50,
      });

      state.consecutiveFailures = 0;
      if (notifications.length > 0) {
        log.info("Found", notifications.length, "notifications to deliver");
      }

      for (const notification of notifications) {
        try {
          const context = await client.action(api.service.actions.getNotificationForDelivery, {
            notificationId: notification._id,
            serviceToken: config.serviceToken,
            accountId: config.accountId,
          });

          if (context?.agent) {
            const responseText = await sendToOpenClaw(
              context.agent.sessionKey,
              formatNotificationMessage(context)
            );
            const taskId = context.notification?.taskId;
            if (taskId && responseText?.trim()) {
              await client.action(api.service.actions.createMessageFromAgent, {
                agentId: context.agent._id,
                taskId,
                content: responseText.trim(),
                serviceToken: config.serviceToken,
                accountId: config.accountId,
                sourceNotificationId: notification._id,
              });
            }
            await client.action(api.service.actions.markNotificationDelivered, {
              notificationId: notification._id,
              serviceToken: config.serviceToken,
              accountId: config.accountId,
            });
            state.deliveredCount++;
            log.debug("Delivered notification", notification._id);
          }
        } catch (error) {
          state.failedCount++;
          state.lastErrorAt = Date.now();
          state.lastErrorMessage = error instanceof Error ? error.message : String(error);
          log.warn("Failed to deliver", notification._id, state.lastErrorMessage);
        }
      }

      state.lastDelivery = Date.now();
    } catch (error) {
      state.consecutiveFailures++;
      state.lastErrorAt = Date.now();
      state.lastErrorMessage = error instanceof Error ? error.message : String(error);
      log.error("Poll error:", state.lastErrorMessage);
    }

    const delay =
      state.consecutiveFailures > 0
        ? backoffMs(
            state.consecutiveFailures,
            config.deliveryBackoffBaseMs,
            config.deliveryBackoffMaxMs
          )
        : config.deliveryInterval;
    setTimeout(poll, delay);
  };

  poll();
}

/**
 * Stop the delivery loop.
 */
export function stopDeliveryLoop(): void {
  state.isRunning = false;
  log.info("Stopped delivery loop");
}

/**
 * Get current delivery state.
 */
export function getDeliveryState(): DeliveryState {
  return { ...state };
}

/**
 * Format notification message for OpenClaw.
 * Instructs the agent to reply in the AGENTS.md thread-update format so write-back fits the shared brain.
 */
function formatNotificationMessage(context: any): string {
  const { notification, task } = context;
  
  return `
## Notification: ${notification.type}

**${notification.title}**

${notification.body}

${task ? `Task: ${task.title} (${task.status})` : ""}

Reply in the task thread using the required format: **Summary**, **Work done**, **Artifacts**, **Risks / blockers**, **Next step**, **Sources** (see AGENTS.md). Keep your reply concise.

---
Notification ID: ${notification._id}
`.trim();
}
