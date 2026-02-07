import { Doc, Id } from "@packages/backend/convex/_generated/dataModel";
import { getConvexClient, api } from "./convex-client";
import { RuntimeConfig } from "./config";
import { sendToOpenClaw } from "./gateway";
import { createLogger } from "./logger";
import { recordSuccess, recordFailure } from "./metrics";
import { HEARTBEAT_OK_RESPONSE } from "./heartbeat-constants";

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
const HEARTBEAT_DESCRIPTION_MAX_CHARS = 240;
const HEARTBEAT_STATUS_PRIORITY = ["in_progress", "assigned"];
const ORCHESTRATOR_HEARTBEAT_STATUSES: HeartbeatStatus[] = [
  "in_progress",
  "assigned",
];
const TASK_ID_PATTERN = /Task ID:\s*([A-Za-z0-9_-]+)/i;

type HeartbeatTask = Doc<"tasks">;
type HeartbeatStatus = HeartbeatTask["status"];

/**
 * Sort tasks by heartbeat priority (in_progress > assigned) and recency.
 */
function sortHeartbeatTasks(tasks: HeartbeatTask[]): HeartbeatTask[] {
  const statusRank = new Map<string, number>(
    HEARTBEAT_STATUS_PRIORITY.map((status, index) => [status, index]),
  );
  return [...tasks].sort((a, b) => {
    const rankA = statusRank.get(a.status) ?? 999;
    const rankB = statusRank.get(b.status) ?? 999;
    if (rankA !== rankB) return rankA - rankB;
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
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
 */
export function buildHeartbeatMessage(options: {
  focusTask: HeartbeatTask | null;
  tasks: HeartbeatTask[];
  isOrchestrator: boolean;
}): string {
  const { focusTask, tasks, isOrchestrator } = options;
  const orchestratorLine = isOrchestrator
    ? "- As the orchestrator, follow up on in_progress/assigned tasks (even if assigned to other agents)."
    : null;
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
- If you took action, post a thread update using AGENTS.md format.
- If you did not take action, reply with a single line: ${HEARTBEAT_OK_RESPONSE}
${orchestratorLine ? `\n${orchestratorLine}` : ""}

${taskHeading}
${tasksBlock}

${focusLine}
If you take action on a task, include a line with: Task ID: <id>. If you work on a task other than the focus task, include its Task ID explicitly.

Current time: ${new Date().toISOString()}
`.trim();
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
  sessionKey: string;
  heartbeatInterval?: number;
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
              limit: HEARTBEAT_TASK_LIMIT,
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
      const filteredTasks = mergedTasks.filter((task) =>
        HEARTBEAT_STATUS_PRIORITY.includes(task.status),
      );
      const sortedTasks = sortHeartbeatTasks(filteredTasks);
      const focusTask = selectHeartbeatFocusTask(sortedTasks);
      const heartbeatMessage = buildHeartbeatMessage({
        focusTask,
        tasks: sortedTasks,
        isOrchestrator,
      });

      const result = await sendToOpenClaw(agent.sessionKey, heartbeatMessage);
      const responseText = result.text?.trim() ?? "";
      const isHeartbeatOk = responseText === HEARTBEAT_OK_RESPONSE;
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
