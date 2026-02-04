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
            const responseText = await sendToOpenClaw(
              context.agent.sessionKey,
              formatNotificationMessage(context),
            );
            const taskId = context.notification?.taskId;
            if (taskId && responseText?.trim()) {
              const trimmed = responseText.trim();
              const finalContent = applyAutoMentionFallback(trimmed, context);
              if (finalContent !== trimmed) {
                const originalTokens = extractMentionTokens(trimmed);
                const finalTokens = extractMentionTokens(finalContent);
                const addedTokens = finalTokens.filter(
                  (token) => !originalTokens.includes(token),
                );
                log.debug(
                  "Auto-mention fallback applied",
                  taskId,
                  "added mentions:",
                  addedTokens,
                );
              }
              await client.action(api.service.actions.createMessageFromAgent, {
                agentId: context.agent._id,
                taskId,
                content: finalContent,
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
    const orchestratorAgentId = context?.orchestratorAgentId;
    const agentRole = context?.agent?.role;
    if (taskStatus === "done") {
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
    if (!Array.isArray(assignedAgentIds)) return false;
    return assignedAgentIds.includes(recipientId);
  }

  return true;
}

/**
 * Check whether an agent role indicates a reviewer (e.g., Squad Lead or QA).
 */
function isReviewerRole(role: string | undefined): boolean {
  if (!role) return false;
  return /squad lead|qa|review/i.test(role);
}

/** Same pattern as backend extractMentionStrings (slug or quoted name). */
const MENTION_PATTERN = /@(\w+(?:-\w+)*|"[^"]+")/g;

/**
 * Strips block quotes and code sections to avoid treating citations as mentions.
 */
function stripQuotedContent(content: string): string {
  const withoutFences = content.replace(/```[\s\S]*?```/g, "");
  const withoutInlineCode = withoutFences.replace(/`[^`]*`/g, "");
  return withoutInlineCode
    .split("\n")
    .filter((line) => !line.trim().startsWith(">"))
    .join("\n");
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
 * Extracts normalized mention tokens from content.
 * Uses the same regex as backend lib/mentions.ts so behavior stays in sync.
 */
function extractMentionTokens(content: string): string[] {
  const sanitized = stripQuotedContent(content);
  const results: string[] = [];
  const matches = sanitized.matchAll(MENTION_PATTERN);
  for (const match of matches) {
    const index = match.index ?? -1;
    if (index < 0) continue;
    const matchText = match[0] ?? "";
    const afterToken = sanitized.slice(index + matchText.length);
    const emailDomainMatch = /^\.[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(afterToken);
    if (emailDomainMatch) {
      continue;
    }
    let token = match[1] ?? "";
    if (token.startsWith('"') && token.endsWith('"')) {
      token = token.slice(1, -1);
    }
    results.push(token.toLowerCase());
  }
  return results;
}

/**
 * Returns true if tokens include a mention matching a known agent slug or name.
 */
function hasAgentMention(
  tokens: string[],
  mentionableAgents: MentionableAgent[],
): boolean {
  if (!mentionableAgents.length || tokens.length === 0) return false;
  const agentTokens = new Set<string>();
  for (const agent of mentionableAgents) {
    if (agent.slug) agentTokens.add(agent.slug.toLowerCase());
    if (agent.name) agentTokens.add(agent.name.toLowerCase());
  }
  return tokens.some((token) => agentTokens.has(token));
}

/**
 * Returns true if the primary user is already mentioned in content.
 */
function hasPrimaryUserMention(
  tokens: string[],
  primaryUser: PrimaryUserMention,
): boolean {
  const nameToken = primaryUser.name.toLowerCase();
  const emailPrefix = primaryUser.email
    ? primaryUser.email.toLowerCase().split("@")[0]
    : null;
  if (tokens.includes(nameToken)) return true;
  if (emailPrefix && tokens.includes(emailPrefix)) return true;
  return false;
}

/**
 * Returns true if the content suggests we need user confirmation or are blocked.
 */
function shouldAutoMentionUser(content: string): boolean {
  const sanitized = stripQuotedContent(content).toLowerCase();
  const blockedPattern = /\bblocked|blocker|blocking\b/;
  const confirmationPattern =
    /\b(need|needs|awaiting|waiting for|require|requires|please)\b.*\b(confirm|confirmation|approval|review)\b/;
  const inputPattern =
    /\b(need|needs|awaiting|waiting for|require|requires|please)\b.*\b(input|decision|sign[- ]?off)\b/;
  const directConfirmPattern = /\b(can you|could you)\s+confirm\b/;
  return (
    blockedPattern.test(sanitized) ||
    confirmationPattern.test(sanitized) ||
    inputPattern.test(sanitized) ||
    directConfirmPattern.test(sanitized)
  );
}

/**
 * Builds a mention prefix for the primary user.
 * Uses quoted form to support full names with spaces.
 */
function buildUserMentionPrefix(primaryUser: PrimaryUserMention): string {
  const name = primaryUser.name.replace(/"/g, "").trim();
  if (!name) return "";
  return `@\"${name}\"\n\n`;
}

/**
 * Builds a mention prefix for assigned agents excluding the orchestrator.
 * Prefers @slug; falls back to @"Name" when slug is missing. Returns empty string if no one to mention.
 */
function buildAutoMentionPrefix(
  assignedAgents: MentionableAgent[],
  orchestratorAgentId: string | null,
): string {
  const filtered =
    orchestratorAgentId != null
      ? assignedAgents.filter((a) => a.id !== orchestratorAgentId)
      : assignedAgents;
  if (filtered.length === 0) return "";
  const parts = filtered
    .map((a) => {
      const slug = (a.slug || "").trim();
      if (slug) return `@${slug}`;
      const name = (a.name || "").replace(/"/g, "");
      return name ? `@"${name}"` : "";
    })
    .filter(Boolean);
  return parts.join(" ") + "\n\n";
}

/**
 * Applies auto-mention fallback only when: notification is thread_update, message author is agent,
 * recipient is orchestrator, reply has no @mentions, and there is at least one assigned agent (excluding orchestrator).
 * Otherwise returns content unchanged.
 */
function applyAutoMentionFallback(content: string, context: any): string {
  if (!content.trim()) return content;
  const type = context?.notification?.type;
  const messageAuthorType = context?.message?.authorType;
  const recipientId = context?.notification?.recipientId;
  const orchestratorAgentId = context?.orchestratorAgentId;
  const assignedAgents: MentionableAgent[] = context?.assignedAgents ?? [];
  const mentionableAgents: MentionableAgent[] =
    context?.mentionableAgents ?? [];
  const primaryUser: PrimaryUserMention | null =
    context?.primaryUserMention ?? null;
  if (type !== "thread_update" || messageAuthorType !== "agent") return content;
  if (orchestratorAgentId == null || recipientId !== orchestratorAgentId)
    return content;
  const tokens = extractMentionTokens(content);
  const hasAgentMentions = hasAgentMention(tokens, mentionableAgents);
  const hasUserMentions =
    primaryUser != null && hasPrimaryUserMention(tokens, primaryUser);
  const hasAllMention = tokens.includes("all");
  const hasAnyMentions = hasAgentMentions || hasUserMentions;
  const needsUserMention =
    primaryUser != null && shouldAutoMentionUser(content) && !hasUserMentions;
  const userPrefix =
    primaryUser && needsUserMention ? buildUserMentionPrefix(primaryUser) : "";
  const agentPrefix =
    !hasAnyMentions && !hasAllMention
      ? buildAutoMentionPrefix(assignedAgents, orchestratorAgentId)
      : "";
  if (!userPrefix && !agentPrefix) return content;
  return userPrefix + agentPrefix + content;
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
    "Mentionable agents (use @slug to request follow-up):",
    ...lines,
    more,
    "",
    "If you want another agent to act, @mention them by slug from the list above.",
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
const MENTIONABLE_AGENTS_CAP = 25;

function formatNotificationMessage(context: any): string {
  const {
    notification,
    task,
    message,
    thread,
    repositoryDoc,
    mentionableAgents = [],
    primaryUserMention = null,
  } = context;
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
${formatMentionableAgentsSection(mentionableAgents)}
${formatPrimaryUserMentionSection(primaryUserMention)}

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
