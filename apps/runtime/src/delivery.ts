import { getConvexClient, api } from "./convex-client";
import { backoffMs } from "./backoff";
import { RuntimeConfig } from "./config";
import { sendOpenClawToolResults, sendToOpenClaw } from "./gateway";
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
  formatNotificationMessage,
} from "./delivery/prompt";
import type { DeliveryContext } from "./delivery/types";

export type { DeliveryContext } from "./delivery/types";
export { formatNotificationMessage } from "./delivery/prompt";

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
 * Normalize assistant text parts by trimming and removing empty entries.
 * Kept as a helper so delivery behavior can be regression-tested.
 *
 * @param texts - Candidate text parts from OpenClaw
 * @returns Non-empty text parts in original order
 */
export function _normalizeNonEmptyTexts(
  texts: string[] | null | undefined,
): string[] {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  return texts.map((text) => text.trim()).filter((text) => text.length > 0);
}

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
              log.info("Skipped delivery for missing task", notification._id);
              continue;
            }
            if (!shouldDeliverToAgent(context as DeliveryContext)) {
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
            if (isStaleThreadUpdateNotification(context as DeliveryContext)) {
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
              context.effectiveBehaviorFlags ?? {};
            const hasTask = !!context?.task;
            const canModifyTaskStatus = flags.canModifyTaskStatus !== false;
            const canCreateTasks = flags.canCreateTasks === true;
            const canCreateDocuments = flags.canCreateDocuments === true;
            const canMentionAgents = flags.canMentionAgents === true;
            const isOrchestrator =
              context.orchestratorAgentId != null &&
              context.agent._id === context.orchestratorAgentId;
            const canMarkDone = canAgentMarkDone({
              taskStatus: context.task?.status,
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
            const sendOptions =
              toolCapabilities.schemas.length > 0
                ? {
                    tools: toolCapabilities.schemas,
                    toolChoice: "auto" as const,
                  }
                : undefined;
            if (sendOptions) {
              log.debug("Sending with tools", sendOptions.tools.length);
            }

            const result = await sendToOpenClaw(
              context.agent.sessionKey,
              formatNotificationMessage(
                context as DeliveryContext,
                config.taskStatusBaseUrl,
                toolCapabilities,
              ),
              sendOptions,
            );

            let textsToPost: string[] = _normalizeNonEmptyTexts(result.texts);
            let skipMessageReason: string | null = null;
            const taskId = context.notification?.taskId;
            // Use first part for retry/HEARTBEAT decision; all parts must be valid to avoid retry.
            const firstPart = textsToPost[0] ?? "";
            const noResponsePlaceholder = firstPart
              ? parseNoResponsePlaceholder(firstPart)
              : null;
            const isNoReply = firstPart ? isNoReplySignal(firstPart) : false;
            const isHeartbeatOk = isHeartbeatOkResponse(firstPart);
            if (isHeartbeatOk && result.toolCalls.length === 0) {
              log.info(
                "OpenClaw returned HEARTBEAT_OK; skipping notification",
                notification._id,
                context.agent.name,
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
            const allPlaceholderOrNoReply =
              textsToPost.length > 0 &&
              textsToPost.every(
                (t) =>
                  parseNoResponsePlaceholder(t).isPlaceholder ||
                  isNoReplySignal(t),
              );
            const needsRetry =
              result.toolCalls.length === 0 &&
              (textsToPost.length === 0 || allPlaceholderOrNoReply);
            if (needsRetry) {
              const reason = isNoReply
                ? `no-reply signal (${firstPart})`
                : textsToPost.length === 0
                  ? "empty response"
                  : "placeholder response";
              const shouldPersistFallback = shouldPersistNoResponseFallback({
                notificationType: context.notification.type,
              });
              const shouldRetry = shouldRetryNoResponseForNotification(
                context as DeliveryContext,
              );
              if (shouldRetry) {
                const decision = _getNoResponseRetryDecision(notification._id);
                if (decision.shouldRetry) {
                  log.warn(
                    "OpenClaw returned no response; will retry notification",
                    notification._id,
                    context.agent.name,
                    `${reason} (attempt ${decision.attempt}/${NO_RESPONSE_RETRY_LIMIT})`,
                  );
                  throw new Error(`OpenClaw returned ${reason}`);
                }
                log.warn(
                  "OpenClaw returned no response; giving up",
                  notification._id,
                  context.agent.name,
                  taskId ? `taskId=${taskId}` : "taskId=none",
                  `${reason} (attempt ${decision.attempt}/${NO_RESPONSE_RETRY_LIMIT})`,
                );
                state.requiredNotificationRetryExhaustedCount++;
                if (taskId) {
                  if (shouldPersistFallback) {
                    textsToPost = [
                      buildNoResponseFallbackMessage(
                        noResponsePlaceholder?.mentionPrefix,
                      ),
                    ];
                    skipMessageReason = reason;
                  } else {
                    textsToPost = [];
                    skipMessageReason = `fallback disabled for notification type ${context.notification.type}`;
                  }
                } else {
                  textsToPost = [];
                }
              } else {
                state.noResponseTerminalSkipCount++;
                log.info(
                  "OpenClaw returned no response for non-actionable notification; skipping",
                  notification._id,
                  context.agent.name,
                  reason,
                );
                textsToPost = [];
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
                  agentId: context.agent._id,
                  accountId: config.accountId,
                  serviceToken: config.serviceToken,
                  taskId: context.notification?.taskId,
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
                  const finalTexts = await sendOpenClawToolResults(
                    context.agent.sessionKey,
                    outputs,
                  );
                  const normalizedFinalTexts =
                    _normalizeNonEmptyTexts(finalTexts);
                  // Preserve pre-tool assistant text when tool follow-up has no final message.
                  if (normalizedFinalTexts.length > 0) {
                    textsToPost = normalizedFinalTexts;
                  }
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err);
                  log.warn("Failed to send tool results to OpenClaw", msg);
                }
              }
            }

            /** Per-part content and suppress flag for persistence. */
            const partsToPost: { content: string; suppress: boolean }[] = [];
            for (const part of textsToPost) {
              const placeholder = parseNoResponsePlaceholder(part);
              if (placeholder.isPlaceholder) {
                const shouldPersistFallback = shouldPersistNoResponseFallback({
                  notificationType: context.notification.type,
                });
                if (shouldPersistFallback) {
                  log.warn(
                    "OpenClaw placeholder response received; posting fallback message",
                    notification._id,
                    context.agent.name,
                  );
                  partsToPost.push({
                    content: buildNoResponseFallbackMessage(
                      placeholder.mentionPrefix,
                    ),
                    suppress: true,
                  });
                }
              } else {
                partsToPost.push({ content: part.trim(), suppress: false });
              }
            }
            if (
              taskId &&
              partsToPost.length === 0 &&
              result.toolCalls.length > 0
            ) {
              const shouldPersistFallback = shouldPersistNoResponseFallback({
                notificationType: context.notification.type,
              });
              if (shouldPersistFallback) {
                partsToPost.push({
                  content: FALLBACK_NO_REPLY_AFTER_TOOLS,
                  suppress: true,
                });
                skipMessageReason = "no final reply after tool execution";
                log.warn(
                  "No reply after tool execution; posting fallback message",
                  notification._id,
                );
              } else {
                skipMessageReason = `fallback disabled for notification type ${context.notification.type}`;
              }
            }
            // Persist parts in order; on failure we throw and do not mark delivered, so retry is idempotent per part.
            if (taskId && partsToPost.length > 0) {
              for (
                let partIndex = 0;
                partIndex < partsToPost.length;
                partIndex++
              ) {
                const { content, suppress } = partsToPost[partIndex];
                await client.action(
                  api.service.actions.createMessageFromAgent,
                  {
                    agentId: context.agent._id,
                    taskId,
                    content,
                    serviceToken: config.serviceToken,
                    accountId: config.accountId,
                    sourceNotificationId: notification._id,
                    sourceNotificationPartIndex: partIndex,
                    suppressAgentNotifications: suppress,
                  },
                );
                if (partIndex === 0) {
                  log.info(
                    "Persisted agent message(s) to Convex",
                    notification._id,
                    taskId,
                    context.agent.name,
                    partsToPost.length,
                  );
                }
                log.debug(
                  "Persisted message part",
                  notification._id,
                  taskId,
                  partIndex,
                );
                if (
                  partIndex === 0 &&
                  canModifyTaskStatus &&
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
            } else if (taskId) {
              log.info(
                "Skipped persisting agent message",
                notification._id,
                context.agent.name,
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
 * Get current delivery state (running flag, last delivery time, counts). Snapshot; safe to call from health or metrics.
 *
 * @returns Shallow copy of delivery state.
 */
export function getDeliveryState(): DeliveryState {
  return { ...state };
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
