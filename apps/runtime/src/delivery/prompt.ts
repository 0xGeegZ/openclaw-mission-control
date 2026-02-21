/**
 * Notification prompt construction for OpenClaw delivery.
 * Formatting helpers and formatNotificationMessage; orchestrator is silent-by-default (no routine ack instruction).
 */

import type { ToolCapabilitiesAndSchemas } from "../tooling/agentTools";
import type { DeliveryContext } from "@packages/backend/convex/service/notifications";
import {
  ASSIGNMENT_ACK_ONLY_RULE,
  ASSIGNMENT_SCOPE_ACK_ONLY_RULE,
  SKILLS_LOCATION_SENTENCE,
  SESSIONS_SPAWN_PARENT_SKILL_RULE,
} from "../prompt-fragments";
import {
  isOrchestratorChatTask,
  isRecipientInMultiAssigneeTask,
} from "./policy";

const MENTIONABLE_AGENTS_CAP = 25;
const THREAD_MAX_MESSAGES = 25;
const THREAD_MAX_CHARS_PER_MESSAGE = 1500;
const TASK_DESCRIPTION_MAX_CHARS = 4000;
const REPOSITORY_CONTEXT_MAX_CHARS = 4000;
const GLOBAL_CONTEXT_MAX_CHARS = 4000;
const NOTIFICATION_TITLE_MAX_CHARS = 500;
const NOTIFICATION_BODY_MAX_CHARS = 15000;
/** Task branch/worktree are defined by the repository context document (seed-owned); no hardcoded paths here. */

const STATUS_INSTRUCTION_VALID_TRANSITIONS =
  "Valid next statuses from current: assigned -> in_progress, in_progress -> review, in_progress -> blocked, review -> done or back to in_progress, review -> blocked, blocked -> in_progress. Do not move directly to done unless the current status is review.";

function truncateForContext(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return value.slice(0, Math.max(0, maxChars - 1)).trimEnd() + "…";
}

/**
 * Sanitize user/agent-controlled content before embedding in delivery instructions to reduce prompt-injection risk.
 * Normalizes newlines and strips lines that look like instruction delimiters (e.g. ===== ... =====).
 */
