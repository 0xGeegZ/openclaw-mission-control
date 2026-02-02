import { Id } from "@packages/backend/convex/_generated/dataModel";
import { getConvexClient, api } from "./convex-client";
import { RuntimeConfig } from "./config";
import { sendToOpenClaw } from "./gateway";
import { createLogger } from "./logger";

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

/**
 * Start heartbeat scheduling for all agents.
 */
export async function startHeartbeats(config: RuntimeConfig): Promise<void> {
  log.info("Starting heartbeat scheduler...");

  const client = getConvexClient();
  const agents = await client.action(api.service.actions.listAgents, {
    accountId: config.accountId,
    serviceToken: config.serviceToken,
  }) as AgentForHeartbeat[];

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
  totalAgents: number
): void {
  const intervalMinutes = agent.heartbeatInterval ?? 5;
  const intervalMs = intervalMinutes * 60 * 1000;
  const staggerWindow = Math.min(intervalMs * 0.4, STAGGER_WINDOW_MS);
  const initialDelay =
    totalAgents <= 1 ? 0 : (index / totalAgents) * staggerWindow + Math.random() * 2000; // Small jitter per agent

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
  intervalMs: number
): void {
  const execute = async () => {
    try {
      log.debug("Executing for", agent.name);

      const heartbeatMessage = `
## Heartbeat Check

Execute your heartbeat protocol:
1. Check for assigned tasks
2. Check for unread mentions
3. Review activity feed
4. Take one action if appropriate
5. Report status

Current time: ${new Date().toISOString()}
`.trim();

      await sendToOpenClaw(agent.sessionKey, heartbeatMessage);

      const client = getConvexClient();
      await client.action(api.service.actions.updateAgentHeartbeat, {
        agentId: agent._id,
        status: "online",
        serviceToken: config.serviceToken,
        accountId: config.accountId,
      });
    } catch (error) {
      log.error("Failed for", agent.name, ":", error);
    }

    if (state.isRunning && state.schedules.has(agent._id)) {
      const nextDelay = intervalMs + Math.random() * 30 * 1000; // Up to 30s jitter
      const timeout = setTimeout(() => runHeartbeatCycle(agent, config, intervalMs), nextDelay);
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
  config: RuntimeConfig
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
    initialDelay
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
