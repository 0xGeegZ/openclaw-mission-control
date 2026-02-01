import { getConvexClient, api } from "./convex-client";
import { RuntimeConfig } from "./config";
import { sendToOpenClaw } from "./gateway";
import { Id } from "@packages/backend/convex/_generated/dataModel";

interface DeliveryState {
  isRunning: boolean;
  lastDelivery: number | null;
  deliveredCount: number;
  failedCount: number;
}

const state: DeliveryState = {
  isRunning: false,
  lastDelivery: null,
  deliveredCount: 0,
  failedCount: 0,
};

/**
 * Start the notification delivery loop.
 * Polls Convex for undelivered agent notifications and delivers to OpenClaw.
 */
export function startDeliveryLoop(config: RuntimeConfig): void {
  if (state.isRunning) return;
  state.isRunning = true;
  
  console.log("[Delivery] Starting delivery loop...");
  
  const poll = async () => {
    if (!state.isRunning) return;
    
    try {
      const client = getConvexClient();
      
      // Fetch undelivered notifications via service action
      // Note: Types will be available after running `npx convex dev`
      const notifications = await client.action(api.service.actions.listUndeliveredNotifications as any, {
        accountId: config.accountId,
        serviceToken: config.serviceToken,
        limit: 50,
      });
      
      if (notifications.length > 0) {
        console.log(`[Delivery] Found ${notifications.length} notifications to deliver`);
      }
      
      // Deliver each notification
      for (const notification of notifications) {
        try {
          // Get full notification context via service action
          const context = await client.action(api.service.actions.getNotificationForDelivery as any, {
            notificationId: notification._id,
            serviceToken: config.serviceToken,
            accountId: config.accountId,
          });
          
          if (context?.agent) {
            // Send to OpenClaw session
            await sendToOpenClaw(
              context.agent.sessionKey,
              formatNotificationMessage(context)
            );
            
            // Mark as delivered via service action
            // Note: Types will be available after running `npx convex dev`
            await client.action(api.service.actions.markNotificationDelivered as any, {
              notificationId: notification._id,
              serviceToken: config.serviceToken,
              accountId: config.accountId,
            });
            
            state.deliveredCount++;
            console.log(`[Delivery] Delivered notification ${notification._id}`);
          }
        } catch (error) {
          state.failedCount++;
          console.error(`[Delivery] Failed to deliver ${notification._id}:`, error);
          // Don't mark as delivered - will retry on next poll
        }
      }
      
      state.lastDelivery = Date.now();
    } catch (error) {
      console.error("[Delivery] Poll error:", error);
    }
    
    // Schedule next poll
    setTimeout(poll, config.deliveryInterval);
  };
  
  poll();
}

/**
 * Stop the delivery loop.
 */
export function stopDeliveryLoop(): void {
  state.isRunning = false;
  console.log("[Delivery] Stopped delivery loop");
}

/**
 * Get current delivery state.
 */
export function getDeliveryState(): DeliveryState {
  return { ...state };
}

/**
 * Format notification message for OpenClaw.
 */
function formatNotificationMessage(context: any): string {
  const { notification, task } = context;
  
  return `
## Notification: ${notification.type}

**${notification.title}**

${notification.body}

${task ? `Task: ${task.title} (${task.status})` : ""}

---
Notification ID: ${notification._id}
`.trim();
}
