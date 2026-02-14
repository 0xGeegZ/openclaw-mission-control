import { Doc, Id } from "@packages/backend/convex/_generated/dataModel";
import { getConvexClient, api } from "./convex-client";
import { RuntimeConfig } from "./config";
import {
  isNoResponseFallbackMessage,
  sendOpenClawToolResults,
  sendToOpenClaw,
} from "./gateway";
import { createLogger } from "./logger";
import { recordSuccess, recordFailure } from "./metrics";
import {
  HEARTBEAT_OK_RESPONSE,
  isHeartbeatOkResponse,
} from "./heartbeat-constants";
import {
  executeAgentTool,
  getToolCapabilitiesAndSchemas,
} from "./tooling/agentTools";
import { DEFAULT_OPENCLAW_CONFIG, type RecipientType } from "@packages/shared";

const log = createLogger("[Heartbeat]");

interface HeartbeatState {
  isRunning: boolean;
  schedules: Map<string, NodeJS.Timeout>;
  /** Track interval (minutes) per agent for reschedule-on-change. */
  intervals: Map<string, number>;
}

const state: HeartbeatState = {
  isRunning: false,
  schedules: new Map(),
  intervals: new Map(),
};

export { HEARTBEAT_OK_RESPONSE };
const HEARTBEAT_TASK_LIMIT = 12;
const ORCHESTRATOR_HEARTBEAT_TASK_LIMIT = 200;
const HEARTBEAT_DESCRIPTION_MAX_CHARS = 240;
const HEARTBEAT_THREAD_MESSAGE_LIMIT = 8;
const HEARTBEAT_THREAD_MESSAGE_MAX_CHARS = 220;
const HEARTBEAT_STATUS_PRIORITY: HeartbeatStatus[] = ["in_progress", "assigned"];
/** Single source of truth for orchestrator tracked statuses and ordering. */
const ORCHESTRATOR_HEARTBEAT_STATUSES: HeartbeatStatus[] = [
  "in_progress",
  "review",
  "assigned",
  "blocked",
];
const ORCHESTRATOR_ASSIGNEE_STALE_MS = 3 * 60 * 60 * 1000;
const ORCHESTRATOR_ASSIGNEE_BLOCKED_STALE_MS = 24 * 60 * 60 * 1000;
const ORCHESTRATOR_ASSIGNEE_STARTUP_STALE_MS = 15 * 60 * 1000;
const ORCHESTRATOR_MAX_FOLLOW_UPS_PER_HEARTBEAT = 3;
const TASK_ID_PATTERN = /Task ID:\s*([A-Za-z0-9_-]+)/i;

type HeartbeatTask = Doc<"tasks">;
type HeartbeatStatus = HeartbeatTask["status"];
type HeartbeatThreadMessagePreview = {
  messageId: Id<"messages">;
  authorType: RecipientType;
  authorId: string;
  authorName: string | null;
  content: string;
  createdAt: number;
};

/**
 * Sort tasks by explicit status priority, then by recency (or staleness).
 */
