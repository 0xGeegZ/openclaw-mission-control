import { getConvexClient, api } from "./convex-client";
import { backoffMs } from "./backoff";
import { RuntimeConfig } from "./config";
import {
  sendOpenClawToolResults,
  sendToOpenClaw,
  registerSession,
} from "./gateway";
import { createLogger } from "./logger";
import {
  getToolCapabilitiesAndSchemas,
  executeAgentTool,
} from "./tooling/agentTools";
import { recordSuccess, recordFailure } from "./metrics";
import { isHeartbeatOkResponse } from "./heartbeat-constants";
import {
  buildNoResponseFallbackMessage,
  FALLBACK_NO_REPLY_AFTER_TOOLS,
  isNoReplySignal,
  parseNoResponsePlaceholder,
} from "./delivery/no-response";
import {
  canAgentMarkDone,
  shouldDeliverToAgent,
  shouldPersistNoResponseFallback,
  shouldRetryNoResponseForNotification,
} from "./delivery/policy";

export {
  canAgentMarkDone,
  shouldDeliverToAgent,
  shouldRetryNoResponseForNotification,
} from "./delivery/policy";
import {
  buildHttpCapabilityLabels,
  buildDeliveryInstructions,
  buildNotificationInput,
} from "./delivery/prompt";
import type { DeliveryContext } from "./delivery/types";

export type { DeliveryContext } from "./delivery/types";
export {
  buildDeliveryInstructions,
  buildNotificationInput,
  formatNotificationMessage,
} from "./delivery/prompt";

const log = createLogger("[Delivery]");

/** @internal Exposed for unit tests. */
export const _isNoReplySignal = isNoReplySignal;

/** @internal Exposed for unit tests. */
export const _shouldPersistNoResponseFallback = shouldPersistNoResponseFallback;

/** @internal Exposed for unit tests. */
export { _shouldPersistOrchestratorThreadAck } from "./delivery/policy";

const NO_RESPONSE_RETRY_LIMIT = 3;
const NO_RESPONSE_RETRY_RESET_MS = 10 * 60 * 1000;

interface DeliveryState {
  isRunning: boolean;
  lastDelivery: number | null;
  deliveredCount: number;
  failedCount: number;
  consecutiveFailures: number;
  lastErrorAt: number | null;
  lastErrorMessage: string | null;
  noResponseFailures: Map<string, { count: number; lastAt: number }>;
  /** Count of passive no-response notifications skipped (marked delivered without retry or fallback). */
  noResponseTerminalSkipCount: number;
  /** Count of retry-eligible no-response notifications that exhausted retries. */
  requiredNotificationRetryExhaustedCount: number;
}

const state: DeliveryState = {
  isRunning: false,
  lastDelivery: null,
  deliveredCount: 0,
  failedCount: 0,
  consecutiveFailures: 0,
  lastErrorAt: null,
  lastErrorMessage: null,
  noResponseFailures: new Map(),
  noResponseTerminalSkipCount: 0,
  requiredNotificationRetryExhaustedCount: 0,
};

/**
 * @internal Track retries for placeholder/empty OpenClaw responses.
 */
export function _getNoResponseRetryDecision(
  notificationId: string,
  now: number = Date.now(),
): { attempt: number; shouldRetry: boolean } {
  const existing = state.noResponseFailures.get(notificationId);
  let count = existing?.count ?? 0;
  const lastAt = existing?.lastAt ?? 0;
  if (existing && now - lastAt > NO_RESPONSE_RETRY_RESET_MS) {
    count = 0;
  }
  const attempt = count + 1;
  state.noResponseFailures.set(notificationId, { count: attempt, lastAt: now });
  return { attempt, shouldRetry: attempt < NO_RESPONSE_RETRY_LIMIT };
}

/**
 * @internal Reset retry tracking for a notification id.
 */
export function _resetNoResponseRetryState(): void {
  state.noResponseFailures.clear();
}

function clearNoResponseRetry(notificationId: string): void {
  state.noResponseFailures.delete(notificationId);
}

/**
 * Start the notification delivery loop.
 * Polls Convex for undelivered agent notifications and delivers to OpenClaw.
 * Uses exponential backoff with jitter on poll errors. No-op if already running.
 *
 * @param config - Runtime config (accountId, serviceToken, intervals, taskStatusBaseUrl).
 */
