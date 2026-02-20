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
import { redactForExposure } from "./logger";
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
 * Result of processing one notification; streams return aggregated deltas.
 * Used so the main cycle can aggregate outcomes without mutating shared state from inside parallel streams.
 */
export interface DeliveryOutcome {
  delivered: number;
  failed: number;
  requiredNotificationRetryExhaustedCount: number;
  noResponseTerminalSkipCount: number;
  lastErrorMessage: string | null;
}

function zeroOutcome(): DeliveryOutcome {
  return {
    delivered: 0,
    failed: 0,
    requiredNotificationRetryExhaustedCount: 0,
    noResponseTerminalSkipCount: 0,
    lastErrorMessage: null,
  };
}

/** Returns a DeliveryOutcome representing a single failed delivery (for aggregation). Message is sanitized before storage. */
function failedOutcome(message: string): DeliveryOutcome {
  return {
    ...zeroOutcome(),
    failed: 1,
    lastErrorMessage: sanitizeErrorMessage(message),
  };
}

/** Extracts a string from an unknown error for logging and lastErrorMessage. */
function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Max length for lastErrorMessage stored and exposed via health to limit leakage. */
const LAST_ERROR_MESSAGE_MAX_LENGTH = 500;

/** Sanitize and truncate error message before storing or exposing. */
function sanitizeErrorMessage(msg: string): string {
  const redacted = redactForExposure(msg);
  if (redacted.length <= LAST_ERROR_MESSAGE_MAX_LENGTH) return redacted;
  return redacted.slice(0, LAST_ERROR_MESSAGE_MAX_LENGTH) + "...";
}

/**
 * Wraps a promise with a timeout. Rejects with an Error if the promise does not settle within ms.
 * Clears the timer when the promise settles first to avoid leaks and unhandled rejections.
 *
 * @param promise - Promise to race against the timeout
 * @param ms - Timeout in milliseconds
 * @param label - Label used in the timeout error message
 */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Item that passed skip logic and has a valid deliverySessionKey; grouped by session for parallel streams.
 */
type DeliverableItem = {
  notification: { _id: Id<"notifications"> };
  ctx: DeliveryContext;
};

/**
 * Merges outcome `o` into `agg` in place. Use for aggregating session stream results.
 */
function mergeOutcome(agg: DeliveryOutcome, o: DeliveryOutcome): void {
  agg.delivered += o.delivered;
  agg.failed += o.failed;
  agg.requiredNotificationRetryExhaustedCount +=
    o.requiredNotificationRetryExhaustedCount;
  agg.noResponseTerminalSkipCount += o.noResponseTerminalSkipCount;
  if (o.lastErrorMessage && !agg.lastErrorMessage) {
    agg.lastErrorMessage = o.lastErrorMessage;
  }
}

/**
 * Run one session stream: process items in order, aggregate outcomes, never reject.
 * On processOneNotification throw: markNotificationDeliveryEnded, merge failed outcome, return immediately.
 * Top-level try/catch ensures any uncaught exception (e.g. from markNotificationDeliveryEnded) is turned
 * into a returned outcome so Promise.allSettled only sees fulfilled results.
 *
 * @param client - Convex client
 * @param config - Runtime config
 * @param items - Deliverable items for this session (same deliverySessionKey), in order
 * @returns Aggregated DeliveryOutcome for this stream
 */
async function runSessionStream(
  client: ReturnType<typeof getConvexClient>,
  config: RuntimeConfig,
  items: DeliverableItem[],
): Promise<DeliveryOutcome> {
  const agg = zeroOutcome();
  let currentNotificationId: Id<"notifications"> | null = null;
  try {
    for (const { notification, ctx } of items) {
      currentNotificationId = notification._id;
      try {
        const { toolCapabilities, canModifyTaskStatus, isOrchestrator } =
          buildToolCapabilitiesForContext(ctx, config);
        const outcome = await processOneNotification(
          client,
          config,
          notification,
          ctx,
          toolCapabilities,
          canModifyTaskStatus,
          isOrchestrator,
        );
        mergeOutcome(agg, outcome);
      } catch (error) {
        const msg = messageOf(error);
        log.warn("Failed to deliver", notification._id, msg.slice(0, 200));
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
          log.warn(
            "Failed to mark notification delivery ended",
            notification._id,
            messageOf(markErr),
          );
        }
        mergeOutcome(agg, failedOutcome(msg));
        return agg;
      }
    }
    return agg;
  } catch (uncaught) {
    const msg = messageOf(uncaught);
    if (currentNotificationId) {
      try {
        await client.action(api.service.actions.markNotificationDeliveryEnded, {
          notificationId: currentNotificationId,
          serviceToken: config.serviceToken,
          accountId: config.accountId,
        });
      } catch {
        // best-effort; already in error path
      }
    }
    mergeOutcome(agg, failedOutcome(msg));
    return agg;
  }
}

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
          : fallbackDisabledReason(ctx.notification.type)
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

