import { Doc, Id } from "@packages/backend/convex/_generated/dataModel";
import { getConvexClient, api } from "./convex-client";
import { RuntimeConfig } from "./config";
import { sendOpenClawToolResults, sendToOpenClaw } from "./gateway";
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
import { DEFAULT_OPENCLAW_CONFIG } from "@packages/shared";

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
const HEARTBEAT_STATUS_PRIORITY: HeartbeatStatus[] = ["in_progress", "assigned"];
const ORCHESTRATOR_HEARTBEAT_STATUS_PRIORITY: HeartbeatStatus[] = [
  "in_progress",
  "blocked",
  "assigned",
];
const ORCHESTRATOR_HEARTBEAT_STATUSES: HeartbeatStatus[] = [
  "in_progress",
  "blocked",
  "assigned",
];
const ORCHESTRATOR_ASSIGNEE_STALE_MS = 3 * 60 * 60 * 1000;
const ORCHESTRATOR_AUTO_REQUEST_STATUSES: HeartbeatStatus[] = [
  "assigned",
  "in_progress",
  "blocked",
];
const TASK_ID_PATTERN = /Task ID:\s*([A-Za-z0-9_-]+)/i;

type HeartbeatTask = Doc<"tasks">;
type HeartbeatStatus = HeartbeatTask["status"];

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
  isOrchestrator: boolean;
  /** When set and isOrchestrator, instructs use of task tools/API for follow-ups and gives HTTP fallback base URL. */
  taskStatusBaseUrl?: string;
}): string {
  const { focusTask, tasks, isOrchestrator, taskStatusBaseUrl } = options;
  const orchestratorLine = isOrchestrator
    ? "- As the orchestrator, follow up on assigned/in_progress/blocked tasks (even if assigned to other agents)."
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
  const tasksBlock = taskLines.length > 0 ? taskLines.join("\n") : "- None";
  return `
## Heartbeat Check

Follow the HEARTBEAT.md checklist.
- Load context (WORKING.md, memory, mentions, assigned/tracked tasks, activity feed).
- Take one concrete action if appropriate.
- Do not narrate the checklist or your intent; reply only with a concrete action update (include Task ID) or with ${HEARTBEAT_OK_RESPONSE}.
- If you took action, post a thread update using AGENTS.md format.
- If you did not take action, reply with a single line: ${HEARTBEAT_OK_RESPONSE}
${orchestratorLine ? `\n${orchestratorLine}` : ""}
${orchestratorFollowUpBlock}

${taskHeading}
${tasksBlock}

${focusLine}
If you take action on a task, include a line with: Task ID: <id>. If you work on a task other than the focus task, include its Task ID explicitly.

Current time: ${new Date().toISOString()}
`.trim();
}

/**
 * Build orchestrator-only instructions: do a follow-up per tracked task using task tools or API.
 */
function buildOrchestratorFollowUpBlock(
  isOrchestrator: boolean,
  hasTrackedTasks: boolean,
  taskStatusBaseUrl?: string,
): string {
  if (!isOrchestrator) return "";
  const base = taskStatusBaseUrl?.trim() ?? "";
  const toolLine =
    "For each tracked task, use the task_search or task_get / task_load tool to load task context (or search related work); then perform one follow-up using response_request to the assignee (use task_message only for a general thread update). You must request a response from assignees when waiting on them.";
  const httpLine = base
    ? ` If tools are unavailable, use HTTP: POST ${base}/agent/task-search (body: { "query": "..." }), POST ${base}/agent/task-get (body: { "taskId": "..." }), or POST ${base}/agent/task-load for full task + thread.`
    : " If tools are unavailable, use the HTTP fallback endpoints (task-search, task-get, task-load) with the base URL from your notification prompt.";
  const oneAction =
    "Still take only one atomic action per heartbeat (one task follow-up per run).";
  if (!hasTrackedTasks) return "";
  return [
    "- Across tracked tasks, keep follow-ups moving and avoid starvation:",
    `  ${toolLine}${httpLine}`,
    "  Prioritize the stalest blocked/in_progress/assigned task first.",
    `  ${oneAction}`,
  ].join("\n");
}

interface HeartbeatBehaviorFlags {
  canCreateTasks: boolean;
  canModifyTaskStatus: boolean;
  canCreateDocuments: boolean;
  canMentionAgents: boolean;
}