function sanitizeForPrompt(value: string): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/\s*=+\s*.+?\s*=+\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasToolSchema(schemas: unknown[], toolName: string): boolean {
  return schemas.some((schema) => {
    if (!schema || typeof schema !== "object") return false;
    const schemaRecord = schema as {
      type?: unknown;
      function?: { name?: unknown };
    };
    return (
      schemaRecord.type === "function" &&
      schemaRecord.function?.name === toolName
    );
  });
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
      ? `- @"${name}" - ${a.name} (${a.role})`
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

function formatPrimaryUserMentionSection(
  primaryUser: PrimaryUserMention | null,
): string {
  if (!primaryUser) return "";
  const name = primaryUser.name.replace(/"/g, "").trim();
  const mention = name ? `@"${name}"` : "";
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
 * Build capability labels for HTTP fallback mode (no client-side tools). Exported for delivery.ts.
 * @param options - Capability flags and orchestrator flag.
 * @returns Array of human-readable capability strings for the prompt.
 */
export function buildHttpCapabilityLabels(options: {
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
  if (options.canCreateDocuments || options.hasTaskContext) {
    labels.push("list documents via HTTP (POST /agent/document-list)");
  }
  if (options.hasTaskContext && options.canMentionAgents) {
    labels.push(
      "request agent responses via HTTP (POST /agent/response-request)",
    );
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

/** Instruction profile version for observability. */
export const DELIVERY_INSTRUCTION_PROFILE_VERSION = "v2";

/**
 * Build system/policy instructions for OpenResponses (instructions field).
 * Includes identity, capabilities, current-task scope, and operational rules.
 *
 * @param context - Delivery context from getNotificationForDelivery (notification, task, agent, flags).
 * @param taskStatusBaseUrl - Base URL for task-status/document/response-request HTTP fallbacks.
 * @param toolCapabilities - Capability labels and tool schemas; used to choose tool vs HTTP wording.
 * @returns Instructions string for the OpenResponses instructions field.
 */
export function buildDeliveryInstructions(
  context: DeliveryContext,
  taskStatusBaseUrl: string,
  toolCapabilities: ToolCapabilitiesAndSchemas,
): string {
  const {
    notification,
    task,
    mentionableAgents = [],
    primaryUserMention = null,
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
  const hasResponseRequestTool =
    hasRuntimeTools &&
    hasToolSchema(toolCapabilities.schemas, "response_request");
  const runtimeBaseUrl = taskStatusBaseUrl.replace(/\/$/, "");
  /** Session key for HTTP fallback instructions; deliverySessionKey is required for agent notifications. */
  const sessionKey = context.deliverySessionKey?.trim();
  if (!sessionKey) {
    throw new Error(
      "Missing deliverySessionKey; buildDeliveryInstructions requires backend-resolved session key",
    );
  }

  const capabilityLabels = [...toolCapabilities.capabilityLabels];
  const capabilitiesBlock =
    capabilityLabels.length > 0
      ? `Runtime capabilities:\n${capabilityLabels.map((l) => `- ${l}`).join("\n")}\nUse only the capabilities listed above. If a tool or HTTP fallback fails, report BLOCKED with the error message.\n\n`
      : "Runtime capabilities: none. If asked to create tasks, change status, or create documents, report BLOCKED.\n\n";

  const agentName = context.agent?.name?.trim() || "Agent";
  const agentRole = context.agent?.role?.trim() || "Unknown role";
  const identityLine = `You are replying as: **${agentName}** (${agentRole}). Reply only as this agent; do not speak as or ask whether you are another role.\n\n`;

  const isOrchestratorChat = isOrchestratorChatTask(task);
  const qaReviewNote =
    "Only agents with close permission (canMarkDone capability) can mark tasks as done, and only when the task is in review.";
  const doneRestrictionNote = toolCapabilities.canMarkDone
    ? ""
    : "You do not have canMarkDone capability; do not mark tasks as done. Ask an authorized closer or the orchestrator if closure is needed.";
  const humanBlockedNote =
    "When waiting on human input/approval, move task to blocked with blockedReason; move back to in_progress once unblocked.";
  const statusInstructions = task
    ? canModifyTaskStatus
      ? hasRuntimeTools && toolCapabilities.hasTaskStatus
        ? `Change task status BEFORE posting a thread update. ${STATUS_INSTRUCTION_VALID_TRANSITIONS} ${humanBlockedNote} ${qaReviewNote} Use **task_status** for status transitions, and use **task_update** for task fields (title/description/priority/labels/assignees/dueDate). If both are required in one turn, call **task_status** first, then **task_update**. If a tool call fails, report BLOCKED with the error message. ${doneRestrictionNote}`
        : `Change task status BEFORE posting a thread update. ${STATUS_INSTRUCTION_VALID_TRANSITIONS} ${humanBlockedNote} ${qaReviewNote} Use HTTP fallback: POST ${runtimeBaseUrl}/agent/task-status or /agent/task-update with header \`x-openclaw-session-key: ${sessionKey}\`. If HTTP fails, report BLOCKED. ${doneRestrictionNote}`
      : "You are not allowed to change task status. If asked to change or close this task, report BLOCKED and explain that status updates are not permitted for you."
    : "";
  const taskCreateInstructions = canCreateTasks
    ? hasRuntimeTools
      ? "When needed, create follow-up tasks using **task_create**."
      : `When needed, create follow-up tasks via HTTP fallback: POST ${runtimeBaseUrl}/agent/task-create with header \`x-openclaw-session-key: ${sessionKey}\`.`
    : "";
  const documentInstructions = canCreateDocuments
    ? hasRuntimeTools
      ? "For large outputs or artifacts, use **document_upsert** and include `[Document](/document/<documentId>)` in your reply. Do not use share/send to channel or webchat — delivery is only via document_upsert and the thread."
      : `For large outputs, use HTTP fallback POST ${runtimeBaseUrl}/agent/document with header \`x-openclaw-session-key: ${sessionKey}\`, then include \`[Document](/document/<documentId>)\` in your reply. Do not use share/send to channel or webchat.`
    : "";
  const canRequestResponses = canMentionAgents && task != null;
  const responseRequestInstructions = canRequestResponses
    ? hasResponseRequestTool
      ? "If another agent must act, use **response_request** (mentions alone do not notify agents)."
      : `If another agent must act, use HTTP fallback POST ${runtimeBaseUrl}/agent/response-request with header \`x-openclaw-session-key: ${sessionKey}\`.`
    : "";
  const orchestratorToolInstructions = isOrchestrator
    ? hasRuntimeTools
      ? "Orchestrator tools are available (task_list/get/thread/search/assign/message/delete/link_pr). If any tool fails, report BLOCKED with the error."
      : `Orchestrator tool calls must use HTTP fallbacks on ${runtimeBaseUrl} with header \`x-openclaw-session-key: ${sessionKey}\`.`
    : "";
  const orchestratorChatInstruction =
    isOrchestrator && isOrchestratorChat
      ? 'Orchestrator chat is coordination-only. Do not start executing tasks from this thread. When you suggest tasks, immediately assign agents using task_assign or create tasks with assigneeSlugs before asking them to work. Never self-assign: you are the coordinator—only assign to the agents who will execute (e.g. assigneeSlugs: ["engineer"], not ["squad-lead", "engineer"]). This keeps accountability clear.'
      : "";
  const followupTaskInstruction =
    isOrchestrator && task
      ? `\nOrchestrator note: If this task needs follow-up work, create those follow-up tasks before moving this task to done. If any PRs were reopened, merge them before moving this task to done.${canCreateTasks ? (hasRuntimeTools ? " Use the task_create tool." : ` Use the HTTP fallback (${runtimeBaseUrl}/agent/task-create).`) : " If task creation is not permitted, state the follow-ups needed and ask the primary user to create them."}`
      : "";
  const orchestratorResponseRequestInstruction =
    isOrchestrator && canMentionAgents
      ? "\n**Orchestrator (required):** move task to REVIEW before requesting QA/reviewer action, then call **response_request** in the same reply. Do not rely on thread mentions alone."
      : "";

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
  const multiAssigneeCoordinationGateBlock =
    notification?.type === "assignment" &&
    isRecipientInMultiAssigneeTask(context)
      ? `
**Multi-assignee assignment gate (required):**
- Your first reply to this assignment must be coordination-only: acknowledge, claim your sub-scope, and ask dependency questions.
- In that first reply, call **response_request** for any assignee whose input you need.
- Do not run substantive execution before coordination (for example: domain checks, coding, tests, or broad research). The only allowed pre-work is reading task/thread context needed to ask precise questions.
- Exception rule: this assignment coordination reply takes priority over the "single reply per notification" rule. Send this coordination reply first, then continue when dependencies are clarified.
`
      : "";
  const multiAssigneeBlock = isRecipientInMultiAssigneeTask(context)
    ? `
**Multi-assignee (thread-first collaboration required):** This task has multiple assignees. Collaboration means visible alignment in this task thread, not silent parallel work.
- In your first substantive reply, claim your exact sub-scope.
- If another assignee's work affects yours, ask a direct question in the thread and then send **response_request** so they are notified.
- Do not treat silence as agreement: wait for a reply, or state a time-boxed assumption and ask the orchestrator to confirm.
- Before moving to REVIEW, post a brief agreement summary in the thread (owners, decisions, remaining dependencies).
- If a dependency is still unresolved, move to BLOCKED with blockedReason and send **response_request** to the blocking assignee.
`
    : "";

  const thisTaskAnchor = task
    ? `\n**Respond only to this notification.** Task ID: \`${task._id}\` — ${sanitizeForPrompt(task.title)} (${task.status}). Ignore any other task or thread in the conversation history; the only task and thread that matter for your reply are below.\n`
    : "\n**Respond only to this notification.** Ignore any other task or thread in the conversation history.\n";

  const assignmentFirstBlock =
    notification?.type === "assignment"
      ? `\n**Assignment — this reply only:** ${ASSIGNMENT_ACK_ONLY_RULE}\n\n`
      : "";

  const workspaceInstruction = `Primary operating instructions live in workspace files: AGENTS.md, USER.md, IDENTITY.md, SOUL.md, HEARTBEAT.md, and TOOLS.md. Follow those files; keep this reply focused on this notification. ${SKILLS_LOCATION_SENTENCE}`;

  const scopeRules = [
    ...(notification?.type === "assignment"
      ? [ASSIGNMENT_SCOPE_ACK_ONLY_RULE]
      : []),
    "Use only the thread history shown above for this task; do not refer to or reply about any other task (e.g. another task ID or PR) from your conversation history. Do not request items already present in the thread above.",
    "If the latest message is from another agent and does not ask you to do anything (no request, no question, no action for you), respond with the single token NO_REPLY and nothing else. Do not use NO_REPLY for assignment notifications or when the message explicitly asks you to act.",
    "Important: This system captures only one reply per notification. Do not send progress updates.",
    "Exception: on assignment notifications with multi-assignee coordination gate, send the required coordination-only reply first, then continue work after dependencies are clarified.",
    "When work can be parallelized, spawn sub-agents (e.g. via **sessions_spawn**) and reply once with combined results; if you spawn sub-agents or run long research, wait for their results and include the final output in this reply.",
    SESSIONS_SPAWN_PARENT_SKILL_RULE,
  ].join("\n");

  const operationalBlock = [
    !hasRuntimeTools
      ? `HTTP fallbacks: base URL \`${runtimeBaseUrl}\`, header \`x-openclaw-session-key: ${sessionKey}\`. Use for all POST /agent/* calls below.\n\n`
      : "",
    statusInstructions,
    taskCreateInstructions,
    documentInstructions,
    responseRequestInstructions,
    orchestratorToolInstructions,
    orchestratorResponseRequestInstruction,
    orchestratorChatInstruction,
    followupTaskInstruction,
    task?.status === "review" && toolCapabilities.canMarkDone
      ? '\nIf you are accepting this task as done, you MUST update status to "done" (tool or endpoint) before posting. If you cannot (tool unavailable or endpoint unreachable), report BLOCKED — do not post a "final summary" or claim the task is DONE.'
      : "",
    task?.status === "done"
      ? "\nThis task is DONE. You were explicitly mentioned — reply once briefly (1–2 sentences) to the request (e.g. confirm you will push the PR or take the asked action). Do not use the full Summary/Work done/Artifacts format. Do not reply again to this thread after that."
      : "",
    task?.status === "blocked"
      ? "\nThis task is BLOCKED. Reply only to clarify or unblock; do not continue substantive work until status is updated. When an authorized actor (orchestrator or assignee) provides the needed input, move the task back to in_progress before resuming work."
      : "",
    assignmentAckBlock,
    multiAssigneeCoordinationGateBlock,
    multiAssigneeBlock,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    identityLine,
    assignmentFirstBlock,
    capabilitiesBlock,
    thisTaskAnchor,
    workspaceInstruction,
    "",
    "===== RESPONSE SCOPE RULES START =====",
    scopeRules,
    "===== RESPONSE SCOPE RULES END =====",
    "",
    "===== OPERATIONAL INSTRUCTIONS START =====",
    operationalBlock,
    "===== OPERATIONAL INSTRUCTIONS END =====",
  ].join("\n");
}

/**
 * Build compact notification input for OpenResponses (input field).
 * Notification payload plus minimal structured context (task, repository, global briefing, thread).
 *
 * @param context - Delivery context from getNotificationForDelivery.
 * @returns Input string for the OpenResponses input field.
 */
export function buildNotificationInput(context: DeliveryContext): string {
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
  } = context;
  const taskDescription = task?.description?.trim()
    ? `Task description:\n${truncateForContext(task.description.trim(), TASK_DESCRIPTION_MAX_CHARS)}`
    : "";
  const notificationBodySection = [
    "===== MAIN USER MESSAGE (NOTIFICATION BODY) START =====",
    truncateForContext(
      notification.body?.trim() || "(empty)",
      NOTIFICATION_BODY_MAX_CHARS,
    ),
    "===== MAIN USER MESSAGE (NOTIFICATION BODY) END =====",
  ].join("\n");
  const requestToRespondToSection =
    message?.content?.trim() &&
    (notification.type === "thread_update" ||
      notification.type === "mention" ||
      notification.type === "response_request")
      ? [
          "===== REQUEST TO RESPOND TO START =====",
          `Author: ${message.authorType} (${message.authorId})`,
          "Content:",
          message.content.trim(),
          "===== REQUEST TO RESPOND TO END =====",
        ].join("\n")
      : "";
  const messageDetails = message
    ? [
        "===== LATEST THREAD MESSAGE START =====",
        `Message author: ${message.authorType} (${message.authorId})`,
        `Message ID: ${message._id}`,
        "Message content:",
        message.content?.trim() || "(empty)",
        "===== LATEST THREAD MESSAGE END =====",
      ].join("\n")
    : "";
  const rawThreadDetails = formatThreadContext(thread);
  const threadDetails =
    rawThreadDetails.trim() === ""
      ? ""
      : [
          "===== THREAD HISTORY START =====",
          rawThreadDetails,
          "===== THREAD HISTORY END =====",
        ].join("\n");
  const repositoryDetails = repositoryDoc?.content?.trim()
    ? [
        "Repository context:",
        truncateForContext(
          repositoryDoc.content.trim(),
          REPOSITORY_CONTEXT_MAX_CHARS,
        ),
      ].join("\n")
    : [
        "Repository context: not found.",
        "Ask the orchestrator or account owner to add a Repository document if repo/worktree rules are required.",
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
  const mentionableSection = formatMentionableAgentsSection(mentionableAgents);

  const formatInstruction =
    notification.type === "assignment"
      ? "This is an assignment. Reply with acknowledgment only (1–2 sentences) and any clarifying questions. Do not perform substantive work or use the full format in this reply."
      : "Use the full format (Summary, Work done, Artifacts, Risks, Next step, Sources) for substantive updates (new work, status change, deliverables). For acknowledgments or brief follow-ups, reply in 1–2 sentences only; do not repeat all sections. Keep replies concise.";

  return [
    `## Notification: ${notification.type}`,
    `**${truncateForContext(notification.title?.trim() ?? "", NOTIFICATION_TITLE_MAX_CHARS)}**`,
    "",
    notificationBodySection,
    requestToRespondToSection ? `\n${requestToRespondToSection}\n` : "",
    "===== STRUCTURED CONTEXT START =====",
    task ? `Task: ${task.title} (${task.status})\nTask ID: ${task._id}` : "",
    taskDescription,
    repositoryDetails,
    globalContextSection,
    taskOverviewSection,
    messageDetails,
    threadDetails,
    mentionableSection,
    formatPrimaryUserMentionSection(primaryUserMention),
    "===== STRUCTURED CONTEXT END =====",
    formatInstruction,
    "",
    `---\nNotification ID: ${notification._id}`,
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

/**
 * Format notification message for OpenClaw. Orchestrator is silent-by-default (no routine ack instruction).
 * When the recipient is one of multiple task assignees, appends thread-first collaboration instructions
 * (scope claim, Q/A exchange, response_request notification, agreement checkpoint).
 * @param context - Delivery context (notification, task, message, thread, flags).
 * @param taskStatusBaseUrl - Base URL for task-status HTTP fallback (e.g. http://runtime:3000).
 * @param toolCapabilities - Capability labels and schemas; must match tools sent to OpenClaw.
 * @returns Full prompt string for the notification.
 */
export function formatNotificationMessage(
  context: DeliveryContext,
  taskStatusBaseUrl: string,
  toolCapabilities: ToolCapabilitiesAndSchemas,
): string {
  return [
    buildDeliveryInstructions(context, taskStatusBaseUrl, toolCapabilities),
    buildNotificationInput(context),
  ].join("\n\n");
}
