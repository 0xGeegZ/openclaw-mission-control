import { getConvexClient, api } from "./convex-client";
import { RuntimeConfig } from "./config";
import { sendToOpenClaw } from "./gateway";

interface HeartbeatState {
  isRunning: boolean;
  schedules: Map<string, NodeJS.Timeout>;
}

const state: HeartbeatState = {
  isRunning: false,
  schedules: new Map(),
};

/**
 * Start heartbeat scheduling for all agents.
 */
export async function startHeartbeats(config: RuntimeConfig): Promise<void> {
  console.log("[Heartbeat] Starting heartbeat scheduler...");
  
  // Fetch agents via service action
  const client = getConvexClient();
  // Note: Types will be available after running `npx convex dev`
  const agents = await client.action(api.service.actions.listAgents, {
    accountId: config.accountId,
    serviceToken: config.serviceToken,
  });
  
  const totalAgents = agents.length;
  agents.forEach((agent: { _id: string; name: string; sessionKey?: string; heartbeatInterval?: number }, index: number) => {
    scheduleHeartbeat(agent, config, index, totalAgents);
  });

  state.isRunning = true;
  console.log(`[Heartbeat] Scheduled ${agents.length} agents (staggered)`);
}

/** Max window over which to stagger first runs (ms). */
const STAGGER_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Schedule heartbeat for a single agent with staggered start to reduce thundering herd.
 */
function scheduleHeartbeat(
  agent: any,
  config: RuntimeConfig,
  index: number,
  totalAgents: number
): void {
  const intervalMs = (agent.heartbeatInterval || 5) * 60 * 1000; // Default 5 minutes
  const staggerWindow = Math.min(intervalMs * 0.4, STAGGER_WINDOW_MS);
  const initialDelay =
    totalAgents <= 1 ? 0 : (index / totalAgents) * staggerWindow + Math.random() * 2000; // Small jitter per agent

  const execute = async () => {
    try {
      console.log(`[Heartbeat] Executing for ${agent.name}`);
      
      // Send heartbeat message to agent
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
      
      // Update heartbeat status in Convex via service action
      // Note: Types will be available after running `npx convex dev`
      const client = getConvexClient();
      await client.action(api.service.actions.updateAgentHeartbeat, {
        agentId: agent._id,
        status: "online",
        serviceToken: config.serviceToken,
        accountId: config.accountId,
      });
      
    } catch (error) {
      console.error(`[Heartbeat] Failed for ${agent.name}:`, error);
    }
    
    // Schedule next run at full interval (stagger only on first run)
    if (state.isRunning) {
      const nextDelay = intervalMs + Math.random() * 30 * 1000; // Up to 30s jitter between cycles
      const timeout = setTimeout(execute, nextDelay);
      state.schedules.set(agent._id, timeout);
    }
  };

  const timeout = setTimeout(execute, initialDelay);
  state.schedules.set(agent._id, timeout);
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
  console.log("[Heartbeat] Stopped all heartbeats");
}

/**
 * Get heartbeat state for health/fleet metrics.
 */
export function getHeartbeatState(): { isRunning: boolean; scheduledCount: number } {
  return {
    isRunning: state.isRunning,
    scheduledCount: state.schedules.size,
  };
}