const NO_RESPONSE_FAILURES_MAP_MAX = 1000;

/**
 * Prunes oldest entries from state.noResponseFailures when at limit.
 * Called only from the main poll cycle after streams settle to avoid concurrent prune from multiple session streams.
 */
function pruneNoResponseFailuresIfNeeded(): void {
  if (state.noResponseFailures.size < NO_RESPONSE_FAILURES_MAP_MAX) return;
  const entries = [...state.noResponseFailures.entries()];
  entries.sort((a, b) => a[1].lastAt - b[1].lastAt);
  const toRemove = Math.ceil(NO_RESPONSE_FAILURES_MAP_MAX * 0.2);
  for (let i = 0; i < toRemove && i < entries.length; i++) {
    const entry = entries[i];
    if (entry) state.noResponseFailures.delete(entry[0]);
  }
}

/**
 * @internal Track retries for placeholder/empty OpenClaw responses.
 * Mutates state.noResponseFailures. Use for decision only; prefer outcome.attempt for logging when exhausted.
 * Prune is not done here; call pruneNoResponseFailuresIfNeeded() from the main flow after all session streams settle.
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

/** Reason string when fallback message is disabled for a notification type. */
function fallbackDisabledReason(notificationType: string): string {
  return `fallback disabled for notification type ${notificationType}`;
}

/**
 * Build tool capabilities and delivery flags for the current context (single source for canModifyTaskStatus, isOrchestrator).
 */
function buildToolCapabilitiesForContext(
  ctx: DeliveryContext,
  config: RuntimeConfig,
): {
  toolCapabilities: ToolCapabilitiesAndSchemas;
  canModifyTaskStatus: boolean;
  isOrchestrator: boolean;
} {
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
  return { toolCapabilities, canModifyTaskStatus, isOrchestrator };
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
    log.debug("Sending with tools", sendOptions.tools.length);
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
    log.warn("Failed to send tool results to OpenClaw", messageOf(err));
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
      skipReason = fallbackDisabledReason(ctx.notification.type);
    }
  }
  if (taskId && !out && result.toolCalls.length > 0) {
    skipReason = fallbackDisabledReason(ctx.notification.type);
  }
  return {
    textToPost: out,
    suppressAgentNotifications: suppress,
    skipMessageReason: skipReason,
  };
}

/**
 * Persists agent message when present, optionally advances task status, then marks notification delivered.
 * When skipStateUpdate is true (e.g. from processOneNotification), only Convex is updated; caller applies outcome.delivered to state.
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
  skipStateUpdate?: boolean,
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
        log.warn("Failed to auto-advance task status:", messageOf(error));
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
  if (skipStateUpdate) {
    await markNotificationDeliveredInConvex(client, config, notification._id);
  } else {
    await markDeliveredAndLog(client, config, notification._id);
  }
}

/**
 * Process a single notification: mark read, send to OpenClaw, handle no-response, persist message, mark delivered in Convex.
 * Does not mutate state.deliveredCount, state.failedCount, or other shared counters; only state.noResponseFailures (by notification id).
 * On retry (no-response) throws; caller catches and returns failed outcome. On success returns DeliveryOutcome for aggregation.
 *
 * @param client - Convex client
 * @param config - Runtime config
 * @param notification - Notification doc (at least _id)
 * @param ctx - Delivery context from getNotificationForDelivery
 * @param toolCapabilities - Precomputed tool capabilities for ctx
 * @param canModifyTaskStatus - Whether agent can change task status
 * @param isOrchestrator - Whether ctx.agent is the orchestrator
 * @returns DeliveryOutcome (delivered 0 or 1, failed 0, exhausted/terminal counts, lastErrorMessage)
 * @throws On no-response retry or other errors; caller calls markNotificationDeliveryEnded and returns failed outcome
 */
