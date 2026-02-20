import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { getConvexClient, api } from "./convex-client";
import { backoffMs } from "./backoff";
import { RuntimeConfig } from "./config";
import {
  sendOpenClawToolResults,
  sendToOpenClaw,
  registerSession,
  type SendToOpenClawResult,
} from "./gateway";
import { createLogger } from "./logger";
import {
  getToolCapabilitiesAndSchemas,
  executeAgentTool,
  type ToolCapabilitiesAndSchemas,
} from "./tooling/agentTools";
import { recordSuccess, recordFailure } from "./metrics";
import { isHeartbeatOkResponse } from "./heartbeat-constants";
import {
  buildNoResponseFallbackMessage,
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
  formatNotificationMessage,
} from "./delivery/prompt";
import type { DeliveryContext } from "@packages/backend/convex/service/notifications";

export {
  buildDeliveryInstructions,
  buildNotificationInput,
  formatNotificationMessage,
} from "./delivery/prompt";

const log = createLogger("[Delivery]");

/** @internal Exposed for unit tests. */
export const _isNoReplySignal = isNoReplySignal;

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
  /**
   * Per-notification no-response retry counts. Process-local only: lost on runtime restart,
   * so a notification that exhausted retries may be retried again after restart.
   */
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
 * Result of no-response handling: either signal retry (throw) or proceed with optional fallback text.
 * Loop applies clearNoResponseRetry, state counters, and throws when action is "retry".
 * When retry or exhausted, attempt is set so the loop can log without calling _getNoResponseRetryDecision again.
 */
type NoResponseOutcome =
  | { action: "retry"; reason: string; attempt: number }
  | {
      action: "proceed";
      textToPost: string | null;
      suppressAgentNotifications: boolean;
      skipMessageReason: string | null;
      exhausted?: boolean;
      terminalSkip?: boolean;
      /** Set when exhausted; used for logging attempt count without mutating state again. */
      attempt?: number;
    };

/**
 * Handles HEARTBEAT_OK-excluded no-response cases: empty/placeholder/no-reply.
 * Returns a discriminated result; caller applies clearNoResponseRetry, state counters, and throws on retry.
 *
 * @param result - OpenClaw send result (text + toolCalls).
 * @param ctx - Delivery context for notification type and policy.
 * @param notificationId - Notification id for retry tracking.
 * @param taskId - Optional task id; used to decide fallback message.
 * @returns NoResponseOutcome: retry (throw) or proceed with text/flags and optional attempt.
 */
function handleNoResponseAfterSend(
  result: SendToOpenClawResult,
  ctx: DeliveryContext,
  notificationId: string,
  taskId: string | undefined,
): NoResponseOutcome {
  const textToPost = result.text?.trim() ?? null;
  const noResponsePlaceholder = textToPost
    ? parseNoResponsePlaceholder(textToPost)
    : null;
  const isNoReply = textToPost ? isNoReplySignal(textToPost) : false;
  const needsRetry =
    result.toolCalls.length === 0 &&
    (isNoReply ||
      !textToPost ||
      (noResponsePlaceholder?.isPlaceholder ?? false));
  if (!needsRetry) {
    return {
      action: "proceed",
      textToPost,
      suppressAgentNotifications: false,
      skipMessageReason: null,
    };
  }
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
    const decision = _getNoResponseRetryDecision(notificationId);
    if (decision.shouldRetry) {
      return {
        action: "retry",
        reason: `OpenClaw returned ${reason}`,
        attempt: decision.attempt,
      };
    }
    return {
      action: "proceed",
      textToPost:
        taskId && shouldPersistFallback
          ? buildNoResponseFallbackMessage(noResponsePlaceholder?.mentionPrefix)
          : null,
      suppressAgentNotifications: !!(taskId && shouldPersistFallback),
      skipMessageReason: taskId
        ? shouldPersistFallback
          ? reason
          : `fallback disabled for notification type ${ctx.notification.type}`
        : null,
      exhausted: true,
      attempt: decision.attempt,
    };
  }
  return {
    action: "proceed",
    textToPost: null,
    suppressAgentNotifications: false,
    skipMessageReason: null,
    terminalSkip: true,
  };
}

/**
 * @internal Track retries for placeholder/empty OpenClaw responses.
 * Mutates state.noResponseFailures. Use for decision only; prefer outcome.attempt for logging when exhausted.
 *
 * @param notificationId - Notification id to look up or create retry entry.
 * @param now - Current time (ms); defaults to Date.now() for production, inject in tests for reset window.
 * @returns { attempt, shouldRetry } for this notification.
 */