interface ThreadMessageForHeartbeatFollowUp {
  authorType: "user" | "agent";
  authorId: string;
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
 * Resolve the latest assignee-authored message timestamp from a task thread.
 */
function getLastAssigneeReplyTimestamp(
  task: HeartbeatTask,
  thread: ThreadMessageForHeartbeatFollowUp[],
): number | null {
  const assigneeIds = new Set(task.assignedAgentIds);
  for (let index = thread.length - 1; index >= 0; index -= 1) {
    const message = thread[index];
    if (message.authorType !== "agent") continue;
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
  const { task, lastAssigneeReplyAt, nowMs } = options;
  const staleMs = options.staleMs ?? ORCHESTRATOR_ASSIGNEE_STALE_MS;
  if (!task) return false;
  if (!ORCHESTRATOR_AUTO_REQUEST_STATUSES.includes(task.status)) return false;
  if (!task.assignedAgentIds || task.assignedAgentIds.length === 0) return false;
  const referenceTimestamp =
    lastAssigneeReplyAt ?? task.updatedAt ?? task.createdAt ?? 0;
  return nowMs - referenceTimestamp >= staleMs;
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
 * Fallback follow-up: if the orchestrator didn't request a response and assignees are stale,
 * enqueue a response_request to assigned agents.
 */
async function maybeAutoRequestAssigneeFollowUp(options: {
  client: ReturnType<typeof getConvexClient>;
  config: RuntimeConfig;
  agent: AgentForHeartbeat;
  focusTask: HeartbeatTask | null;
  canMentionAgents: boolean;
  hasResponseRequestToolCall: boolean;
}): Promise<void> {
  const {
    client,
    config,
    agent,
    focusTask,
    canMentionAgents,
    hasResponseRequestToolCall,
  } = options;
  if (!focusTask || !canMentionAgents || hasResponseRequestToolCall) return;

  try {
    const thread = (await client.action(
      api.service.actions.listTaskThreadForAgentTool,
      {
        accountId: config.accountId,
        serviceToken: config.serviceToken,
        agentId: agent._id,
        taskId: focusTask._id,
        limit: 50,
      },
    )) as ThreadMessageForHeartbeatFollowUp[];
    const lastAssigneeReplyAt = getLastAssigneeReplyTimestamp(focusTask, thread);
    const nowMs = Date.now();
    if (
      !shouldRequestAssigneeResponse({
        task: focusTask,
        lastAssigneeReplyAt,
        nowMs,
      })
    ) {
      return;
    }

    const agents = (await client.action(api.service.actions.listAgents, {
      accountId: config.accountId,
      serviceToken: config.serviceToken,
    })) as AgentForHeartbeat[];
    const recipientSlugs = getAssigneeRecipientSlugs({
      task: focusTask,
      agents,
      requesterAgentId: agent._id,
    });
    if (recipientSlugs.length === 0) return;

    const referenceTimestamp =
      lastAssigneeReplyAt ?? focusTask.updatedAt ?? focusTask.createdAt ?? nowMs;
    const staleMinutes = Math.max(
      1,
      Math.floor((nowMs - referenceTimestamp) / (60 * 1000)),
    );
    const responseRequestMessage = `Heartbeat follow-up: no assignee update for about ${staleMinutes} minutes on "${focusTask.title}". Please post a progress or blocker update in this task thread.`;
    const result = (await client.action(
      api.service.actions.createResponseRequestNotifications,
      {
        accountId: config.accountId,
        serviceToken: config.serviceToken,
        requesterAgentId: agent._id,
        taskId: focusTask._id,
        recipientSlugs,
        message: responseRequestMessage,
      },
    )) as { notificationIds: Id<"notifications">[] };
    if ((result.notificationIds?.length ?? 0) > 0) {
      log.info(
        "Queued auto assignee follow-up request",
        focusTask._id,
        `recipients=${recipientSlugs.join(",")}`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn("Failed to queue auto assignee follow-up:", message);
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

  const execute = () => runHeartbeatCycle(agent, config, intervalMs);
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
        ? ORCHESTRATOR_HEARTBEAT_STATUS_PRIORITY
        : HEARTBEAT_STATUS_PRIORITY;
      const filteredTasks = mergedTasks.filter((task) =>
        statusPriority.includes(task.status),
      );
      const sortedTasks = sortHeartbeatTasks(filteredTasks, {
        statusPriority,
        preferStale: isOrchestrator,
      });
      const focusTask = selectHeartbeatFocusTask(sortedTasks);
      const heartbeatMessage = buildHeartbeatMessage({
        focusTask,
        tasks: sortedTasks,
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
      const hasResponseRequestToolCall = result.toolCalls.some(
        (call) => call.name === "response_request",
      );

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

      const isHeartbeatOk = isHeartbeatOkResponse(responseText);
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
        await maybeAutoRequestAssigneeFollowUp({
          client,
          config,
          agent,
          focusTask,
          canMentionAgents: behaviorFlags.canMentionAgents,
          hasResponseRequestToolCall,
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
        () => runHeartbeatCycle(agent, config, intervalMs),
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
    () => runHeartbeatCycle(agent, config, intervalMs),
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
