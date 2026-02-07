import { getConvexClient, api } from "./convex-client";
import { backoffMs } from "./backoff";
import { RuntimeConfig } from "./config";
import {
  buildNoResponseFallbackMessage,
  parseNoResponsePlaceholder,
  sendOpenClawToolResults,
  sendToOpenClaw,
} from "./gateway";
import { createLogger } from "./logger";
import {
  getToolCapabilitiesAndSchemas,
  executeAgentTool,
  type ToolCapabilitiesAndSchemas,
} from "./tooling/agentTools";
import { recordSuccess, recordFailure } from "./metrics";
import { HEARTBEAT_OK_RESPONSE } from "./heartbeat-constants";

const log = createLogger("[Delivery]");

/**
 * Context passed from getNotificationForDelivery (Convex service).
 * Mirrors the return shape of service/notifications.getForDelivery for type safety.
 */
export interface DeliveryContext {
  notification: {
    _id: string;
    type: string;
    title: string;
    body: string;
    recipientId?: string;
    recipientType?: "user" | "agent";
    taskId?: string;
    messageId?: string;
    accountId: string;
  };
  agent: {
    _id: string;
    sessionKey?: string;
    role?: string;
    name?: string;
  } | null;
  task: {
    _id: string;
    status: string;
    title: string;
    description?: string;
    assignedAgentIds?: string[];
    labels?: string[];
  } | null;
  message: {
    _id: string;
    authorType: string;
    authorId: string;
    content?: string;
  } | null;
  thread: Array<{
    messageId: string;
    authorType: string;
    authorId: string;
    authorName: string | null;
    content: string;
    createdAt: number;
  }>;
  sourceNotificationType: string | null;
  orchestratorAgentId: string | null;
  primaryUserMention: { id: string; name: string; email: string | null } | null;
  mentionableAgents: Array<{
    id: string;
    slug: string;
    name: string;
    role: string;
  }>;
  assignedAgents: Array<{
    id: string;
    slug: string;
    name: string;
    role: string;
  }>;
  effectiveBehaviorFlags?: {
    canCreateTasks?: boolean;
    canModifyTaskStatus?: boolean;
    canCreateDocuments?: boolean;
    canMentionAgents?: boolean;
  };
  repositoryDoc: { title: string; content: string } | null;
  globalBriefingDoc: { title: string; content: string } | null;
  taskOverview: {
    totals: Array<{ status: string; count: number }>;
    topTasks: Array<{
      status: string;
      tasks: Array<{
        taskId: string;
        title: string;
        status: string;
        priority: number;
        assignedAgentIds: string[];
        assignedUserIds: string[];
      }>;
    }>;
  } | null;
}

/** Posted when tool execution ran but no final reply was received (e.g. follow-up request failed). */
const FALLBACK_NO_REPLY_AFTER_TOOLS = [
  "**Summary**",
  "- Tool(s) were executed; the final reply could not be retrieved.",
  "",
  "**Work done**",
  "- Executed tool calls for this notification.",
  "",
  "**Artifacts**",
  "- None.",
  "",
  "**Risks / blockers**",
  "- If a tool reported an error (success: false), consider the task BLOCKED and do not claim status was changed.",
  "",
  "**Next step (one)**",
  "- Retry once the runtime or gateway is healthy.",
  "",
  "**Sources**",
  "- None.",
].join("\n");

const NO_RESPONSE_RETRY_LIMIT = 3;
const NO_RESPONSE_RETRY_RESET_MS = 10 * 60 * 1000;
const NO_REPLY_SIGNAL_VALUES = new Set([
  "NO_REPLY",
  "NO",
  "NO_",
  HEARTBEAT_OK_RESPONSE,
]);

/**
 * Detect explicit "no reply" signals from OpenClaw output.
 */
function isNoReplySignal(value: string): boolean {
  return NO_REPLY_SIGNAL_VALUES.has(value.trim());
}