export function _getNoResponseRetryDecision(
  notificationId: string,
  now: number = Date.now(),
): { attempt: number; shouldRetry: boolean } {
  if (typeof notificationId !== "string" || notificationId.trim() === "") {
    return { attempt: 0, shouldRetry: false };
  }
  if (!Number.isFinite(now)) {
    now = Date.now();
  }
  /** Cap map size to avoid unbounded growth; prune oldest entries when at limit. */
  const NO_RESPONSE_FAILURES_MAP_MAX = 1000;
  if (state.noResponseFailures.size >= NO_RESPONSE_FAILURES_MAP_MAX) {
    const entries = [...state.noResponseFailures.entries()];
    entries.sort((a, b) => a[1].lastAt - b[1].lastAt);
    const toRemove = Math.ceil(NO_RESPONSE_FAILURES_MAP_MAX * 0.2);
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      const entry = entries[i];
      if (entry) state.noResponseFailures.delete(entry[0]);
    }
  }

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

/**
 * @internal Reset delivery state counters for tests so failedCount/deliveredCount don't leak between tests.
 */
export function _resetDeliveryStateForTests(): void {
  state.failedCount = 0;
  state.deliveredCount = 0;
  state.consecutiveFailures = 0;
  state.lastErrorAt = null;
  state.lastErrorMessage = null;
  state.noResponseTerminalSkipCount = 0;
  state.requiredNotificationRetryExhaustedCount = 0;
}

function clearNoResponseRetry(notificationId: string): void {
  state.noResponseFailures.delete(notificationId);
}

/**
 * Build tool capabilities for the current delivery context (flags + openclawClientToolsEnabled).
 */
function buildToolCapabilitiesForContext(
  ctx: DeliveryContext,
  config: RuntimeConfig,
): ToolCapabilitiesAndSchemas {
  const flags: DeliveryContext["effectiveBehaviorFlags"] =
    ctx.effectiveBehaviorFlags ?? {};
  const hasTask = !!ctx.task;
  const canModifyTaskStatus = flags.canModifyTaskStatus !== false;
  const canCreateTasks = flags.canCreateTasks === true;
  const canCreateDocuments = flags.canCreateDocuments === true;
  const canMentionAgents = flags.canMentionAgents === true;
  const isOrchestrator =
    ctx.orchestratorAgentId != null &&
    ctx.agent !== null &&
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
  return config.openclawClientToolsEnabled
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
}

/**
 * Build instructions and input, register session, and send the notification to OpenClaw.
 * @returns OpenClaw result (text and tool calls).
 */
async function sendNotificationToOpenClaw(
  sessionKey: string,
  ctx: DeliveryContext,
  config: RuntimeConfig,
  toolCapabilities: ToolCapabilitiesAndSchemas,
): Promise<SendToOpenClawResult> {
  if (ctx.agent === null) {
    throw new Error("sendNotificationToOpenClaw requires ctx.agent");
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
    log.debug("Sending with tools", sendOptions.tools?.length ?? 0);
  }
  return sendToOpenClaw(sessionKey, input, sendOptions);
}

/**
 * Runs tool calls from OpenClaw, sends results back, and returns final text (or current if none).
 */
async function executeToolCallsAndGetFinalText(
  toolCalls: SendToOpenClawResult["toolCalls"],
  ctx: DeliveryContext,
  config: RuntimeConfig,
  toolCapabilities: ToolCapabilitiesAndSchemas,
  isOrchestrator: boolean,
  currentText: string | null,
): Promise<string | null> {
  if (toolCalls.length === 0) return currentText;
  const outputs: { call_id: string; output: string }[] = [];
  for (const call of toolCalls) {
    if (ctx.agent === null) break;
    const toolResult = await executeAgentTool({
      name: call.name,
      arguments: call.arguments,
      agentId: ctx.agent._id,
      accountId: config.accountId,
      serviceToken: config.serviceToken,
      taskId: ctx.notification.taskId,
      canMarkDone: toolCapabilities.canMarkDone,
      isOrchestrator,
    });
    if (!toolResult.success) {
      log.warn(
        "Tool execution failed",
        call.name,
        ctx.notification._id,
        toolResult.error ?? "unknown",
      );
    }
    outputs.push({
      call_id: call.call_id,
      output: JSON.stringify(toolResult),
    });
  }
  if (outputs.length === 0) return currentText;
  try {
    const sessionKeyForTool = ctx.deliverySessionKey;
    if (!sessionKeyForTool) {
      throw new Error("Missing deliverySessionKey for tool results");
    }
    const finalText = await sendOpenClawToolResults(sessionKeyForTool, outputs);
    return finalText?.trim() ?? currentText;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn("Failed to send tool results to OpenClaw", msg);
    return currentText;
  }
}