export function sortHeartbeatTasks(
  tasks: HeartbeatTask[],
  options?: {
    statusPriority?: HeartbeatStatus[];
    preferStale?: boolean;
  },
): HeartbeatTask[] {
  const statusPriority = options?.statusPriority ?? HEARTBEAT_STATUS_PRIORITY;
  const preferStale = options?.preferStale === true;
  const statusRank = new Map<string, number>(
    statusPriority.map((status, index) => [status, index]),
  );
  return [...tasks].sort((a, b) => {
    const rankA = statusRank.get(a.status) ?? 999;
    const rankB = statusRank.get(b.status) ?? 999;
    if (rankA !== rankB) return rankA - rankB;
    return preferStale
      ? (a.updatedAt ?? 0) - (b.updatedAt ?? 0)
      : (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  });
}

/**
 * Pick the single task to focus during heartbeat, if any.
 */
function selectHeartbeatFocusTask(
  tasks: HeartbeatTask[],
): HeartbeatTask | null {
  return tasks[0] ?? null;
}

/**
 * Merge task lists, deduplicating by task id.
 */
export function mergeHeartbeatTasks(lists: HeartbeatTask[][]): HeartbeatTask[] {
  const merged = new Map<Id<"tasks">, HeartbeatTask>();
  for (const list of lists) {
    for (const task of list) {
      merged.set(task._id, task);
    }
  }
  return Array.from(merged.values());
}

/**
 * Fetch the orchestrator agent id for the account.
 */
async function getOrchestratorAgentId(
  client: ReturnType<typeof getConvexClient>,
  config: RuntimeConfig,
): Promise<Id<"agents"> | null> {
  const result = (await client.action(
    api.service.actions.getOrchestratorAgentId,
    {
      accountId: config.accountId,
      serviceToken: config.serviceToken,
    },
  )) as { orchestratorAgentId: Id<"agents"> | null };
  return result?.orchestratorAgentId ?? null;
}

/**
 * Extract a task id from a heartbeat response, if present.
 */
function extractTaskIdFromHeartbeatResponse(
  response: string,
): Id<"tasks"> | null {
  const match = TASK_ID_PATTERN.exec(response);
  if (!match?.[1]) return null;
  return match[1] as Id<"tasks">;
}

/**
 * Normalize heartbeat response text to avoid posting ambiguous no-op replies.
 * If HEARTBEAT_OK appears alongside other non-loading lines, treat it as no-op.
 */
export function normalizeHeartbeatResponse(response: string): {
  responseText: string;
  isHeartbeatOk: boolean;
  wasAmbiguousHeartbeatOk: boolean;
} {
  const trimmed = response.trim();
  if (!trimmed) {
    return {
      responseText: "",
      isHeartbeatOk: false,
      wasAmbiguousHeartbeatOk: false,
    };
  }
  if (isHeartbeatOkResponse(trimmed)) {
    return {
      responseText: HEARTBEAT_OK_RESPONSE,
      isHeartbeatOk: true,
      wasAmbiguousHeartbeatOk: false,
    };
  }
  const containsHeartbeatOkToken = /\bHEARTBEAT_OK\b/.test(trimmed);
  if (containsHeartbeatOkToken) {
    return {
      responseText: HEARTBEAT_OK_RESPONSE,
      isHeartbeatOk: true,
      wasAmbiguousHeartbeatOk: true,
    };
  }
  return {
    responseText: trimmed,
    isHeartbeatOk: false,
    wasAmbiguousHeartbeatOk: false,
  };
}

/**
 * Truncate text for compact prompt output.
 */
function truncateHeartbeatText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

/**
 * Build the heartbeat prompt with assigned task context.
 * For the orchestrator, optionally pass taskStatusBaseUrl so the prompt can mention HTTP fallback endpoints.
 */
export function buildHeartbeatMessage(options: {
  focusTask: HeartbeatTask | null;
  tasks: HeartbeatTask[];
  focusTaskThread?: HeartbeatThreadMessagePreview[];
  isOrchestrator: boolean;
  /** When set and isOrchestrator, instructs use of task tools/API for follow-ups and gives HTTP fallback base URL. */
  taskStatusBaseUrl?: string;
}): string {
  const {
    focusTask,
    tasks,
    focusTaskThread = [],
    isOrchestrator,
    taskStatusBaseUrl,
  } = options;
  const actionLine = isOrchestrator
    ? `- Take one concrete action if appropriate (or up to ${ORCHESTRATOR_MAX_FOLLOW_UPS_PER_HEARTBEAT} orchestrator follow-ups across distinct tracked tasks).`
    : "- Take one concrete action if appropriate.";
  const orchestratorLine = isOrchestrator
    ? "- As the orchestrator, follow up on in_progress/review/assigned/blocked tasks (even if assigned to other agents)."
    : null;
  const orchestratorFollowUpBlock = buildOrchestratorFollowUpBlock(
    isOrchestrator,
    tasks.length > 0,
    taskStatusBaseUrl,
  );
  const taskHeading = isOrchestrator ? "Tracked tasks:" : "Assigned tasks:";
  const taskLines = tasks.map((task) => {
    const description = task.description?.trim()
      ? ` — ${truncateHeartbeatText(
          task.description.trim(),
          HEARTBEAT_DESCRIPTION_MAX_CHARS,
        )}`
      : "";
    return `- ${task.title} (${task.status}) — Task ID: ${task._id}${description}`;
  });
  const focusLine = focusTask
    ? `Focus Task ID: ${focusTask._id} (${focusTask.title})`
    : isOrchestrator
      ? "No tracked tasks found."
      : "No assigned tasks found.";
  const sortedThreadPreview = [...focusTaskThread]
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
    .slice(-HEARTBEAT_THREAD_MESSAGE_LIMIT);
  const threadPreviewLines = sortedThreadPreview.map((message) => {
    const authorLabel = message.authorName?.trim() || message.authorId;
    const content = truncateHeartbeatText(
      message.content?.trim() || "(empty)",
      HEARTBEAT_THREAD_MESSAGE_MAX_CHARS,
    );
    return `- ${authorLabel} [${message.authorType}] (${new Date(message.createdAt).toISOString()}): ${content}`;
  });
  const threadPreviewBlock = focusTask
    ? threadPreviewLines.length > 0
      ? `Recent focus task thread updates:\n${threadPreviewLines.join("\n")}`
      : "Recent focus task thread updates:\n- None"
    : "";
  const tasksBlock = taskLines.length > 0 ? taskLines.join("\n") : "- None";
  return `
## Heartbeat Check

Follow the HEARTBEAT.md checklist.
- Load context (WORKING.md, memory, mentions, assigned/tracked tasks, activity feed).
${actionLine}
- Do not narrate the checklist or your intent; reply only with a concrete action update (include Task ID) or with ${HEARTBEAT_OK_RESPONSE}.
- If you took action, post a thread update using AGENTS.md format.
- If you did not take action, reply with exactly one line: ${HEARTBEAT_OK_RESPONSE} (no extra text).
${orchestratorLine ? `\n${orchestratorLine}` : ""}
${orchestratorFollowUpBlock}

${taskHeading}
${tasksBlock}

${threadPreviewBlock}

${focusLine}
If you take action on a task, include a line with: Task ID: <id>. If you work on a task other than the focus task, include its Task ID explicitly.

Current time: ${new Date().toISOString()}
`.trim();
}

/**
 * Build orchestrator-only instructions for heartbeat follow-ups.
 * Assignee follow-up uses response_request only (no task_message) so the thread
 * gets at most one message (the agent's summary). HTTP fallback list omits
 * task-message for this flow.
 */
function buildOrchestratorFollowUpBlock(
  isOrchestrator: boolean,
  hasTrackedTasks: boolean,
  taskStatusBaseUrl?: string,
): string {
  if (!isOrchestrator) return "";
  const base = taskStatusBaseUrl?.trim() ?? "";
  const toolLine =
    "For each selected tracked task, use task_load (or task_get/task_thread/task_search) to load context. When you need assignee follow-up, use response_request only (do not also post task_message). Put a short summary of what you did in your final reply so the thread gets one update. If response_request fails, report BLOCKED with the failed task IDs/agent slugs.";
  const httpLine = base
    ? ` If tools are unavailable, use HTTP: POST ${base}/agent/task-load (body: { "taskId": "..." }), POST ${base}/agent/task-search (body: { "query": "..." }), POST ${base}/agent/task-get (body: { "taskId": "..." }), and POST ${base}/agent/response-request (body: { "taskId": "...", "recipientSlugs": ["..."], "message": "..." }).`
    : " If tools are unavailable, use the HTTP fallback endpoints (task-load, task-search, task-get, response-request) with the base URL from your notification prompt.";
  const oneAction = `Take up to ${ORCHESTRATOR_MAX_FOLLOW_UPS_PER_HEARTBEAT} atomic follow-ups per heartbeat across distinct tracked tasks.`;
  if (!hasTrackedTasks) return "";
  return [
    "- Across tracked tasks, keep follow-ups moving and avoid starvation:",
    `  ${toolLine}${httpLine}`,
    "  Prioritize stale in_progress/review tasks first, then assigned. Only nudge blocked tasks when no active follow-up was queued in this cycle.",
    `  ${oneAction}`,
  ].join("\n");
}

/**
 * Select orchestrator follow-up candidates with explicit priority:
 * in_progress first, then remaining statuses by orchestrator priority
 * (stale-first within each status).
 */
function selectOrchestratorFollowUpCandidates(
  trackedTasks: HeartbeatTask[],
  maxAutoFollowUps: number,
): HeartbeatTask[] {
  if (maxAutoFollowUps <= 0 || trackedTasks.length === 0) {
    return [];
  }
  const filteredTasks = trackedTasks.filter((task) =>
    ORCHESTRATOR_HEARTBEAT_STATUSES.includes(task.status),
  );
  const prioritizedTasks = sortHeartbeatTasks(filteredTasks, {
    statusPriority: ORCHESTRATOR_HEARTBEAT_STATUSES,
    preferStale: true,
  });
  return prioritizedTasks.slice(0, maxAutoFollowUps);
}

interface HeartbeatBehaviorFlags {
  canCreateTasks: boolean;
  canModifyTaskStatus: boolean;
  canCreateDocuments: boolean;
  canMentionAgents: boolean;
}

/**
 * Derive stale threshold per task status.
 * Blocked tasks use a much longer cooldown to avoid repetitive nudges.
 */
function getAssigneeFollowUpStaleMsForTask(options: {
  task: HeartbeatTask;
  staleMs: number;
}): number {
  const { task, staleMs } = options;
  if (task.status === "blocked") {
    return Math.max(staleMs, ORCHESTRATOR_ASSIGNEE_BLOCKED_STALE_MS);
  }
  return staleMs;
}

interface ThreadMessageForHeartbeatFollowUp {
  authorType: RecipientType;
  authorId: string;
  content?: string;
  createdAt: number;
}

/**
 * Resolve behavior flags for heartbeat tool usage.
 * Falls back to shared defaults when no explicit agent override exists.
 */
function resolveHeartbeatBehaviorFlags(
  agent: AgentForHeartbeat,
): HeartbeatBehaviorFlags {
  const defaults = DEFAULT_OPENCLAW_CONFIG.behaviorFlags;
  const effectiveFlags = agent.effectiveBehaviorFlags ?? {};
  const flags = agent.openclawConfig?.behaviorFlags ?? {};
  return {
    canCreateTasks:
      effectiveFlags.canCreateTasks ??
      flags.canCreateTasks ??
      defaults.canCreateTasks,
    canModifyTaskStatus:
      effectiveFlags.canModifyTaskStatus ??
      flags.canModifyTaskStatus ??
      defaults.canModifyTaskStatus,
    canCreateDocuments:
      effectiveFlags.canCreateDocuments ??
      flags.canCreateDocuments ??
      defaults.canCreateDocuments,
    canMentionAgents:
      effectiveFlags.canMentionAgents ??
      flags.canMentionAgents ??
      defaults.canMentionAgents,
  };
}

/**
 * Return true when an assignee message should not reset stale follow-up timers.
 */
function shouldIgnoreAssigneeReplyForFollowUp(content: string | undefined): boolean {
  if (!content) return false;
  const trimmed = content.trim();
  if (!trimmed) return false;
  return (
    isHeartbeatOkResponse(trimmed) || isNoResponseFallbackMessage(trimmed)
  );
}

/**
 * Resolve the latest meaningful assignee-authored message timestamp from a task thread.
 * Placeholder/no-response fallbacks are ignored so they do not block orchestrator nudges.
 */
export function getLastAssigneeReplyTimestamp(
  task: HeartbeatTask,
  thread: ThreadMessageForHeartbeatFollowUp[],
): number | null {
  const assigneeIds = new Set(task.assignedAgentIds);
  for (let index = thread.length - 1; index >= 0; index -= 1) {
    const message = thread[index];
    if (message.authorType !== "agent") continue;
    if (shouldIgnoreAssigneeReplyForFollowUp(message.content)) continue;
    if (assigneeIds.has(message.authorId as Id<"agents">)) {
      return message.createdAt;
    }
  }
  return null;
}

/**
 * Decide if orchestrator should auto-request an assignee follow-up.
 */
export function shouldRequestAssigneeResponse(options: {
  task: HeartbeatTask | null;
  lastAssigneeReplyAt: number | null;
  nowMs: number;
  staleMs?: number;
}): boolean {
  return getAssigneeFollowUpDecision(options).shouldRequest;
}

type AssigneeFollowUpDecisionReason =
  | "missing_task"
  | "unsupported_status"
  | "no_assignees"
  | "not_stale"
  | "stale";

interface AssigneeFollowUpDecision {
  shouldRequest: boolean;
  reason: AssigneeFollowUpDecisionReason;
  referenceTimestamp: number;
  elapsedMs: number;
  staleMs: number;
}

/**
 * Evaluate orchestrator follow-up eligibility and provide a loggable reason.
 */
export function getAssigneeFollowUpDecision(options: {
  task: HeartbeatTask | null;
  lastAssigneeReplyAt: number | null;
  nowMs: number;
  staleMs?: number;
}): AssigneeFollowUpDecision {
  const { task, lastAssigneeReplyAt, nowMs } = options;
  const staleMs = options.staleMs ?? ORCHESTRATOR_ASSIGNEE_STALE_MS;
  if (!task) {
    return {
      shouldRequest: false,
      reason: "missing_task",
      referenceTimestamp: 0,
      elapsedMs: 0,
      staleMs,
    };
  }
  if (!ORCHESTRATOR_HEARTBEAT_STATUSES.includes(task.status)) {
    return {
      shouldRequest: false,
      reason: "unsupported_status",
      referenceTimestamp: 0,
      elapsedMs: 0,
      staleMs,
    };
  }
  if (!task.assignedAgentIds || task.assignedAgentIds.length === 0) {
    return {
      shouldRequest: false,
      reason: "no_assignees",
      referenceTimestamp: 0,
      elapsedMs: 0,
      staleMs,
    };
  }
  const referenceTimestamp =
    lastAssigneeReplyAt ?? task.updatedAt ?? task.createdAt ?? 0;
  const elapsedMs = Math.max(0, nowMs - referenceTimestamp);
  if (elapsedMs >= staleMs) {
    return {
      shouldRequest: true,
      reason: "stale",
      referenceTimestamp,
      elapsedMs,
      staleMs,
    };
  }
  return {
    shouldRequest: false,
    reason: "not_stale",
    referenceTimestamp,
    elapsedMs,
    staleMs,
  };
}

/**
 * Resolve assignee slugs for response_request recipients, excluding requester.
 */
function getAssigneeRecipientSlugs(options: {
  task: HeartbeatTask;
  agents: AgentForHeartbeat[];
  requesterAgentId: Id<"agents">;
}): string[] {
  const { task, agents, requesterAgentId } = options;
  const agentsById = new Map(
    agents.map((candidate) => [candidate._id, candidate]),
  );
  const slugs = new Set<string>();
  for (const assigneeId of task.assignedAgentIds) {
    if (assigneeId === requesterAgentId) continue;
    const assignee = agentsById.get(assigneeId);
    const slug = assignee?.slug?.trim();
    if (!slug) continue;
    slugs.add(slug);
  }
  return Array.from(slugs);
}

/**
 * Fallback follow-up: enqueue response_request notifications for stale
 * assignees. We do not post a thread comment here so the thread gets at
 * most the agent's heartbeat summary. Notification dedupe/cooldown is
 * handled by the notifications service.
 */
async function maybeAutoRequestAssigneeFollowUp(options: {
  client: ReturnType<typeof getConvexClient>;
  config: RuntimeConfig;
  agent: AgentForHeartbeat;
  trackedTasks: HeartbeatTask[];
  canMentionAgents: boolean;
  maxAutoFollowUps: number;
  staleMs?: number;
  followUpMode?: "startup" | "steady";
}): Promise<void> {
  const {
    client,
    config,
    agent,
    trackedTasks,
    canMentionAgents,
    maxAutoFollowUps,
    staleMs = ORCHESTRATOR_ASSIGNEE_STALE_MS,
    followUpMode = "steady",
  } = options;
  if (!canMentionAgents || maxAutoFollowUps <= 0 || trackedTasks.length === 0) {
    return;
  }

  const followUpCandidates = selectOrchestratorFollowUpCandidates(
    trackedTasks,
    maxAutoFollowUps,
  );
  if (followUpCandidates.length === 0) {
    return;
  }
  const activeFollowUpCandidates = followUpCandidates.filter(
    (candidate) => candidate.status !== "blocked",
  );
  const blockedFollowUpCandidates = followUpCandidates.filter(
    (candidate) => candidate.status === "blocked",
  );
  const candidateBatches: HeartbeatTask[][] = [activeFollowUpCandidates];
  const allowBlockedFallback = followUpMode !== "startup";
  if (allowBlockedFallback && blockedFollowUpCandidates.length > 0) {
    candidateBatches.push(blockedFollowUpCandidates);
  }

  const nowMs = Date.now();
  let queuedFollowUps = 0;
  let agents: AgentForHeartbeat[] | null = null;

  for (let batchIndex = 0; batchIndex < candidateBatches.length; batchIndex += 1) {
    const tasks = candidateBatches[batchIndex];
    if (tasks.length === 0) continue;
    const isBlockedFallbackBatch = batchIndex > 0;
    if (isBlockedFallbackBatch && queuedFollowUps > 0) {
      break;
    }
    for (const task of tasks) {
      if (queuedFollowUps >= maxAutoFollowUps) {
        break;
      }

      try {
        const thread = (await client.action(
          api.service.actions.listTaskThreadForAgentTool,
          {
            accountId: config.accountId,
            serviceToken: config.serviceToken,
            agentId: agent._id,
            taskId: task._id,
            limit: 50,
          },
        )) as ThreadMessageForHeartbeatFollowUp[];
        const lastAssigneeReplyAt = getLastAssigneeReplyTimestamp(task, thread);
        const taskStaleMs = getAssigneeFollowUpStaleMsForTask({
          task,
          staleMs,
        });
        const decision = getAssigneeFollowUpDecision({
          task,
          lastAssigneeReplyAt,
          nowMs,
          staleMs: taskStaleMs,
        });
        if (!decision.shouldRequest) {
          log.debug(
            "Skipped auto assignee follow-up",
            task._id,
            `mode=${followUpMode}`,
            `reason=${decision.reason}`,
            `elapsedMs=${decision.elapsedMs}`,
            `staleMs=${decision.staleMs}`,
          );
          continue;
        }

        if (!agents) {
          agents = (await client.action(api.service.actions.listAgents, {
            accountId: config.accountId,
            serviceToken: config.serviceToken,
          })) as AgentForHeartbeat[];
        }
        const recipientSlugs = getAssigneeRecipientSlugs({
          task,
          agents,
          requesterAgentId: agent._id,
        });
        if (recipientSlugs.length === 0) {
          continue;
        }

        const staleMinutes = Math.max(
          1,
          Math.floor(decision.elapsedMs / (60 * 1000)),
        );
        const responseRequestMessage = `Heartbeat follow-up: no assignee update for about ${staleMinutes} minutes on "${task.title}". Please post a progress or blocker update in this task thread.`;
        const result = (await client.action(
          api.service.actions.createResponseRequestNotifications,
          {
            accountId: config.accountId,
            serviceToken: config.serviceToken,
            requesterAgentId: agent._id,
            taskId: task._id,
            recipientSlugs,
            message: responseRequestMessage,
          },
        )) as { notificationIds: Id<"notifications">[] };
        if ((result.notificationIds?.length ?? 0) > 0) {
          queuedFollowUps += 1;
          log.info(
            "Queued auto assignee follow-up request",
            task._id,
            `mode=${followUpMode}`,
            `recipients=${recipientSlugs.join(",")}`,
          );
        }
        // Intentional: we do not post a thread comment here; assignees are
        // notified via response_request only so the thread keeps one message (agent summary).
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        log.warn("Failed to queue auto assignee follow-up:", task._id, errMsg);
      }
    }
  }
}

/**
 * Start heartbeat scheduling for all agents.
 */
export async function startHeartbeats(config: RuntimeConfig): Promise<void> {
  log.info("Starting heartbeat scheduler...");

  const client = getConvexClient();
  const agents = (await client.action(api.service.actions.listAgents, {
    accountId: config.accountId,
    serviceToken: config.serviceToken,
  })) as AgentForHeartbeat[];

  const totalAgents = agents.length;
  agents.forEach((agent, index) => {
    scheduleHeartbeat(agent, config, index, totalAgents);
  });

  state.isRunning = true;
  log.info("Scheduled", agents.length, "agents (staggered)");
}

/** Max window over which to stagger first runs (ms). */
const STAGGER_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

/** Agent shape for heartbeat scheduling (minimal). */
export interface AgentForHeartbeat {
  _id: Id<"agents">;
  name: string;
  slug?: string;
  sessionKey: string;
  heartbeatInterval?: number;
  effectiveBehaviorFlags?: {
    canCreateTasks?: boolean;
    canModifyTaskStatus?: boolean;
    canCreateDocuments?: boolean;
    canMentionAgents?: boolean;
  };
  openclawConfig?: {
    behaviorFlags?: {
      canCreateTasks?: boolean;
      canModifyTaskStatus?: boolean;
      canCreateDocuments?: boolean;
      canMentionAgents?: boolean;
    };
  };
}

/**
 * Schedule heartbeat for a single agent with staggered start to reduce thundering herd.
 */
function scheduleHeartbeat(
  agent: AgentForHeartbeat,
  config: RuntimeConfig,
  index: number,
  totalAgents: number,
): void {
  const intervalMinutes = agent.heartbeatInterval ?? 5;
  const intervalMs = intervalMinutes * 60 * 1000;
  const staggerWindow = Math.min(intervalMs * 0.4, STAGGER_WINDOW_MS);
  const initialDelay =
    totalAgents <= 1
      ? 0
      : (index / totalAgents) * staggerWindow + Math.random() * 2000; // Small jitter per agent

  const execute = () => runHeartbeatCycle(agent, config, intervalMs, true);
  const timeout = setTimeout(execute, initialDelay);
  state.schedules.set(agent._id, timeout);
  state.intervals.set(agent._id, intervalMinutes);
}

/**
 * Run one heartbeat cycle (send message, update Convex). Schedules next run when state.isRunning.
 */
function runHeartbeatCycle(
  agent: AgentForHeartbeat,
  config: RuntimeConfig,
  intervalMs: number,
  isInitialRun = false,
): void {
  const execute = async () => {
    const heartbeatStart = Date.now();
    try {
      log.debug("Executing for", agent.name);

      const client = getConvexClient();
      let assignedTasks: HeartbeatTask[] = [];
      let orchestratorTasks: HeartbeatTask[] = [];
      let isOrchestrator = false;
      try {
        const orchestratorAgentId = await getOrchestratorAgentId(
          client,
          config,
        );
        isOrchestrator =
          orchestratorAgentId != null && orchestratorAgentId === agent._id;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warn("Failed to load orchestrator agent id:", message);
      }

      try {
        assignedTasks = (await client.action(
          api.service.actions.listAssignedTasksForAgent,
          {
            accountId: config.accountId,
            serviceToken: config.serviceToken,
            agentId: agent._id,
            includeDone: false,
            limit: HEARTBEAT_TASK_LIMIT,
          },
        )) as HeartbeatTask[];
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warn("Failed to load assigned tasks for heartbeat:", message);
      }

      if (isOrchestrator) {
        try {
          orchestratorTasks = (await client.action(
            api.service.actions.listTasksForOrchestratorHeartbeat,
            {
              accountId: config.accountId,
              serviceToken: config.serviceToken,
              statuses: ORCHESTRATOR_HEARTBEAT_STATUSES,
              limit: ORCHESTRATOR_HEARTBEAT_TASK_LIMIT,
            },
          )) as HeartbeatTask[];
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          log.warn("Failed to load orchestrator tasks for heartbeat:", message);
        }
      }

      const mergedTasks = mergeHeartbeatTasks([
        assignedTasks,
        orchestratorTasks,
      ]);
      const statusPriority = isOrchestrator
        ? ORCHESTRATOR_HEARTBEAT_STATUSES
        : HEARTBEAT_STATUS_PRIORITY;
      const filteredTasks = mergedTasks.filter((task) =>
        statusPriority.includes(task.status),
      );
      const sortedTasks = sortHeartbeatTasks(filteredTasks, {
        statusPriority,
        preferStale: isOrchestrator,
      });
      const focusTask = selectHeartbeatFocusTask(sortedTasks);
      let focusTaskThread: HeartbeatThreadMessagePreview[] = [];
      if (focusTask) {
        try {
          const details = (await client.action(
            api.service.actions.loadTaskDetailsForAgentTool,
            {
              accountId: config.accountId,
              serviceToken: config.serviceToken,
              agentId: agent._id,
              taskId: focusTask._id,
              messageLimit: HEARTBEAT_THREAD_MESSAGE_LIMIT,
            },
          )) as { thread?: HeartbeatThreadMessagePreview[] };
          if (Array.isArray(details.thread)) {
            focusTaskThread = details.thread;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          log.warn(
            "Failed to load focus task thread for heartbeat context:",
            focusTask._id,
            message,
          );
        }
      }
      const heartbeatMessage = buildHeartbeatMessage({
        focusTask,
        tasks: sortedTasks,
        focusTaskThread,
        isOrchestrator,
        taskStatusBaseUrl: config.taskStatusBaseUrl,
      });

      const behaviorFlags = resolveHeartbeatBehaviorFlags(agent);
      const rawToolCapabilities = getToolCapabilitiesAndSchemas({
        canCreateTasks: behaviorFlags.canCreateTasks,
        canModifyTaskStatus: behaviorFlags.canModifyTaskStatus,
        canCreateDocuments: behaviorFlags.canCreateDocuments,
        hasTaskContext: focusTask != null,
        canMentionAgents: behaviorFlags.canMentionAgents,
        canMarkDone: false,
        isOrchestrator,
      });
      const toolCapabilities = config.openclawClientToolsEnabled
        ? rawToolCapabilities
        : { ...rawToolCapabilities, schemas: [] };
      const sendOptions =
        toolCapabilities.schemas.length > 0
          ? {
              tools: toolCapabilities.schemas,
              toolChoice: "auto" as const,
            }
          : undefined;

      const result = await sendToOpenClaw(
        agent.sessionKey,
        heartbeatMessage,
        sendOptions,
      );
      let responseText = result.text?.trim() ?? "";
      let successfulResponseRequestToolCallCount = 0;

      if (result.toolCalls.length > 0) {
        const outputs: { call_id: string; output: string }[] = [];
        for (const call of result.toolCalls) {
          const toolResult = await executeAgentTool({
            name: call.name,
            arguments: call.arguments,
            agentId: agent._id,
            accountId: config.accountId,
            serviceToken: config.serviceToken,
            taskId: focusTask?._id,
            canMarkDone: toolCapabilities.canMarkDone,
            isOrchestrator,
          });
          if (!toolResult.success) {
            log.warn(
              "Heartbeat tool execution failed",
              call.name,
              toolResult.error ?? "unknown",
            );
          } else if (call.name === "response_request") {
            successfulResponseRequestToolCallCount += 1;
          }
          outputs.push({
            call_id: call.call_id,
            output: JSON.stringify(toolResult),
          });
        }
        if (outputs.length > 0) {
          try {
            const finalText = await sendOpenClawToolResults(
              agent.sessionKey,
              outputs,
            );
            if (finalText?.trim()) {
              responseText = finalText.trim();
            }
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            log.warn("Failed to send heartbeat tool results:", message);
          }
        }
      }

      const normalizedHeartbeat = normalizeHeartbeatResponse(responseText);
      responseText = normalizedHeartbeat.responseText;
      if (normalizedHeartbeat.wasAmbiguousHeartbeatOk) {
        log.warn(
          "Ambiguous heartbeat response normalized to HEARTBEAT_OK",
          agent.name,
          focusTask?._id ?? "no-focus-task",
        );
      }
      const isHeartbeatOk = normalizedHeartbeat.isHeartbeatOk;
      const responseTaskId =
        responseText && !isHeartbeatOk
          ? (extractTaskIdFromHeartbeatResponse(responseText) ??
            focusTask?._id ??
            null)
          : null;

      if (responseText && !isHeartbeatOk) {
        if (responseTaskId) {
          await client.action(api.service.actions.createMessageFromAgent, {
            agentId: agent._id,
            taskId: responseTaskId,
            content: responseText,
            serviceToken: config.serviceToken,
            accountId: config.accountId,
          });
        } else {
          log.warn(
            "Heartbeat response missing task id; skipping thread update",
            agent.name,
          );
        }
      }

      if (isOrchestrator) {
        const cycleStaleMs = isInitialRun
          ? Math.min(
              ORCHESTRATOR_ASSIGNEE_STALE_MS,
              ORCHESTRATOR_ASSIGNEE_STARTUP_STALE_MS,
            )
          : ORCHESTRATOR_ASSIGNEE_STALE_MS;
        if (isInitialRun) {
          log.info(
            "Orchestrator startup follow-up window active",
            `staleMs=${cycleStaleMs}`,
          );
        }
        await maybeAutoRequestAssigneeFollowUp({
          client,
          config,
          agent,
          trackedTasks: sortedTasks,
          canMentionAgents: behaviorFlags.canMentionAgents,
          maxAutoFollowUps: Math.max(
            0,
            ORCHESTRATOR_MAX_FOLLOW_UPS_PER_HEARTBEAT -
              successfulResponseRequestToolCallCount,
          ),
          staleMs: cycleStaleMs,
          followUpMode: isInitialRun ? "startup" : "steady",
        });
      }

      await client.action(api.service.actions.updateAgentHeartbeat, {
        agentId: agent._id,
        status: "online",
        serviceToken: config.serviceToken,
        accountId: config.accountId,
        currentTaskId: responseTaskId ?? undefined,
      });

      const duration = Date.now() - heartbeatStart;
      recordSuccess("heartbeat.execute", duration);
    } catch (error) {
      const duration = Date.now() - heartbeatStart;
      const message = error instanceof Error ? error.message : String(error);
      recordFailure("heartbeat.execute", duration, message);
      log.error("Failed for", agent.name, ":", error);
    }

    if (state.isRunning && state.schedules.has(agent._id)) {
      const nextDelay = intervalMs + Math.random() * 30 * 1000; // Up to 30s jitter
      const timeout = setTimeout(
        () => runHeartbeatCycle(agent, config, intervalMs, false),
        nextDelay,
      );
      state.schedules.set(agent._id, timeout);
    }
  };
  execute();
}

/**
 * Ensure a single agent has a heartbeat scheduled (idempotent).
 * Reschedules if interval changed. Used by agent sync for new/updated agents.
 */
export function ensureHeartbeatScheduled(
  agent: AgentForHeartbeat,
  config: RuntimeConfig,
): void {
  const intervalMinutes = agent.heartbeatInterval ?? 5;
  const existingInterval = state.intervals.get(agent._id);
  const existingTimeout = state.schedules.get(agent._id);

  if (existingTimeout != null && existingInterval === intervalMinutes) {
    return; // Already scheduled with same interval
  }
  if (existingTimeout != null) {
    clearTimeout(existingTimeout);
    state.schedules.delete(agent._id);
    state.intervals.delete(agent._id);
  }

  const intervalMs = intervalMinutes * 60 * 1000;
  const initialDelay = Math.random() * 2000; // Small jitter for sync-added agents
  const timeout = setTimeout(
    () => runHeartbeatCycle(agent, config, intervalMs, true),
    initialDelay,
  );
  state.schedules.set(agent._id, timeout);
  state.intervals.set(agent._id, intervalMinutes);
  log.debug("Scheduled heartbeat for", agent.name);
}

/**
 * Remove heartbeat for an agent. Used by agent sync when an agent is deleted.
 */
export function removeHeartbeat(agentId: Id<"agents">): void {
  const timeout = state.schedules.get(agentId);
  if (timeout != null) {
    clearTimeout(timeout);
    state.schedules.delete(agentId);
    state.intervals.delete(agentId);
    log.debug("Removed heartbeat for agent", agentId);
  }
}

/**
 * Stop all heartbeats.
 */
export function stopHeartbeats(): void {
  state.isRunning = false;

  for (const timeout of state.schedules.values()) {
    clearTimeout(timeout);
  }

  state.schedules.clear();
  state.intervals.clear();
  log.info("Stopped all heartbeats");
}

/**
 * Get heartbeat state for health/fleet metrics.
 */
export function getHeartbeatState(): {
  isRunning: boolean;
  scheduledCount: number;
} {
  return {
    isRunning: state.isRunning,
    scheduledCount: state.schedules.size,
  };
}

/**
 * Get agent ids that currently have a heartbeat scheduled.
 * Used by agent sync to remove orphaned schedules even when gateway sessions are out of sync.
 */
export function getScheduledAgentIds(): Id<"agents">[] {
  return Array.from(state.schedules.keys()) as Id<"agents">[];
}