export function startDeliveryLoop(config: RuntimeConfig): void {
  if (state.isRunning) return;
  state.isRunning = true;

  log.info("Starting delivery loop...");

  const poll = async () => {
    if (!state.isRunning) return;

    const pollStart = Date.now();
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
            /** Single cast at boundary: backend returns string for some id fields; at runtime they are Convex ids. */
            const ctx: DeliveryContext = context as unknown as DeliveryContext;
            if (!ctx.agent) continue;
            if (ctx.notification?.taskId && !ctx.task) {
              await client.action(
                api.service.actions.markNotificationDelivered,
                {
                  notificationId: notification._id,
                  serviceToken: config.serviceToken,
                  accountId: config.accountId,
                },
              );
              state.deliveredCount++;
              log.info("Skipped delivery for missing task", notification._id);
              continue;
            }
            if (!shouldDeliverToAgent(ctx)) {
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
            if (isStaleThreadUpdateNotification(ctx)) {
              await client.action(
                api.service.actions.markNotificationDelivered,
                {
                  notificationId: notification._id,
                  serviceToken: config.serviceToken,
                  accountId: config.accountId,
                },
              );
              state.deliveredCount++;
              log.debug(
                "Skipped stale thread update notification",
                notification._id,
              );
              continue;
            }
            try {
              await client.action(api.service.actions.markNotificationRead, {
                notificationId: notification._id,
                serviceToken: config.serviceToken,
                accountId: config.accountId,
              });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              log.warn(
                "Failed to mark notification read",
                notification._id,
                msg,
              );
            }
            const flags: DeliveryContext["effectiveBehaviorFlags"] =
              ctx.effectiveBehaviorFlags ?? {};
            const hasTask = !!ctx.task;
            const canModifyTaskStatus = flags.canModifyTaskStatus !== false;
            const canCreateTasks = flags.canCreateTasks === true;
            const canCreateDocuments = flags.canCreateDocuments === true;
            const canMentionAgents = flags.canMentionAgents === true;
            const isOrchestrator =
              ctx.orchestratorAgentId != null &&
              ctx.agent._id === ctx.orchestratorAgentId;
            const canMarkDone = canAgentMarkDone({
              taskStatus: ctx.task?.status,
              canMarkDone: flags.canMarkDone === true,
            });
            const rawToolCapabilities = getToolCapabilitiesAndSchemas({
              canCreateTasks,
              canModifyTaskStatus,
              canCreateDocuments,
              hasTaskContext: hasTask,
              canMentionAgents,
              canMarkDone,
              isOrchestrator,
            });
            const toolCapabilities = config.openclawClientToolsEnabled
              ? rawToolCapabilities
              : {
                  ...rawToolCapabilities,
                  capabilityLabels: buildHttpCapabilityLabels({
                    canCreateTasks,
                    canModifyTaskStatus,
                    canCreateDocuments,
                    hasTaskContext: hasTask,
                    canMentionAgents,
                    isOrchestrator,
                  }),
                  schemas: [],
                };
            const sessionKey = ctx.deliverySessionKey;
            if (!sessionKey) {
              throw new Error(
                "Missing deliverySessionKey; backend must return deliverySessionKey for all agent notifications (task and system sessions)",
              );
            }
            registerSession(sessionKey, ctx.agent._id, ctx.agent.slug);

            const instructions = buildDeliveryInstructions(
              ctx,
              config.taskStatusBaseUrl,
              toolCapabilities,
            );
            const input = buildNotificationInput(
              ctx,
              config.taskStatusBaseUrl,
              toolCapabilities,
            );
            const sendOptions =
              toolCapabilities.schemas.length > 0
                ? {
                    tools: toolCapabilities.schemas,
                    toolChoice: "auto" as const,
                    instructions,
                  }
                : { instructions };
            if (sendOptions.tools) {
              log.debug("Sending with tools", sendOptions.tools.length);
            }

            const result = await sendToOpenClaw(sessionKey, input, sendOptions);

            let textToPost: string | null = result.text?.trim() ?? null;
            let suppressAgentNotifications = false;
            let skipMessageReason: string | null = null;
            const taskId = ctx.notification?.taskId;
            const noResponsePlaceholder = textToPost
              ? parseNoResponsePlaceholder(textToPost)
              : null;
            const isNoReply = textToPost ? isNoReplySignal(textToPost) : false;
            const isHeartbeatOk = isHeartbeatOkResponse(textToPost);
            if (isHeartbeatOk && result.toolCalls.length === 0) {
              log.info(
                "OpenClaw returned HEARTBEAT_OK; skipping notification",
                notification._id,
                ctx.agent.name,
              );
              clearNoResponseRetry(notification._id);
              await client.action(
                api.service.actions.markNotificationDelivered,
                {
                  notificationId: notification._id,
                  serviceToken: config.serviceToken,
                  accountId: config.accountId,
                },
              );
              state.deliveredCount++;
              log.debug("Delivered notification (no reply)", notification._id);
              continue;
            }
            const needsRetry =
              result.toolCalls.length === 0 &&
              (isNoReply ||
                !textToPost ||
                noResponsePlaceholder?.isPlaceholder);
            if (needsRetry) {
              const reason = isNoReply
                ? `no-reply signal (${textToPost})`
                : !textToPost
                  ? "empty response"
                  : "placeholder response";
              const shouldPersistFallback = shouldPersistNoResponseFallback({
                notificationType: ctx.notification.type,
              });
              const shouldRetry = shouldRetryNoResponseForNotification(ctx);
              if (shouldRetry) {
                const decision = _getNoResponseRetryDecision(notification._id);
                if (decision.shouldRetry) {
                  log.warn(
                    "OpenClaw returned no response; will retry notification",
                    notification._id,
                    ctx.agent.name,
                    `${reason} (attempt ${decision.attempt}/${NO_RESPONSE_RETRY_LIMIT})`,
                  );
                  throw new Error(`OpenClaw returned ${reason}`);
                }
                log.warn(
                  "OpenClaw returned no response; giving up",
                  notification._id,
                  ctx.agent.name,
                  taskId ? `taskId=${taskId}` : "taskId=none",
                  `${reason} (attempt ${decision.attempt}/${NO_RESPONSE_RETRY_LIMIT})`,
                );
                state.requiredNotificationRetryExhaustedCount++;
                if (taskId) {
                  if (shouldPersistFallback) {
                    textToPost = buildNoResponseFallbackMessage(
                      noResponsePlaceholder?.mentionPrefix,
                    );
                    suppressAgentNotifications = true;
                    skipMessageReason = reason;
                  } else {
                    textToPost = null;
                    skipMessageReason = `fallback disabled for notification type ${ctx.notification.type}`;
                  }
                } else {
                  textToPost = null;
                }
              } else {
                state.noResponseTerminalSkipCount++;
                log.info(
                  "OpenClaw returned no response for non-actionable notification; skipping",
                  notification._id,
                  ctx.agent.name,
                  reason,
                );
                textToPost = null;
              }
              clearNoResponseRetry(notification._id);
            } else {
              clearNoResponseRetry(notification._id);
            }
            if (result.toolCalls.length > 0) {
              const outputs: { call_id: string; output: string }[] = [];
              // taskId is the notification's task; tools (e.g. task_status) are expected to operate on this task only.
              for (const call of result.toolCalls) {
                const toolResult = await executeAgentTool({
                  name: call.name,
                  arguments: call.arguments,
                  agentId: ctx.agent._id,
                  accountId: config.accountId,
                  serviceToken: config.serviceToken,
                  taskId: ctx.notification?.taskId,
                  canMarkDone: toolCapabilities.canMarkDone,
                  isOrchestrator,
                });
                if (!toolResult.success) {
                  log.warn(
                    "Tool execution failed",
                    call.name,
                    notification._id,
                    toolResult.error ?? "unknown",
                  );
                }
                outputs.push({
                  call_id: call.call_id,
                  output: JSON.stringify(toolResult),
                });
              }
              if (outputs.length > 0) {
                try {
                  const sessionKeyForTool = ctx.deliverySessionKey;
                  if (!sessionKeyForTool) {
                    throw new Error(
                      "Missing deliverySessionKey for tool results",
                    );
                  }
                  const finalText = await sendOpenClawToolResults(
                    sessionKeyForTool,
                    outputs,
                  );
                  textToPost = finalText?.trim() ?? textToPost;
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err);
                  log.warn("Failed to send tool results to OpenClaw", msg);
                }
              }
            }

            if (textToPost) {
              const placeholder = parseNoResponsePlaceholder(textToPost);
              if (placeholder.isPlaceholder) {
                const shouldPersistFallback = shouldPersistNoResponseFallback({
                  notificationType: ctx.notification.type,
                });
                if (shouldPersistFallback) {
                  log.warn(
                    "OpenClaw placeholder response received; posting fallback message",
                    notification._id,
                    ctx.agent.name,
                  );
                  textToPost = buildNoResponseFallbackMessage(
                    placeholder.mentionPrefix,
                  );
                  suppressAgentNotifications = true;
                  skipMessageReason = "placeholder fallback";
                } else {
                  textToPost = null;
                  skipMessageReason = `fallback disabled for notification type ${ctx.notification.type}`;
                }
              }
            }
            if (taskId && !textToPost && result.toolCalls.length > 0) {
              const shouldPersistFallback = shouldPersistNoResponseFallback({
                notificationType: ctx.notification.type,
              });
              if (shouldPersistFallback) {
                textToPost = FALLBACK_NO_REPLY_AFTER_TOOLS;
                suppressAgentNotifications = true;
                skipMessageReason = "no final reply after tool execution";
                log.warn(
                  "No reply after tool execution; posting fallback message",
                  notification._id,
                );
              } else {
                skipMessageReason = `fallback disabled for notification type ${ctx.notification.type}`;
              }
            }
            if (taskId && textToPost) {
              await client.action(api.service.actions.createMessageFromAgent, {
                agentId: ctx.agent._id,
                taskId,
                content: textToPost.trim(),
                serviceToken: config.serviceToken,
                accountId: config.accountId,
                sourceNotificationId: notification._id,
                suppressAgentNotifications,
              });
              log.info(
                "Persisted agent message to Convex",
                notification._id,
                taskId,
                ctx.agent.name,
              );
              if (
                canModifyTaskStatus &&
                ctx.task?.status === "assigned" &&
                ctx.notification?.type === "assignment"
              ) {
                try {
                  await client.action(
                    api.service.actions.updateTaskStatusFromAgent,
                    {
                      agentId: ctx.agent._id,
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
            } else if (taskId) {
              log.info(
                "Skipped persisting agent message",
                notification._id,
                ctx.agent.name,
                skipMessageReason ?? "empty or intentionally suppressed",
              );
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
          try {
            await client.action(
              api.service.actions.markNotificationDeliveryEnded,
              {
                notificationId: notification._id,
                serviceToken: config.serviceToken,
                accountId: config.accountId,
              },
            );
          } catch (markErr) {
            const msg =
              markErr instanceof Error ? markErr.message : String(markErr);
            log.warn(
              "Failed to mark notification delivery ended; typing may persist until Convex syncs",
              notification._id,
              msg,
            );
          }
        }
      }

      state.lastDelivery = Date.now();
      const pollDuration = Date.now() - pollStart;
      if (notifications.length > 0) {
        recordSuccess("delivery.poll", pollDuration);
      }
    } catch (error) {
      state.consecutiveFailures++;
      state.lastErrorAt = Date.now();
      const msg = error instanceof Error ? error.message : String(error);
      const cause =
        error instanceof Error && error.cause instanceof Error
          ? error.cause.message
          : error instanceof Error && error.cause != null
            ? String(error.cause)
            : null;
      state.lastErrorMessage = cause ? `${msg} (cause: ${cause})` : msg;
      const pollDuration = Date.now() - pollStart;
      recordFailure("delivery.poll", pollDuration, state.lastErrorMessage);
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
 * Stop the delivery loop. Idempotent; safe to call when not running.
 */
export function stopDeliveryLoop(): void {
  state.isRunning = false;
  log.info("Stopped delivery loop");
}

/**
 * Get current delivery state (running flag, last delivery time, counts).
 * Returns a snapshot safe to read from health or metrics; mutating the returned object
 * (including noResponseFailures) does not affect the live delivery loop state.
 *
 * @returns Snapshot of delivery state with noResponseFailures copied.
 */
export function getDeliveryState(): DeliveryState {
  return {
    ...state,
    noResponseFailures: new Map(state.noResponseFailures),
  };
}

/**
 * Returns true when a thread_update notification is stale because a newer
 * user-authored message exists later in the thread.
 */
function isStaleThreadUpdateNotification(context: DeliveryContext): boolean {
  const notification = context.notification;
  if (!notification || notification.type !== "thread_update") return false;
  if (notification.recipientType !== "agent") return false;
  if (!notification.messageId) return false;
  if (context.message?.authorType !== "user") return false;
  if (!Array.isArray(context.thread) || context.thread.length === 0)
    return false;

  const messageIndex = context.thread.findIndex(
    (item) => item.messageId === notification.messageId,
  );
  if (messageIndex < 0) return false;

  for (let i = messageIndex + 1; i < context.thread.length; i++) {
    if (context.thread[i].authorType === "user") return true;
  }

  return false;
}
