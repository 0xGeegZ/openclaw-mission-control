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
  const agents = await client.action(api.service.actions.listAgents as any, {
    accountId: config.accountId,
    serviceToken: config.serviceToken,
  });
  
  for (const agent of agents) {
    scheduleHeartbeat(agent, config);
  }
  
  state.isRunning = true;
  console.log(`[Heartbeat] Scheduled ${agents.length} agents`);
}

/**
 * Schedule heartbeat for a single agent.
 */
function scheduleHeartbeat(agent: any, config: RuntimeConfig): void {
  // Stagger heartbeats to avoid spikes
  const intervalMs = (agent.heartbeatInterval || 5) * 60 * 1000; // Default 5 minutes
  const jitter = Math.random() * 60 * 1000; // Up to 1 minute jitter
  
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
      await client.action(api.service.actions.updateAgentHeartbeat as any, {
        agentId: agent._id,
        status: "online",
        serviceToken: config.serviceToken,
        accountId: config.accountId,
      });
      
    } catch (error) {
      console.error(`[Heartbeat] Failed for ${agent.name}:`, error);
    }
    
    // Schedule next heartbeat
    if (state.isRunning) {
      const timeout = setTimeout(execute, intervalMs);
      state.schedules.set(agent._id, timeout);
    }
  };
  
  // Start with jittered delay
  const timeout = setTimeout(execute, jitter);
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