async function processOneNotification(
  client: ReturnType<typeof getConvexClient>,
  config: RuntimeConfig,
  notification: { _id: Id<"notifications"> },
  ctx: DeliveryContext,
  toolCapabilities: ToolCapabilitiesAndSchemas,
  canModifyTaskStatus: boolean,
  isOrchestrator: boolean,
): Promise<DeliveryOutcome> {
  let requiredNotificationRetryExhaustedCount = 0;
  let noResponseTerminalSkipCount = 0;

  try {
    await client.action(api.service.actions.markNotificationRead, {
      notificationId: notification._id,
      serviceToken: config.serviceToken,
      accountId: config.accountId,
    });
  } catch (err) {
    log.warn(
      "Failed to mark notification read",
      notification._id,
      messageOf(err),
    );
  }

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
      ctx.agent?.name,
    );
    clearNoResponseRetry(notification._id);
    await markNotificationDeliveredInConvex(client, config, notification._id);
    return {
      ...zeroOutcome(),
      delivered: 1,
    };
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
      ctx.agent?.name,
      `(attempt ${noResponseOutcome.attempt}/${NO_RESPONSE_RETRY_LIMIT})`,
    );
    throw new Error(noResponseOutcome.reason);
  }
  if (noResponseOutcome.exhausted) {
    requiredNotificationRetryExhaustedCount = 1;
    const attempt = noResponseOutcome.attempt ?? 0;
    log.warn(
      "OpenClaw returned no response; giving up",
      notification._id,
      ctx.agent?.name,
      taskId ? `taskId=${taskId}` : "taskId=none",
      `(attempt ${attempt}/${NO_RESPONSE_RETRY_LIMIT})`,
    );
  }
  if (noResponseOutcome.terminalSkip) {
    noResponseTerminalSkipCount = 1;
    log.info(
      "OpenClaw returned no response for non-actionable notification; skipping",
      notification._id,
      ctx.agent?.name,
      noResponseOutcome.skipMessageReason ?? "no response",
    );
  }
  clearNoResponseRetry(notification._id);

  let textToPost: string | null = noResponseOutcome.textToPost;
  let suppressAgentNotifications = noResponseOutcome.suppressAgentNotifications;
  let skipMessageReason: string | null = noResponseOutcome.skipMessageReason;
  textToPost = await executeToolCallsAndGetFinalText(
    result.toolCalls,
    ctx,
    config,
    toolCapabilities,
    isOrchestrator,
    textToPost,
  );
  const resolved = resolveFinalTextToPost(textToPost, result, ctx, taskId, {
    suppressAgentNotifications,
    skipMessageReason,
  });
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
    true, // skipStateUpdate: caller will apply outcome.delivered to state
  );

  return {
    delivered: 1,
    failed: 0,
    requiredNotificationRetryExhaustedCount,
    noResponseTerminalSkipCount,
    lastErrorMessage: null,
  };
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
 * Mark a notification as delivered in Convex only (no state update).
 * Used by processOneNotification so the caller can apply outcome.delivered to state.
 */
async function markNotificationDeliveredInConvex(
  client: ReturnType<typeof getConvexClient>,
  config: RuntimeConfig,
  notificationId: Id<"notifications">,
): Promise<void> {
  await client.action(api.service.actions.markNotificationDelivered, {
    notificationId,
    serviceToken: config.serviceToken,
    accountId: config.accountId,
  });
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
  await markNotificationDeliveredInConvex(client, config, notificationId);
  state.deliveredCount++;
  if (logReason) {
    log.info(logReason, notificationId);
  } else {
    log.debug("Delivered notification", notificationId);
  }
}

