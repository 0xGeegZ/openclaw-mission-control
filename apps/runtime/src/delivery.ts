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
      const notifications = await client.action(
        api.service.actions.listUndeliveredNotifications,
        {
          accountId: config.accountId,
          serviceToken: config.serviceToken,
          limit: 50,
        },
      );

      state.consecutiveFailures = 0;
      if (notifications.length > 0) {
        log.info("Found", notifications.length, "notifications to deliver");
      }

      for (const notification of notifications) {
        try {
          const context = await client.action(
            api.service.actions.getNotificationForDelivery,
            {
              notificationId: notification._id,
              serviceToken: config.serviceToken,
              accountId: config.accountId,
            },
          );

          if (context?.agent) {
            if (context.notification?.taskId && !context.task) {
              await client.action(
                api.service.actions.markNotificationDelivered,
                {
                  notificationId: notification._id,
                  serviceToken: config.serviceToken,
                  accountId: config.accountId,
                },
              );
              state.deliveredCount++;
              log.debug("Skipped delivery for missing task", notification._id);
              continue;
            }
            if (!shouldDeliverToAgent(context)) {
              await client.action(
                api.service.actions.markNotificationDelivered,
                {
                  notificationId: notification._id,
                  serviceToken: config.serviceToken,
                  accountId: config.accountId,
                },
              );
              state.deliveredCount++;
              log.debug("Skipped delivery for notification", notification._id);
              continue;
            }
            const responseText = await sendToOpenClaw(
              context.agent.sessionKey,
              formatNotificationMessage(context),
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
              if (
                context.task?.status === "assigned" &&
                context.notification?.type === "assignment"
              ) {
                try {
                  await client.action(
                    api.service.actions.updateTaskStatusFromAgent,
                    {
                      agentId: context.agent._id,
                      taskId,
                      status: "in_progress",
                      expectedStatus: "assigned",
                      serviceToken: config.serviceToken,
                      accountId: config.accountId,
                    },
                  );
                } catch (error) {
                  const message =
                    error instanceof Error ? error.message : String(error);
                  log.warn("Failed to auto-advance task status:", message);
                }
              }
            }
            await client.action(api.service.actions.markNotificationDelivered, {
              notificationId: notification._id,
              serviceToken: config.serviceToken,
              accountId: config.accountId,
            });
            state.deliveredCount++;
            log.debug("Delivered notification", notification._id);
          } else if (context?.notification) {
            await client.action(api.service.actions.markNotificationDelivered, {
              notificationId: notification._id,
              serviceToken: config.serviceToken,
              accountId: config.accountId,
            });
            state.deliveredCount++;
            log.debug("Skipped delivery for missing agent", notification._id);
          }
        } catch (error) {
          state.failedCount++;
          state.lastErrorAt = Date.now();
          state.lastErrorMessage =
            error instanceof Error ? error.message : String(error);
          log.warn(
            "Failed to deliver",
            notification._id,
            state.lastErrorMessage,
          );
        }
      }

      state.lastDelivery = Date.now();
    } catch (error) {
      state.consecutiveFailures++;
      state.lastErrorAt = Date.now();
      state.lastErrorMessage =
        error instanceof Error ? error.message : String(error);
      log.error("Poll error:", state.lastErrorMessage);
    }

    const delay =
      state.consecutiveFailures > 0
        ? backoffMs(
            state.consecutiveFailures,
            config.deliveryBackoffBaseMs,
            config.deliveryBackoffMaxMs,
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
 * Decide whether a notification should be delivered to an agent.
 * Skips agent-authored thread updates unless the recipient is assigned to the task
 * or the task is in review and the recipient is a reviewer role. Auto-generated
 * agent replies (from thread_update notifications) do not trigger further agent replies,
 * which avoids agent-to-agent loops while still notifying responsible reviewers.
 */
function shouldDeliverToAgent(context: any): boolean {
  const notificationType = context?.notification?.type;
  const messageAuthorType = context?.message?.authorType;

  if (notificationType === "thread_update" && messageAuthorType === "agent") {
    const taskStatus = context?.task?.status;
    const recipientId = context?.notification?.recipientId;
    const assignedAgentIds = context?.task?.assignedAgentIds;
    const sourceNotificationType = context?.sourceNotificationType;
    const agentRole = context?.agent?.role;
    const agentSlug = context?.agent?.slug;
    if (taskStatus === "done") {
      return false;
    }
    if (sourceNotificationType === "thread_update") {
      return false;
    }
    if (isLeadRole(agentRole, agentSlug)) {
      return true;
    }
    if (taskStatus === "review" && isReviewerRole(agentRole)) {
      return true;
    }
    if (!Array.isArray(assignedAgentIds)) return false;
    return assignedAgentIds.includes(recipientId);
  }

  return true;
}

/**
 * Check whether an agent role indicates a squad lead/orchestrator.
 */
function isLeadRole(
  role: string | undefined,
  slug: string | undefined,
): boolean {
  if (!role && !slug) return false;
  const normalized = `${role ?? ""} ${slug ?? ""}`.trim();
  if (!normalized) return false;
  return /squad lead|squad-lead|pm|project manager|orchestrator|lead/i.test(
    normalized,
  );
}

/**
 * Check whether an agent role indicates a reviewer (e.g., Squad Lead or QA).
 */
function isReviewerRole(role: string | undefined): boolean {
  if (!role) return false;
  return /squad lead|qa|review/i.test(role);
}

/**
 * Format full thread context lines for delivery.
 */
function formatThreadContext(thread: any[] | undefined): string {
  if (!thread || thread.length === 0) return "";
  const lines = ["Thread history (full):"];
  for (const item of thread) {
    const authorLabel =
      item.authorName ?? `${item.authorType}:${item.authorId}`;
    const timestamp = item.createdAt
      ? new Date(item.createdAt).toISOString()
      : "unknown_time";
    const content = item.content?.trim() || "(empty)";
    lines.push(`- [${timestamp}] ${authorLabel}: ${content}`);
  }
  return lines.join("\n");
}

/**
 * Format notification message for OpenClaw.
 * Instructs the agent to reply in the AGENTS.md thread-update format so write-back fits the shared brain.
 */
function formatNotificationMessage(context: any): string {
  const { notification, task, message, thread, repositoryDoc } = context;
  const taskDescription = task?.description?.trim()
    ? `Task description:\n${task.description.trim()}`
    : "";
  const messageDetails = message
    ? [
        `Latest message:`,
        message.content?.trim() || "(empty)",
        "",
        `Message author: ${message.authorType} (${message.authorId})`,
        `Message ID: ${message._id}`,
      ].join("\n")
    : "";
  const threadDetails = formatThreadContext(thread);
  const localRepoHint =
    "Local checkout (preferred): /root/clawd/openclaw-mission-control";
  const repositoryDetails = repositoryDoc?.content?.trim()
    ? [
        "Repository context:",
        repositoryDoc.content.trim(),
        localRepoHint,
        "",
        "Use the repository context above as the default codebase. Do not ask which repo to use.",
        "Prefer the local checkout instead of GitHub/web_fetch when available.",
        "To inspect the repo tree, use exec (e.g., `ls /root/clawd/openclaw-mission-control`) and only use read on files.",
        "The repository mount is read-only; write artifacts to `/root/clawd/deliverables` and reference them in the thread.",
      ].join("\n")
    : [
        "Repository context: not found.",
        localRepoHint,
        "Prefer the local checkout instead of GitHub/web_fetch when available.",
        "To inspect the repo tree, use exec (e.g., `ls /root/clawd/openclaw-mission-control`) and only use read on files.",
        "The repository mount is read-only; write artifacts to `/root/clawd/deliverables` and reference them in the thread.",
      ].join("\n");

  return `
## Notification: ${notification.type}

**${notification.title}**

${notification.body}

${task ? `Task: ${task.title} (${task.status})` : ""}
${taskDescription}
${repositoryDetails}
${messageDetails}
${threadDetails}

Use the thread history above before asking for missing info. Do not request items already present there.

If you need to change task status, call the runtime tool BEFORE posting a thread update:
- POST http://{HEALTH_HOST}:{HEALTH_PORT}/agent/task-status
- Header: x-openclaw-session-key: agent:{slug}:{accountId}
- Body: { "taskId": "...", "status": "in_progress|review|done|blocked", "blockedReason": "..." }
- Note: inbox/assigned are handled by assignment changes, not this tool.

Reply in the task thread using the required format: **Summary**, **Work done**, **Artifacts**, **Risks / blockers**, **Next step**, **Sources** (see AGENTS.md). Keep your reply concise.

---
Notification ID: ${notification._id}
`.trim();
}