/**
 * Resolves placeholder text and no-reply-after-tools fallback; returns updated text and flags.
 */
function resolveFinalTextToPost(
  textToPost: string | null,
  result: SendToOpenClawResult,
  ctx: DeliveryContext,
  taskId: string | undefined,
  current: {
    suppressAgentNotifications: boolean;
    skipMessageReason: string | null;
  },
): {
  textToPost: string | null;
  suppressAgentNotifications: boolean;
  skipMessageReason: string | null;
} {
  let out = textToPost;
  const suppress = current.suppressAgentNotifications;
  let skipReason = current.skipMessageReason;
  if (out) {
    const placeholder = parseNoResponsePlaceholder(out);
    if (placeholder.isPlaceholder) {
      out = null;
      skipReason = `fallback disabled for notification type ${ctx.notification.type}`;
    }
  }
  if (taskId && !out && result.toolCalls.length > 0) {
    skipReason = `fallback disabled for notification type ${ctx.notification.type}`;
  }
  return {
    textToPost: out,
    suppressAgentNotifications: suppress,
    skipMessageReason: skipReason,
  };
}

/**
 * Persists agent message when present, optionally advances task status, then marks notification delivered.
 */
async function persistMessageAndMaybeAdvanceTask(
  client: ReturnType<typeof getConvexClient>,
  ctx: DeliveryContext,
  notification: { _id: Id<"notifications"> },
  taskId: Id<"tasks"> | undefined,
  textToPost: string | null,
  suppressAgentNotifications: boolean,
  skipMessageReason: string | null,
  config: RuntimeConfig,
  canModifyTaskStatus: boolean,
): Promise<void> {
  if (taskId && textToPost && ctx.agent) {
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
      ctx.notification.type === "assignment"
    ) {
      try {
        await client.action(api.service.actions.updateTaskStatusFromAgent, {
          agentId: ctx.agent._id,
          taskId,
          status: "in_progress",
          expectedStatus: "assigned",
          serviceToken: config.serviceToken,
          accountId: config.accountId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warn("Failed to auto-advance task status:", message);
      }
    }
  } else if (taskId && ctx.agent) {
    log.info(
      "Skipped persisting agent message",
      notification._id,
      ctx.agent.name,
      skipMessageReason ?? "empty or intentionally suppressed",
    );
  }
  await markDeliveredAndLog(client, config, notification._id);
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
    const delay = await _runOnePollCycle(config);
    setTimeout(poll, delay);
  };

  poll();
}

/**
 * Mark a notification as delivered, increment delivered count, and log.
 * Used by the poll cycle for skip and success paths to avoid duplication.
 */
async function markDeliveredAndLog(
  client: ReturnType<typeof getConvexClient>,
  config: RuntimeConfig,
  notificationId: Id<"notifications">,
  logReason?: string,
): Promise<void> {
  await client.action(api.service.actions.markNotificationDelivered, {
    notificationId,
    serviceToken: config.serviceToken,
    accountId: config.accountId,
  });
  state.deliveredCount++;
  if (logReason) {
    log.info(logReason, notificationId);
  } else {
    log.debug("Delivered notification", notificationId);
  }
}

/**
 * @internal Single test seam for the poll body. Runs one full cycle: list, for each notification
 * get context, skip or send to OpenClaw, persist/mark delivered, then compute next delay.
 *
 * @param config - Runtime config (accountId, serviceToken, deliveryInterval, backoff).
 * @returns Next delay in ms (deliveryInterval when healthy, backoff when consecutiveFailures > 0).
 */