/**
 * @internal Single test seam for the poll body. Runs one full cycle: list undelivered, fetch
 * contexts in batches, apply skip logic, group deliverable by deliverySessionKey, then run
 * session streams in parallel (up to deliveryMaxConcurrentSessions). Within each session,
 * notifications are processed in order. Outcomes are aggregated and applied to state once.
 *
 * @param config - Runtime config (accountId, serviceToken, deliveryInterval, backoff, delivery*).
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
        limit: config.deliveryListLimit,
      },
    );

    state.consecutiveFailures = 0;
    if (notifications.length > 0) {
      log.info("Found", notifications.length, "notifications to deliver");
    }

    const batchSize = config.deliveryContextFetchBatchSize;
    const contexts: (DeliveryContext | null)[] = [];
    for (let i = 0; i < notifications.length; i += batchSize) {
      const chunk = notifications.slice(i, i + batchSize);
      const chunkContexts = await Promise.all(
        chunk.map((n) =>
          client.action(api.service.actions.getNotificationForDelivery, {
            notificationId: n._id,
            serviceToken: config.serviceToken,
            accountId: config.accountId,
          }),
        ),
      );
      contexts.push(...chunkContexts);
    }

    const deliverable: DeliverableItem[] = [];
    for (let i = 0; i < notifications.length; i++) {
      const notification = notifications[i];
      const ctx = contexts[i] ?? null;
      if (!ctx) continue;
      if (ctx.agent) {
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
        if (!ctx.deliverySessionKey) {
          await markDeliveredAndLog(
            client,
            config,
            notification._id,
            "Skipped delivery for missing session key",
          );
          continue;
        }
        deliverable.push({ notification, ctx });
      } else if (ctx.notification) {
        await markDeliveredAndLog(
          client,
          config,
          notification._id,
          "Skipped delivery for missing agent",
        );
      }
    }

    const groupBySession = new Map<string, DeliverableItem[]>();
    for (const item of deliverable) {
      const key = item.ctx.deliverySessionKey!;
      const list = groupBySession.get(key);
      if (list) list.push(item);
      else groupBySession.set(key, [item]);
    }

    // Delivery is parallelized by deliverySessionKey so one agent can work on multiple tasks at once;
    // within a session, notifications are processed in order.
    const sessionEntries = Array.from(groupBySession.entries());
    const agg = zeroOutcome();
    const maxConcurrent = config.deliveryMaxConcurrentSessions;
    const streamTimeoutMs = config.deliveryStreamTimeoutMs;
    for (let b = 0; b < sessionEntries.length; b += maxConcurrent) {
      const batch = sessionEntries.slice(b, b + maxConcurrent);
      const streamPromises = batch.map(([sessionKey, items]) =>
        withTimeout(
          runSessionStream(client, config, items),
          streamTimeoutMs,
          sessionKey,
        ),
      );
      const results = await Promise.allSettled(streamPromises);
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.status === "fulfilled") {
          mergeOutcome(agg, r.value);
        } else {
          // Rejections only from withTimeout; runSessionStream never rejects. Each counts as one failed outcome.
          const sessionKey = batch[i]?.[0] ?? "(unknown)";
          log.warn(
            "Session stream timed out or failed",
            sessionKey,
            messageOf(r.reason).slice(0, 200),
          );
          mergeOutcome(agg, failedOutcome(messageOf(r.reason)));
        }
      }
    }

    state.deliveredCount += agg.delivered;
    state.failedCount += agg.failed;
    state.requiredNotificationRetryExhaustedCount +=
      agg.requiredNotificationRetryExhaustedCount;
    state.noResponseTerminalSkipCount += agg.noResponseTerminalSkipCount;
    if (agg.failed > 0) {
      state.lastErrorAt = Date.now();
      state.lastErrorMessage = agg.lastErrorMessage ?? null;
      state.consecutiveFailures += 1;
    }

    pruneNoResponseFailuresIfNeeded();

    state.lastDelivery = Date.now();
    const pollDuration = Date.now() - pollStart;
    if (notifications.length > 0) {
      recordSuccess("delivery.poll", pollDuration);
    }
  } catch (error) {
    state.consecutiveFailures++;
    state.lastErrorAt = Date.now();
    const msg = messageOf(error);
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : error instanceof Error && error.cause != null
          ? String(error.cause)
          : null;
    const rawMessage = cause ? `${msg} (cause: ${cause})` : msg;
    state.lastErrorMessage = sanitizeErrorMessage(rawMessage);
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
