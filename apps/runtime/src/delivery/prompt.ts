/**
 * Notification prompt construction for OpenClaw delivery.
 * Formatting helpers and formatNotificationMessage; orchestrator is silent-by-default (no routine ack instruction).
 */

import type { ToolCapabilitiesAndSchemas } from "../tooling/agentTools";
import type { DeliveryContext } from "./types";
import {
  isOrchestratorChatTask,
  isQaAgentProfile,
  isRecipientInMultiAssigneeTask,
} from "./policy";

const MENTIONABLE_AGENTS_CAP = 25;
const THREAD_MAX_MESSAGES = 25;
const THREAD_MAX_CHARS_PER_MESSAGE = 1500;
const TASK_DESCRIPTION_MAX_CHARS = 4000;
const REPOSITORY_CONTEXT_MAX_CHARS = 12000;
const GLOBAL_CONTEXT_MAX_CHARS = 4000;
const TASK_BRANCH_PREFIX = "feat/task-";
/**
 * Path prefix for per-task worktrees; task ID (Convex doc ID) is appended.
 * Convex document IDs are alphanumeric and safe for path segments. Kept in sync with docs/runtime/AGENTS.md.
 */
const TASK_WORKTREE_PATH_PREFIX = "/root/clawd/worktrees/feat-task-";

const STATUS_INSTRUCTION_VALID_TRANSITIONS =
  "Valid next statuses from current: assigned -> in_progress, in_progress -> review, in_progress -> blocked, review -> done or back to in_progress, review -> blocked, blocked -> in_progress. Do not move directly to done unless the current status is review.";