interface DeliveryState {
  isRunning: boolean;
  lastDelivery: number | null;
  deliveredCount: number;
  failedCount: number;
  consecutiveFailures: number;
  lastErrorAt: number | null;
  lastErrorMessage: string | null;
  noResponseFailures: Map<string, { count: number; lastAt: number }>;
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
            const flags = context.effectiveBehaviorFlags ?? {};
            const hasTask = !!context?.task;
            const canModifyTaskStatus = flags.canModifyTaskStatus !== false;
            const canCreateTasks = flags.canCreateTasks === true;
            const canCreateDocuments = flags.canCreateDocuments === true;
            const canMentionAgents = flags.canMentionAgents === true;
            const hasQaAgent = context.mentionableAgents.some((agent) =>
              isQaAgentProfile(agent),
            );
            const currentAgentProfile = context.mentionableAgents.find(
              (agent) => agent.id === context.agent?._id,
            );
            const isOrchestrator =
              context.orchestratorAgentId != null &&
              context.agent._id === context.orchestratorAgentId;
            const canMarkDone = canAgentMarkDone({
              taskStatus: context.task?.status,
              agentRole: currentAgentProfile?.role ?? context.agent?.role,
              agentSlug: currentAgentProfile?.slug,
              isOrchestrator,
              hasQaAgent,
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

            let textToPost: string | null = result.text?.trim() ?? null;
            let suppressAgentNotifications = false;
            let shouldPostMessage = true;
            const taskId = context.notification?.taskId;
            const noResponsePlaceholder = textToPost
              ? parseNoResponsePlaceholder(textToPost)
              : null;
            const isNoReply = textToPost ? isNoReplySignal(textToPost) : false;
            const isHeartbeatOk = textToPost?.trim() === HEARTBEAT_OK_RESPONSE;
            if ((isNoReply || isHeartbeatOk) && result.toolCalls.length === 0) {
              log.info(
                isHeartbeatOk
                  ? "OpenClaw returned HEARTBEAT_OK; skipping notification"
                  : "OpenClaw returned NO_REPLY; skipping notification",
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
            const needsRetry =
              result.toolCalls.length === 0 &&
              (!textToPost || noResponsePlaceholder?.isPlaceholder);
            if (needsRetry) {
              const reason = !textToPost
                ? "empty response"
                : "placeholder response";
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
                `${reason} (attempt ${decision.attempt}/${NO_RESPONSE_RETRY_LIMIT})`,
              );
              if (taskId) {
                textToPost = buildNoResponseFallbackMessage(
                  noResponsePlaceholder?.mentionPrefix,
                );
                suppressAgentNotifications = true;
                shouldPostMessage = false;
              } else {
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
                  const finalText = await sendOpenClawToolResults(
                    context.agent.sessionKey,
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
                log.warn(
                  "OpenClaw placeholder response received; suppressing fallback",
                  notification._id,
                  context.agent.name,
                );
                textToPost = buildNoResponseFallbackMessage(
                  placeholder.mentionPrefix,
                );
                suppressAgentNotifications = true;
                shouldPostMessage = false;
              }
            }
            if (taskId && !textToPost && result.toolCalls.length > 0) {
              textToPost = FALLBACK_NO_REPLY_AFTER_TOOLS;
              suppressAgentNotifications = true;
              shouldPostMessage = false;
              log.warn(
                "No reply after tool execution; suppressing fallback message",
                notification._id,
              );
            }
            if (taskId && textToPost && shouldPostMessage) {
              await client.action(api.service.actions.createMessageFromAgent, {
                agentId: context.agent._id,
                taskId,
                content: textToPost.trim(),
                serviceToken: config.serviceToken,
                accountId: config.accountId,
                sourceNotificationId: notification._id,
                suppressAgentNotifications,
              });
              if (
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
      const pollDuration = Date.now() - pollStart;
      if (notifications.length > 0) {
        recordSuccess("delivery.poll", pollDuration);
      }
    } catch (error) {
      state.consecutiveFailures++;
      state.lastErrorAt = Date.now();
      state.lastErrorMessage =
        error instanceof Error ? error.message : String(error);
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

/** Task statuses for which we skip delivering status_change to agents to avoid ack storms. */
const TASK_STATUSES_SKIP_STATUS_CHANGE = new Set(["done", "blocked"]);
const ORCHESTRATOR_CHAT_LABEL = "system:orchestrator-chat";

/**
 * Check whether a task is the orchestrator chat thread.
 */
function isOrchestratorChatTask(
  task: DeliveryContext["task"] | null | undefined,
): boolean {
  return !!task?.labels?.includes(ORCHESTRATOR_CHAT_LABEL);
}

/**
 * Decide whether a notification should be delivered to an agent.
 * Mention notifications are always delivered (including when task is DONE) so the
 * mentioned agent can reply once to a direct request (e.g. push PR).
 * Skips status_change notifications to agents when task is DONE or BLOCKED to avoid
 * acknowledgment storms (each agent replying to "task status changed to done").
 * For REVIEW, only deliver status_change to reviewer roles or the orchestrator to avoid
 * redundant review confirmations from every assignee.
 * Skips agent-authored thread_update unless the recipient is assigned, or in review
 * as a reviewer; skips thread_update when task is DONE or BLOCKED to avoid reply loops.
 *
 * @param context - Delivery context from getNotificationForDelivery (notification, task, message, thread, flags).
 * @returns true if the notification should be sent to the agent, false to skip (and mark delivered).
 */
export function shouldDeliverToAgent(context: DeliveryContext): boolean {
  const notificationType = context.notification?.type;
  const messageAuthorType = context.message?.authorType;
  const taskStatus = context.task?.status;
  const isOrchestratorChat = isOrchestratorChatTask(context.task);
  const orchestratorAgentId = context.orchestratorAgentId;

  if (isOrchestratorChat && context.notification?.recipientType === "agent") {
    return context.notification?.recipientId === context.orchestratorAgentId;
  }

  if (
    notificationType === "status_change" &&
    context.notification?.recipientType === "agent" &&
    taskStatus != null
  ) {
    if (TASK_STATUSES_SKIP_STATUS_CHANGE.has(taskStatus)) {
      return false;
    }
    if (taskStatus === "review") {
      const recipientId = context.notification?.recipientId;
      if (orchestratorAgentId != null && recipientId === orchestratorAgentId) {
        return true;
      }
      return isReviewerRole(context.agent?.role);
    }
  }

  if (notificationType === "thread_update" && messageAuthorType === "agent") {
    const recipientId = context.notification?.recipientId;
    const assignedAgentIds = context.task?.assignedAgentIds;
    const sourceNotificationType = context.sourceNotificationType;
    const agentRole = context.agent?.role;
    if (
      taskStatus != null &&
      TASK_STATUSES_SKIP_STATUS_CHANGE.has(taskStatus)
    ) {
      return false;
    }
    if (sourceNotificationType === "thread_update") {
      return false;
    }
    if (orchestratorAgentId != null && recipientId === orchestratorAgentId) {
      return true;
    }
    if (taskStatus === "review" && isReviewerRole(agentRole)) {
      return true;
    }
    if (!Array.isArray(assignedAgentIds) || typeof recipientId !== "string")
      return false;
    return assignedAgentIds.includes(recipientId);
  }

  return true;
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

/**
 * Check whether an agent role indicates a reviewer (e.g., Squad Lead or QA).
 */
function isReviewerRole(role: string | undefined): boolean {
  if (!role) return false;
  return /squad lead|qa|review/i.test(role);
}

/**
 * Check whether an agent role or slug indicates QA.
 */
function isQaAgentProfile(
  profile?: {
    role?: string;
    slug?: string;
  } | null,
): boolean {
  if (!profile) return false;
  const role = profile.role ?? "";
  const slug = profile.slug ?? "";
  if (slug.trim().toLowerCase() === "qa") return true;
  return /\bqa\b|quality assurance|quality\b/i.test(role);
}

/**
 * Determine if an agent can mark a task as done.
 * Requires the task to be in review. When QA exists, only QA can close.
 */
export function canAgentMarkDone(options: {
  taskStatus?: string;
  agentRole?: string;
  agentSlug?: string;
  isOrchestrator: boolean;
  hasQaAgent: boolean;
}): boolean {
  if (options.taskStatus !== "review") return false;
  if (options.hasQaAgent) {
    return isQaAgentProfile({
      role: options.agentRole,
      slug: options.agentSlug,
    });
  }
  return options.isOrchestrator;
}

interface MentionableAgent {
  id: string;
  slug: string;
  name: string;
  role: string;
}

interface PrimaryUserMention {
  id: string;
  name: string;
  email: string | null;
}

/**
 * Renders the mentionable agents list for the prompt (capped for size).
 * If there are more than the cap, appends "and N more".
 */
function formatMentionableAgentsSection(
  mentionableAgents: MentionableAgent[],
): string {
  if (!Array.isArray(mentionableAgents) || mentionableAgents.length === 0)
    return "";
  const cap = MENTIONABLE_AGENTS_CAP;
  const shown = mentionableAgents.slice(0, cap);
  const lines = shown.map((a) => {
    const slug = (a.slug || "").trim();
    if (slug) return `- @${slug} - ${a.name} (${a.role})`;
    const name = (a.name || "").replace(/"/g, "").trim();
    return name
      ? `- @\"${name}\" - ${a.name} (${a.role})`
      : `- ${a.name} (${a.role})`;
  });
  const more =
    mentionableAgents.length > cap
      ? `\n- ... and ${mentionableAgents.length - cap} more`
      : "";
  return [
    "Agents available for response_request:",
    ...lines,
    more,
    "",
    "If you need another agent to respond, use the response_request tool with their slug. @mentions do not notify agents.",
  ].join("\n");
}

/**
 * Renders the primary user mention instructions when available.
 */
function formatPrimaryUserMentionSection(
  primaryUser: PrimaryUserMention | null,
): string {
  if (!primaryUser) return "";
  const name = primaryUser.name.replace(/"/g, "").trim();
  const mention = name ? `@\"${name}\"` : "";
  const line = mention
    ? `- ${mention} - ${primaryUser.name}`
    : `- ${primaryUser.name}`;
  return [
    "User to mention if blocked or confirmation needed:",
    line,
    "",
    "If you are blocked or need confirmation, @mention the user above.",
  ].join("\n");
}

/**
 * Format thread context for delivery. Keeps only the last THREAD_MAX_MESSAGES messages
 * and truncates each message to THREAD_MAX_CHARS_PER_MESSAGE to avoid context overflow.
 */
function formatThreadContext(
  thread: DeliveryContext["thread"] | undefined,
): string {
  if (!thread || thread.length === 0) return "";
  const take =
    thread.length > THREAD_MAX_MESSAGES
      ? thread.slice(-THREAD_MAX_MESSAGES)
      : thread;
  const omitted = thread.length - take.length;
  const lines = [
    "Thread history (recent):",
    ...(omitted > 0
      ? [
          `(... ${omitted} older message${omitted === 1 ? "" : "s"} omitted)`,
          "",
        ]
      : []),
  ];
  for (const item of take) {
    const authorLabel =
      item.authorName ?? `${item.authorType}:${item.authorId}`;
    const timestamp = item.createdAt
      ? new Date(item.createdAt).toISOString()
      : "unknown_time";
    const raw = item.content?.trim() || "(empty)";
    const content =
      raw.length <= THREAD_MAX_CHARS_PER_MESSAGE
        ? raw
        : truncateForContext(raw, THREAD_MAX_CHARS_PER_MESSAGE);
    lines.push(`- [${timestamp}] ${authorLabel}: ${content}`);
  }
  return lines.join("\n");
}

/**
 * Format the compact task overview for orchestrator prompts.
 */
function formatTaskOverview(
  overview: DeliveryContext["taskOverview"] | null | undefined,
  mentionableAgents: MentionableAgent[],
): string {
  if (!overview) return "";
  const agentLabels = new Map(
    mentionableAgents.map((agent) => [
      agent.id,
      (agent.slug ?? "").trim() || agent.name,
    ]),
  );
  const totals = overview.totals
    .map((entry) => `${entry.status}=${entry.count}`)
    .join("; ");
  const lines = [
    "Task overview (compact):",
    `Totals (sampled per status): ${totals}`,
  ];
  for (const group of overview.topTasks) {
    if (!group.tasks.length) continue;
    lines.push(`- ${group.status}:`);
    for (const task of group.tasks) {
      const agentMentions = (task.assignedAgentIds ?? [])
        .map((agentId) => agentLabels.get(agentId) ?? agentId)
        .map((label) => (label.includes(" ") ? `"${label}"` : label))
        .join(", ");
      const assigneeSuffix = agentMentions
        ? ` (assignees: ${agentMentions})`
        : "";
      const userCount = task.assignedUserIds?.length ?? 0;
      const userSuffix = userCount ? `; users=${userCount}` : "";
      lines.push(
        `  - P${task.priority} ${task.title} [${task.taskId}]${assigneeSuffix}${userSuffix}`,
      );
    }
  }
  return lines.join("\n");
}

/**
 * Build capability labels for HTTP fallback mode (no client-side tools).
 */
function buildHttpCapabilityLabels(options: {
  canCreateTasks: boolean;
  canModifyTaskStatus: boolean;
  canCreateDocuments: boolean;
  hasTaskContext: boolean;
  canMentionAgents: boolean;
  isOrchestrator?: boolean;
}): string[] {
  const labels: string[] = [];
  if (options.hasTaskContext && options.canModifyTaskStatus) {
    labels.push("change task status via HTTP (POST /agent/task-status)");
  }
  if (options.canCreateTasks) {
    labels.push("create tasks via HTTP (POST /agent/task-create)");
  }
  if (options.canCreateDocuments) {
    labels.push("create/update documents via HTTP (POST /agent/document)");
  }
  if (options.hasTaskContext && options.canMentionAgents) {
    labels.push("request agent responses via HTTP (POST /agent/response-request)");
  }
  labels.push("load task details via HTTP (POST /agent/task-load)");
  labels.push("query agent skills via HTTP (POST /agent/get-agent-skills)");
  if (options.isOrchestrator) {
    labels.push("assign agents via HTTP (POST /agent/task-assign)");
    labels.push("list tasks via HTTP (POST /agent/task-list)");
    labels.push("get task details via HTTP (POST /agent/task-get)");
    labels.push("read task threads via HTTP (POST /agent/task-thread)");
    labels.push("search tasks via HTTP (POST /agent/task-search)");
    labels.push("post task messages via HTTP (POST /agent/task-message)");
    labels.push("archive tasks via HTTP (POST /agent/task-delete)");
    labels.push("link tasks to PRs via HTTP (POST /agent/task-link-pr)");
  }
  return labels;
}

const MENTIONABLE_AGENTS_CAP = 25;

/** Max thread messages to include in notification prompt (oldest dropped) to avoid context overflow. */
const THREAD_MAX_MESSAGES = 25;
/** Max characters per thread message; longer content is truncated with "…". */
const THREAD_MAX_CHARS_PER_MESSAGE = 1500;
/** Max characters for task description block. */
const TASK_DESCRIPTION_MAX_CHARS = 4000;
/** Max characters for repository context body. */
const REPOSITORY_CONTEXT_MAX_CHARS = 12000;
/** Max characters for global context section. */
const GLOBAL_CONTEXT_MAX_CHARS = 4000;

/**
 * Truncate text to maxChars, appending "…" when trimmed. Returns unchanged if within limit.
 */
function truncateForContext(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return value.slice(0, Math.max(0, maxChars - 1)).trimEnd() + "…";
}

/**
 * Format notification message for OpenClaw (identity line, capabilities, task context, status instructions).
 * Exported for unit tests.
 *
 * @param context - Delivery context (notification, task, message, thread, repositoryDoc, agents, behavior flags).
 * @param taskStatusBaseUrl - Base URL the agent can use for task-status HTTP fallback (e.g. http://runtime:3000 in Docker).
 * @param toolCapabilities - Capability labels and hasTaskStatus for prompt; must match tools sent to OpenClaw.
 */
export function formatNotificationMessage(
  context: DeliveryContext,
  taskStatusBaseUrl: string,
  toolCapabilities: ToolCapabilitiesAndSchemas,
): string {
  const {
    notification,
    task,
    message,
    thread,
    repositoryDoc,
    globalBriefingDoc,
    taskOverview,
    mentionableAgents = [],
    primaryUserMention = null,
    effectiveBehaviorFlags = {},
    orchestratorAgentId = null,
  } = context;
  const flags = context.effectiveBehaviorFlags ?? {};
  const canModifyTaskStatus = flags.canModifyTaskStatus !== false;
  const canCreateTasks = flags.canCreateTasks === true;
  const canCreateDocuments = flags.canCreateDocuments === true;
  const canMentionAgents = flags.canMentionAgents === true;
  const isOrchestrator =
    orchestratorAgentId != null && context.agent?._id === orchestratorAgentId;
  const hasRuntimeTools = toolCapabilities.schemas.length > 0;
  const runtimeBaseUrl = taskStatusBaseUrl.replace(/\/$/, "");
  const sessionKey = context.agent?.sessionKey ?? "<session-key>";

  const capabilityLabels = [...toolCapabilities.capabilityLabels];
  const capabilitiesBlock =
    capabilityLabels.length > 0
      ? `Runtime capabilities: ${capabilityLabels.join("; ")}. Use only the runtime capabilities listed here. If a runtime tool or HTTP fallback fails, report BLOCKED with the error message.\n\n`
      : "Runtime capabilities: none. If asked to create tasks, change status, or create documents, report BLOCKED.\n\n";

  const agentName = context.agent?.name?.trim() || "Agent";
  const agentRole = context.agent?.role?.trim() || "Unknown role";
  const identityLine = `You are replying as: **${agentName}** (${agentRole}). Reply only as this agent; do not speak as or ask whether you are another role.\n\n`;

  const taskDescription = task?.description?.trim()
    ? `Task description:\n${truncateForContext(task.description.trim(), TASK_DESCRIPTION_MAX_CHARS)}`
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
    "Writable clone (use for all git work): /root/clawd/repos/openclaw-mission-control. Before starting, run `git fetch origin` and `git pull --ff-only`.";
  const repositoryDetails = repositoryDoc?.content?.trim()
    ? [
        "Repository context:",
        truncateForContext(
          repositoryDoc.content.trim(),
          REPOSITORY_CONTEXT_MAX_CHARS,
        ),
        localRepoHint,
        "",
        "Use the repository context above as the default codebase. Do not ask which repo to use.",
        "Prefer the local writable clone; use it for branch, commit, push, and gh pr create. PRs must target `dev` (use `--base dev`, not master).",
        "To inspect the repo tree, use exec (e.g., `ls /root/clawd/repos/openclaw-mission-control`) and only use read on files.",
        "Write artifacts to `/root/clawd/deliverables` and reference them in the thread.",
      ].join("\n")
    : [
        "Repository context: not found.",
        localRepoHint,
        "Prefer the local writable clone; use it for branch, commit, push, and gh pr create. PRs must target `dev` (use `--base dev`, not master).",
        "To inspect the repo tree, use exec (e.g., `ls /root/clawd/repos/openclaw-mission-control`) and only use read on files.",
        "Write artifacts to `/root/clawd/deliverables` and reference them in the thread.",
      ].join("\n");
  const globalContextSection = globalBriefingDoc?.content?.trim()
    ? [
        "Global Context:",
        truncateForContext(
          globalBriefingDoc.content.trim(),
          GLOBAL_CONTEXT_MAX_CHARS,
        ),
        "",
      ].join("\n")
    : "";
  const taskOverviewSection = formatTaskOverview(
    taskOverview,
    mentionableAgents,
  );

  const hasQaAgent = context.mentionableAgents.some((agent) =>
    isQaAgentProfile(agent),
  );
  const isOrchestratorChat = isOrchestratorChatTask(task);
  const qaReviewNote = hasQaAgent
    ? " When QA is configured, only QA can mark tasks as done after review passes."
    : "";
  const doneRestrictionNote = toolCapabilities.canMarkDone
    ? ""
    : hasQaAgent
      ? " You are not allowed to mark tasks as done; QA must approve and close the task."
      : " You are not allowed to mark tasks as done; ask the orchestrator if a task should be closed.";
  const statusInstructions = task
    ? canModifyTaskStatus
      ? hasRuntimeTools && toolCapabilities.hasTaskStatus
        ? `If you need to change task status, do it BEFORE posting a thread update. Only move to a valid next status from the current one (assigned -> in_progress, in_progress -> review, review -> done or back to in_progress; use blocked only when blocked). Do not move directly to done unless the current status is review.${qaReviewNote} You have the **task_status** tool (see Capabilities) — call it with taskId, status (in_progress|review${toolCapabilities.canMarkDone ? "|done" : ""}|blocked), and blockedReason when status is blocked. Do NOT decide tool availability based on whether your UI lists it; if Capabilities includes task_status, you can call it. If you request a valid target status that isn't the next immediate step, the runtime may auto-apply required intermediate transitions (e.g. assigned -> in_progress -> review) when possible. If a tool returns an error, do not claim you changed status; report BLOCKED and include the error message. As a last resort (manual/CLI), you can call the HTTP fallback: POST ${runtimeBaseUrl}/agent/task-status with header \`x-openclaw-session-key: ${sessionKey}\` and JSON body \`{ "taskId": "<Task ID above>", "status": "<next valid status>", "blockedReason": "..." }\`. Note: inbox/assigned are handled by assignment changes, not this tool. If you have no way to update status (tool fails and HTTP is unreachable), do not post a completion summary; report BLOCKED and state that you could not update task status.${doneRestrictionNote}`
        : `If you need to change task status, do it BEFORE posting a thread update. Only move to a valid next status from the current one (assigned -> in_progress, in_progress -> review, review -> done or back to in_progress; use blocked only when blocked). Do not move directly to done unless the current status is review.${qaReviewNote} Use the HTTP fallback: POST ${runtimeBaseUrl}/agent/task-status with header \`x-openclaw-session-key: ${sessionKey}\` and JSON body \`{ "taskId": "<Task ID above>", "status": "<next valid status>", "blockedReason": "..." }\`. Note: inbox/assigned are handled by assignment changes, not this endpoint. If the HTTP call fails, report BLOCKED and include the error message.${doneRestrictionNote}`
      : "You are not allowed to change task status. If asked to change or close this task, report BLOCKED and explain that status updates are not permitted for you."
    : "";
  const taskCreateInstructions = canCreateTasks
    ? hasRuntimeTools
      ? `If you need to create tasks, use the **task_create** tool (see Capabilities). You can include assignee slugs via \`assigneeSlugs\` to assign on creation. If the tool fails, use the HTTP fallback: POST ${runtimeBaseUrl}/agent/task-create with header \`x-openclaw-session-key: ${sessionKey}\` and JSON body \`{ "title": "...", "description": "...", "priority": 3, "labels": ["..."], "status": "inbox|assigned|in_progress|review|done|blocked", "blockedReason": "...", "dueDate": 1700000000000, "assigneeSlugs": ["qa"] }\`.`
      : `If you need to create tasks, use the HTTP fallback: POST ${runtimeBaseUrl}/agent/task-create with header \`x-openclaw-session-key: ${sessionKey}\` and JSON body \`{ "title": "...", "description": "...", "priority": 3, "labels": ["..."], "status": "inbox|assigned|in_progress|review|done|blocked", "blockedReason": "...", "dueDate": 1700000000000, "assigneeSlugs": ["qa"] }\`.`
    : "";
  const documentInstructions = canCreateDocuments
    ? hasRuntimeTools
      ? `If you need to create or update documents, use the **document_upsert** tool (see Capabilities). This is the document sharing tool — always use it so the primary user can see the doc, and include the returned documentId and a Markdown link in your reply: \`[Document](/document/<documentId>)\`. If the tool fails, use the HTTP fallback: POST ${runtimeBaseUrl}/agent/document with header \`x-openclaw-session-key: ${sessionKey}\` and JSON body \`{ "title": "...", "content": "...", "type": "deliverable|note|template|reference", "taskId": "<Task ID above>" }\`.`
      : `If you need to create or update documents, use the HTTP fallback: POST ${runtimeBaseUrl}/agent/document with header \`x-openclaw-session-key: ${sessionKey}\` and JSON body \`{ "title": "...", "content": "...", "type": "deliverable|note|template|reference", "taskId": "<Task ID above>" }\`. Always include the returned documentId and a Markdown link in your reply: \`[Document](/document/<documentId>)\`.`
    : "";
  const responseRequestInstructions = canMentionAgents
    ? hasRuntimeTools
      ? "If you need another agent to respond, use the **response_request** tool (see Capabilities). Provide recipientSlugs and a clear message."
      : `If you need another agent to respond, use the HTTP fallback: POST ${runtimeBaseUrl}/agent/response-request with header \`x-openclaw-session-key: ${sessionKey}\` and JSON body \`{ "taskId": "<Task ID above>", "recipientSlugs": ["agent-slug"], "message": "..." }\`.`
    : "";
  const orchestratorToolInstructions = isOrchestrator
    ? hasRuntimeTools
      ? "Orchestrator tools: use task_list for task snapshots, task_get for details, task_thread for recent thread context, task_search to find related work, task_assign to add agent assignees by slug, task_message to post updates to other tasks, task_delete to archive tasks, and task_link_pr to connect tasks to PRs. Include a taskId for task_get, task_thread, task_assign, task_message, task_delete, and task_link_pr. If any tool fails, report BLOCKED and include the error message."
      : `Orchestrator tools are unavailable. Use the HTTP fallback endpoints: task_list (POST ${runtimeBaseUrl}/agent/task-list), task_get (POST ${runtimeBaseUrl}/agent/task-get), task_thread (POST ${runtimeBaseUrl}/agent/task-thread), task_search (POST ${runtimeBaseUrl}/agent/task-search), task_assign (POST ${runtimeBaseUrl}/agent/task-assign), task_message (POST ${runtimeBaseUrl}/agent/task-message), task_delete (POST ${runtimeBaseUrl}/agent/task-delete), and task_link_pr (POST ${runtimeBaseUrl}/agent/task-link-pr). Include header \`x-openclaw-session-key: ${sessionKey}\` and the JSON body described in the tool schemas.`
    : "";
  const orchestratorChatInstruction =
    isOrchestrator && isOrchestratorChat
      ? "Orchestrator chat is coordination-only. Do not start executing tasks from this thread. When you suggest tasks, immediately assign agents using task_assign or create tasks with assigneeSlugs before asking them to work. If you plan to work on a task yourself, create/assign it to yourself and move the discussion to that task thread."
      : "";
  const followupTaskInstruction =
    isOrchestrator && task
      ? `\nOrchestrator note: If this task needs follow-up work, create those follow-up tasks before moving this task to done. If any PRs were reopened, merge them before moving this task to done.${canCreateTasks ? (hasRuntimeTools ? " Use the task_create tool." : ` Use the HTTP fallback (${runtimeBaseUrl}/agent/task-create).`) : " If task creation is not permitted, state the follow-ups needed and ask the primary user to create them."}`
      : "";
  const largeResultInstruction = canCreateDocuments
    ? hasRuntimeTools
      ? "If the result is large, create a document with document_upsert (document sharing tool), include the returned documentId and a Markdown link ([Document](/document/<documentId>)) in your reply, and summarize it here."
      : "If the result is large, create a document via the HTTP fallback (/agent/document), include the returned documentId and a Markdown link ([Document](/document/<documentId>)) in your reply, and summarize it here."
    : "If the result is large, summarize it here (document creation not permitted).";

  const mentionableSection = canMentionAgents
    ? formatMentionableAgentsSection(mentionableAgents)
    : "";

  /** For assignment notifications: how to ask for clarification (orchestrator if available, else primary user). */
  const assignmentClarificationTarget =
    notification?.type === "assignment"
      ? canMentionAgents &&
        orchestratorAgentId &&
        mentionableAgents.some((a) => a.id === orchestratorAgentId)
        ? (() => {
            const orch = mentionableAgents.find(
              (a) => a.id === orchestratorAgentId,
            );
            if (!orch)
              return "For clarification questions, @mention the primary user (shown above).";
            const orchLabel =
              (orch.slug ?? "").trim() || orch.name || "orchestrator";
            return `For clarification questions, ask in the thread and use response_request to the orchestrator (${orchLabel}) if you need an explicit response.`;
          })()
        : primaryUserMention
          ? "For clarification questions, @mention the primary user (shown above)."
          : "If you need clarification, ask in the thread."
      : "";

  const assignmentAckBlock =
    notification?.type === "assignment"
      ? `\n**Assignment — first reply only:** Reply with a short acknowledgment (1–2 sentences). ${assignmentClarificationTarget} Ask any clarifying questions now; do not use the full Summary/Work done/Artifacts format in this first reply. Begin substantive work only after this acknowledgment.\n`
      : "";

  // Disambiguate from other tasks in this agent's session: one session is shared across all tasks,
  // so the model must respond only to this notification's task/thread, not to older turns in history.
  const thisTaskAnchor = task
    ? `\n**Respond only to this notification.** Task ID: \`${task._id}\` — ${task.title} (${task.status}). Ignore any other task or thread in the conversation history; the only task and thread that matter for your reply are below.\n`
    : "\n**Respond only to this notification.** Ignore any other task or thread in the conversation history.\n";

  // Status-specific instructions: done (brief reply once), blocked (reply-loop fix — do not continue substantive work until unblocked).
  return `
${identityLine}${capabilitiesBlock}${thisTaskAnchor}## Notification: ${notification.type}

**${notification.title}**

${notification.body}

${task ? `Task: ${task.title} (${task.status})\nTask ID: ${task._id}` : ""}
${taskDescription}
${repositoryDetails}
${globalContextSection}
${taskOverviewSection}
${messageDetails}
${threadDetails}
${mentionableSection}
${formatPrimaryUserMentionSection(primaryUserMention)}

Use only the thread history shown above for this task; do not refer to or reply about any other task (e.g. another task ID or PR) from your conversation history. Do not request items already present in the thread above.
If the latest message is from another agent and does not ask you to do anything (no request, no question, no action for you), respond with the single token NO_REPLY and nothing else. Do not use NO_REPLY for assignment notifications or when the message explicitly asks you to act.

Important: This system captures only one reply per notification. Do not send progress updates. If you spawn subagents or run long research, wait for their results and include the final output in this reply. ${largeResultInstruction}

${statusInstructions}
${taskCreateInstructions}
${documentInstructions}
${responseRequestInstructions}
${orchestratorToolInstructions}
${orchestratorChatInstruction}
${followupTaskInstruction}
${task?.status === "review" && toolCapabilities.canMarkDone ? '\nIf you are accepting this task as done, you MUST update status to "done" (tool or endpoint) before posting. If you cannot (tool unavailable or endpoint unreachable), report BLOCKED — do not post a "final summary" or claim the task is DONE.' : ""}
${task?.status === "done" ? "\nThis task is DONE. You were explicitly mentioned — reply once briefly (1–2 sentences) to the request (e.g. confirm you will push the PR or take the asked action). Do not use the full Summary/Work done/Artifacts format. Do not reply again to this thread after that." : ""}
${task?.status === "blocked" ? "\nThis task is BLOCKED. Reply only to clarify or unblock; do not continue substantive work until status is updated." : ""}
${assignmentAckBlock}

Use the full format (Summary, Work done, Artifacts, Risks, Next step, Sources) for substantive updates (new work, status change, deliverables). For acknowledgments or brief follow-ups, reply in 1–2 sentences only; do not repeat all sections. Keep replies concise.

---
Notification ID: ${notification._id}
`.trim();
}