export async function _runOnePollCycle(config: RuntimeConfig): Promise<number> {
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
        const ctx = await client.action(
          api.service.actions.getNotificationForDelivery,
          {
            notificationId: notification._id,
            serviceToken: config.serviceToken,
            accountId: config.accountId,
          },
        );
        if (ctx?.agent) {
          if (ctx.notification.taskId && !ctx.task) {
            await markDeliveredAndLog(
              client,
              config,
              notification._id,
              "Skipped delivery for missing task",
            );
            continue;
          }
          if (!shouldDeliverToAgent(ctx)) {
            await markDeliveredAndLog(
              client,
              config,
              notification._id,
              "Skipped delivery for notification",
            );
            continue;
          }
          if (_isStaleThreadUpdateNotification(ctx)) {
            await markDeliveredAndLog(
              client,
              config,
              notification._id,
              "Skipped stale thread update notification",
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
            log.warn("Failed to mark notification read", notification._id, msg);
          }
          const toolCapabilities = buildToolCapabilitiesForContext(ctx, config);
          const canModifyTaskStatus =
            ctx.effectiveBehaviorFlags?.canModifyTaskStatus !== false;
          const isOrchestrator =
            ctx.orchestratorAgentId != null &&
            ctx.agent !== null &&
            ctx.agent._id === ctx.orchestratorAgentId;
          // Do not log sessionKey; redact if ever needed (see docs/security/OPENCLAW_CONFIG_SECURITY_AUDIT.md).
          const sessionKey = ctx.deliverySessionKey;
          if (!sessionKey) {
            throw new Error(
              "Missing deliverySessionKey; backend must return deliverySessionKey for all agent notifications (task and system sessions)",
            );
          }
          const result = await sendNotificationToOpenClaw(
            sessionKey,
            ctx,
            config,
            toolCapabilities,
          );

          const taskId = ctx.notification.taskId;
          const isHeartbeatOk = isHeartbeatOkResponse(result.text?.trim());
          if (isHeartbeatOk && result.toolCalls.length === 0) {
            log.info(
              "OpenClaw returned HEARTBEAT_OK; skipping notification",
              notification._id,
              ctx.agent.name,
            );
            clearNoResponseRetry(notification._id);
            await markDeliveredAndLog(client, config, notification._id);
            continue;
          }
          const noResponseOutcome = handleNoResponseAfterSend(
            result,
            ctx,
            notification._id,
            taskId,
          );
          if (noResponseOutcome.action === "retry") {
            log.warn(
              "OpenClaw returned no response; will retry notification",
              notification._id,
              ctx.agent.name,
              `(attempt ${noResponseOutcome.attempt}/${NO_RESPONSE_RETRY_LIMIT})`,
            );
            // Do not clear retry state here so the next poll sees the correct attempt count and can exhaust after NO_RESPONSE_RETRY_LIMIT.
            throw new Error(noResponseOutcome.reason);
          }
          if (noResponseOutcome.exhausted) {
            state.requiredNotificationRetryExhaustedCount++;
            const attempt = noResponseOutcome.attempt ?? 0;
            log.warn(
              "OpenClaw returned no response; giving up",
              notification._id,
              ctx.agent.name,
              taskId ? `taskId=${taskId}` : "taskId=none",
              `(attempt ${attempt}/${NO_RESPONSE_RETRY_LIMIT})`,
            );
          }
          if (noResponseOutcome.terminalSkip) {
            state.noResponseTerminalSkipCount++;
            log.info(
              "OpenClaw returned no response for non-actionable notification; skipping",
              notification._id,
              ctx.agent.name,
              noResponseOutcome.skipMessageReason ?? "no response",
            );
          }
          clearNoResponseRetry(notification._id);
          let textToPost: string | null = noResponseOutcome.textToPost;
          let suppressAgentNotifications =
            noResponseOutcome.suppressAgentNotifications;
          let skipMessageReason: string | null =
            noResponseOutcome.skipMessageReason;
          textToPost = await executeToolCallsAndGetFinalText(
            result.toolCalls,
            ctx,
            config,
            toolCapabilities,
            isOrchestrator,
            textToPost,
          );
          const resolved = resolveFinalTextToPost(
            textToPost,
            result,
            ctx,
            taskId,
            { suppressAgentNotifications, skipMessageReason },
          );
          textToPost = resolved.textToPost;
          suppressAgentNotifications = resolved.suppressAgentNotifications;
          skipMessageReason = resolved.skipMessageReason;
          await persistMessageAndMaybeAdvanceTask(
            client,
            ctx,
            notification,
            taskId,
            textToPost,
            suppressAgentNotifications,
            skipMessageReason,
            config,
            canModifyTaskStatus,
          );
        } else if (ctx?.notification) {
          await markDeliveredAndLog(
            client,
            config,
            notification._id,
            "Skipped delivery for missing agent",
          );
        }
      } catch (error) {
        state.failedCount++;
        state.lastErrorAt = Date.now();
        state.lastErrorMessage =
          error instanceof Error ? error.message : String(error);
        const shortMsg = state.lastErrorMessage.slice(0, 200);
        log.warn("Failed to deliver", notification._id, shortMsg);
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
  return delay;
}

/**
 * Stop the delivery loop. Idempotent; safe to call when not running.
 * Sets state.isRunning to false; the next poll iteration will exit without scheduling another.
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
 * user-authored message exists later in the thread (so we skip to avoid duplicate delivery).
 *
 * @param context - Delivery context with notification, thread, and message.
 * @returns true if notification should be skipped (marked delivered without sending).
 * @internal Exposed for unit tests.
 */
export function _isStaleThreadUpdateNotification(
  context: DeliveryContext,
): boolean {
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