function truncateForContext(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return value.slice(0, Math.max(0, maxChars - 1)).trimEnd() + "…";
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

/**
 * Format notification message for OpenClaw. Orchestrator is silent-by-default (no routine ack instruction).
 * When the recipient is one of multiple task assignees, appends collaboration instructions (sub-scope, response_request).
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
    "Main clone (fetch/pull/worktree management only): /root/clawd/repos/openclaw-mission-control. Do all code work in a task worktree, not in the main clone.";
  const taskBranchName = task ? `${TASK_BRANCH_PREFIX}${task._id}` : null;
  const taskWorktreePath = task
    ? `${TASK_WORKTREE_PATH_PREFIX}${task._id}`
    : null;
  const taskBranchRule = taskBranchName
    ? `For this task use only branch \`${taskBranchName}\` and work only in the task worktree at \`${taskWorktreePath}\`. From the main clone: git fetch origin, git checkout dev, git pull, then create worktree if missing: \`git worktree add ${taskWorktreePath} -b ${taskBranchName}\` (or \`git worktree add ${taskWorktreePath} ${taskBranchName}\` if the branch already exists). All file edits, git add, git commit, git push, and gh pr create must be run from \`${taskWorktreePath}\`. Do not perform code edits or commits in the main clone.`
    : null;
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
        "Use the task worktree for all code work (see task branch rule below). PRs must target `dev` (use `--base dev`, not master).",
        "To inspect the repo tree, use exec (e.g., `ls` on the worktree path) and only use read on files.",
        "Never call read on directories (for example `src/app/.../analytics/`); this causes EISDIR. For directory discovery use exec (`ls`, `rg`) first, then read a specific file path.",
        "When a path contains App Router bracket segments, keep them exact (e.g. `[accountSlug]`, not `[accountSlug)`), and quote shell paths containing brackets/parentheses.",
        'Prefer memory_get/memory_set for memory files when available. If read is needed, pass JSON args with `path` (for example `{ "path": "memory/WORKING.md" }`) and only target files.',
        "Only use the read tool with paths under `/root/clawd` (e.g. /root/clawd/agents/<slug>/memory/WORKING.md). Do not read paths under /usr, /usr/local, or node_modules — they are not in your workspace and will fail.",
        "Write artifacts under `/root/clawd/deliverables` for local use. To share a deliverable with the primary user, use the document_upsert tool and reference it in the thread only as [Document](/document/<documentId>). Do not post local paths (e.g. /deliverables/... or /root/clawd/deliverables/...) — the user cannot open them.",
        "Workspace boundaries: read/write only under `/root/clawd` (agents, memory, deliverables, repos, worktrees). Do not write outside `/root/clawd`; if a required path under `/root/clawd` is missing, create it if you can (e.g. `/root/clawd/agents`), otherwise report BLOCKED.",
        ...(taskBranchRule ? ["", taskBranchRule] : []),
      ].join("\n")
    : [
        "Repository context: not found.",
        localRepoHint,
        "Use the task worktree for all code work when a task is set (see task branch rule below). PRs must target `dev` (use `--base dev`, not master).",
        "To inspect the repo tree, use exec (e.g., `ls` on the worktree path) and only use read on files.",
        "Never call read on directories (for example `src/app/.../analytics/`); this causes EISDIR. For directory discovery use exec (`ls`, `rg`) first, then read a specific file path.",
        "When a path contains App Router bracket segments, keep them exact (e.g. `[accountSlug]`, not `[accountSlug)`), and quote shell paths containing brackets/parentheses.",
        'Prefer memory_get/memory_set for memory files when available. If read is needed, pass JSON args with `path` (for example `{ "path": "memory/WORKING.md" }`) and only target files.',
        "Only use the read tool with paths under `/root/clawd` (e.g. /root/clawd/agents/<slug>/memory/WORKING.md). Do not read paths under /usr, /usr/local, or node_modules — they are not in your workspace and will fail.",
        "Write artifacts under `/root/clawd/deliverables` for local use. To share a deliverable with the primary user, use the document_upsert tool and reference it in the thread only as [Document](/document/<documentId>). Do not post local paths (e.g. /deliverables/... or /root/clawd/deliverables/...) — the user cannot open them.",
        "Workspace boundaries: read/write only under `/root/clawd` (agents, memory, deliverables, repos, worktrees). Do not write outside `/root/clawd`; if a required path under `/root/clawd` is missing, create it if you can (e.g. `/root/clawd/agents`), otherwise report BLOCKED.",
        ...(taskBranchRule ? ["", taskBranchRule] : []),
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
  const humanBlockedNote =
    " When you need human input, approval, or confirmation (e.g. clarification, design sign-off, credentials), move to blocked and set blockedReason to describe what you need and from whom; do not stay in_progress while waiting for humans. When an authorized actor (orchestrator or assignee with status permission) acknowledges the blocked request or provides the needed input, move the task back to in_progress before continuing work.";
  const statusInstructions = task
    ? canModifyTaskStatus
      ? hasRuntimeTools && toolCapabilities.hasTaskStatus
        ? `If you need to change task status, do it BEFORE posting a thread update. ${STATUS_INSTRUCTION_VALID_TRANSITIONS}.${humanBlockedNote}${qaReviewNote} You have the **task_status** tool (see Capabilities) — call it with taskId, status (in_progress|review${toolCapabilities.canMarkDone ? "|done" : ""}|blocked), and blockedReason when status is blocked. You also have **task_update** to change title, description, priority, labels, assignees, or dueDate — call it before posting when you modify the task. Do NOT decide tool availability based on whether your UI lists it; if Capabilities includes task_status or task_update, you can call them. If you request a valid target status that isn't the next immediate step, the runtime may auto-apply required intermediate transitions (e.g. assigned -> in_progress -> review) when possible. If a tool returns an error, do not claim you changed status; report BLOCKED and include the error message. As a last resort (manual/CLI), you can call the HTTP fallback: POST ${runtimeBaseUrl}/agent/task-status with header \`x-openclaw-session-key: ${sessionKey}\` and JSON body \`{ "taskId": "<Task ID above>", "status": "<next valid status>", "blockedReason": "..." }\`, or POST ${runtimeBaseUrl}/agent/task-update for other fields. Note: inbox/assigned are handled by assignment changes, not this tool. If you have no way to update status (tool fails and HTTP is unreachable), do not post a completion summary; report BLOCKED and state that you could not update task status.${doneRestrictionNote}`
        : `If you need to change task status, do it BEFORE posting a thread update. ${STATUS_INSTRUCTION_VALID_TRANSITIONS}.${humanBlockedNote}${qaReviewNote} Use the HTTP fallback: POST ${runtimeBaseUrl}/agent/task-status with header \`x-openclaw-session-key: ${sessionKey}\` and JSON body \`{ "taskId": "<Task ID above>", "status": "<next valid status>", "blockedReason": "..." }\`, or POST ${runtimeBaseUrl}/agent/task-update for other task fields. Note: inbox/assigned are handled by assignment changes, not this endpoint. If the HTTP call fails, report BLOCKED and include the error message.${doneRestrictionNote}`
      : "You are not allowed to change task status. If asked to change or close this task, report BLOCKED and explain that status updates are not permitted for you."
    : "";
  const taskCreateInstructions = canCreateTasks
    ? hasRuntimeTools
      ? `If you need to create tasks, use the **task_create** tool (see Capabilities). You can include assignee slugs via \`assigneeSlugs\` to assign on creation. If the tool fails, use the HTTP fallback: POST ${runtimeBaseUrl}/agent/task-create with header \`x-openclaw-session-key: ${sessionKey}\` and JSON body \`{ "title": "...", "description": "...", "priority": 3, "labels": ["..."], "status": "inbox|assigned|in_progress|review|done|blocked", "blockedReason": "...", "dueDate": 1700000000000, "assigneeSlugs": ["qa"] }\`.`
      : `If you need to create tasks, use the HTTP fallback: POST ${runtimeBaseUrl}/agent/task-create with header \`x-openclaw-session-key: ${sessionKey}\` and JSON body \`{ "title": "...", "description": "...", "priority": 3, "labels": ["..."], "status": "inbox|assigned|in_progress|review|done|blocked", "blockedReason": "...", "dueDate": 1700000000000, "assigneeSlugs": ["qa"] }\`.`
    : "";
  const documentInstructions = canCreateDocuments
    ? hasRuntimeTools
      ? `If you need to create or update documents, use the **document_upsert** tool (see Capabilities). This is the document sharing tool — always use it so the primary user can see the doc, and include the returned documentId and a Markdown link in your reply: \`[Document](/document/<documentId>)\`. Do not post local paths (e.g. /deliverables/PLAN_*.md or /root/clawd/deliverables/...) in the thread — the user cannot open them. If the tool fails, use the HTTP fallback: POST ${runtimeBaseUrl}/agent/document with header \`x-openclaw-session-key: ${sessionKey}\` and JSON body \`{ "title": "...", "content": "...", "type": "deliverable|note|template|reference", "taskId": "<Task ID above>" }\`.`
      : `If you need to create or update documents, use the HTTP fallback: POST ${runtimeBaseUrl}/agent/document with header \`x-openclaw-session-key: ${sessionKey}\` and JSON body \`{ "title": "...", "content": "...", "type": "deliverable|note|template|reference", "taskId": "<Task ID above>" }\`. Always include the returned documentId and a Markdown link in your reply: \`[Document](/document/<documentId>)\`. Do not post local paths like /deliverables/... in the thread — the user cannot open them.`
    : "";
  const canRequestResponses = canMentionAgents && task != null;
  const responseRequestInstructions = canRequestResponses
    ? hasResponseRequestTool
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
      ? 'Orchestrator chat is coordination-only. Do not start executing tasks from this thread. When you suggest tasks, immediately assign agents using task_assign or create tasks with assigneeSlugs before asking them to work. Never self-assign: you are the coordinator—only assign to the agents who will execute (e.g. assigneeSlugs: ["engineer"], not ["squad-lead", "engineer"]). This keeps accountability clear.'
      : "";
  const followupTaskInstruction =
    isOrchestrator && task
      ? `\nOrchestrator note: If this task needs follow-up work, create those follow-up tasks before moving this task to done. If any PRs were reopened, merge them before moving this task to done.${canCreateTasks ? (hasRuntimeTools ? " Use the task_create tool." : ` Use the HTTP fallback (${runtimeBaseUrl}/agent/task-create).`) : " If task creation is not permitted, state the follow-ups needed and ask the primary user to create them."}`
      : "";

  const orchestratorResponseRequestInstruction =
    isOrchestrator && canMentionAgents
      ? '\n**Orchestrator (required):** Before requesting QA (or any reviewer) to act, the task MUST be in REVIEW. Move the task to review first (task_status or task_update), then call the **response_request** tool in this reply with recipientSlugs and a clear message. Do not request QA approval while the task is still in_progress. When you need another agent to take an action (e.g. QA to trigger CI, confirm review, or move task to DONE), you MUST call the **response_request** tool — posting only a thread message that says you are "requesting" or "asking" them does not notify them; use the tool so the notification is delivered.'
      : "";

  const largeResultInstruction = canCreateDocuments
    ? hasRuntimeTools
      ? "If the result is large, create a document with document_upsert (document sharing tool), include the returned documentId and a Markdown link ([Document](/document/<documentId>)) in your reply, and summarize it here."
      : "If the result is large, create a document via the HTTP fallback (/agent/document), include the returned documentId and a Markdown link ([Document](/document/<documentId>)) in your reply, and summarize it here."
    : "If the result is large, summarize it here (document creation not permitted).";

  const mentionableSection = canMentionAgents
    ? formatMentionableAgentsSection(mentionableAgents)
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

  const multiAssigneeBlock = isRecipientInMultiAssigneeTask(context)
    ? "\n**Multi-assignee:** This task has multiple assignees. Declare your sub-scope in your reply, check the thread to avoid duplicating work, and use **response_request** for handoffs or dependencies on other assignees.\n"
    : "";

  const thisTaskAnchor = task
    ? `\n**Respond only to this notification.** Task ID: \`${task._id}\` — ${task.title} (${task.status}). Ignore any other task or thread in the conversation history; the only task and thread that matter for your reply are below.\n`
    : "\n**Respond only to this notification.** Ignore any other task or thread in the conversation history.\n";

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

Important: This system captures only one reply per notification. Do not send progress updates. When work can be parallelized, spawn sub-agents (e.g. via **sessions_spawn**) and reply once with combined results; if you spawn sub-agents or run long research, wait for their results and include the final output in this reply. ${largeResultInstruction}

${statusInstructions}
${taskCreateInstructions}
${documentInstructions}
${responseRequestInstructions}
${orchestratorToolInstructions}
${orchestratorResponseRequestInstruction}
${orchestratorChatInstruction}
${followupTaskInstruction}
${task?.status === "review" && toolCapabilities.canMarkDone ? '\nIf you are accepting this task as done, you MUST update status to "done" (tool or endpoint) before posting. If you cannot (tool unavailable or endpoint unreachable), report BLOCKED — do not post a "final summary" or claim the task is DONE.' : ""}
${orchestratorResponseRequestInstruction}
${task?.status === "done" ? "\nThis task is DONE. You were explicitly mentioned — reply once briefly (1–2 sentences) to the request (e.g. confirm you will push the PR or take the asked action). Do not use the full Summary/Work done/Artifacts format. Do not reply again to this thread after that." : ""}
${task?.status === "blocked" ? "\nThis task is BLOCKED. Reply only to clarify or unblock; do not continue substantive work until status is updated. When an authorized actor (orchestrator or assignee) provides the needed input, move the task back to in_progress before resuming work." : ""}
${assignmentAckBlock}
${multiAssigneeBlock}

Use the full format (Summary, Work done, Artifacts, Risks, Next step, Sources) for substantive updates (new work, status change, deliverables). For acknowledgments or brief follow-ups, reply in 1–2 sentences only; do not repeat all sections. Keep replies concise.

---
Notification ID: ${notification._id}
`.trim();
}
