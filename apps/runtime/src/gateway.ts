import { RuntimeConfig } from "./config";
import { getConvexClient, api } from "./convex-client";
import { Id } from "@packages/backend/convex/_generated/dataModel";
import { createLogger } from "./logger";

const log = createLogger("[Gateway]");

interface GatewayState {
  isRunning: boolean;
  sessions: Map<string, SessionInfo>;
}

interface SessionInfo {
  sessionKey: string;
  agentId: Id<"agents">;
  lastMessage: number | null;
}

const state: GatewayState = {
  isRunning: false,
  sessions: new Map(),
};

/**
 * Initialize the OpenClaw gateway.
 * Fetches agents and registers their sessions.
 */
export async function initGateway(config: RuntimeConfig): Promise<void> {
  log.info("Initializing OpenClaw gateway...");

  const client = getConvexClient();
  const agents = await client.action(api.service.actions.listAgents, {
    accountId: config.accountId,
    serviceToken: config.serviceToken,
  });

  for (const agent of agents) {
    state.sessions.set(agent.sessionKey, {
      sessionKey: agent.sessionKey,
      agentId: agent._id,
      lastMessage: null,
    });
    log.debug("Registered session:", agent.sessionKey);
  }

  state.isRunning = true;
  log.info("Initialized with", state.sessions.size, "sessions");
}

/** Agent shape from listAgents (minimal for registration). */
export interface AgentForSession {
  _id: Id<"agents">;
  sessionKey: string;
}

/**
 * Register or update a single agent session (idempotent).
 * Used by agent sync to add new agents without restart.
 */
export function registerAgentSession(agent: AgentForSession): void {
  state.sessions.set(agent.sessionKey, {
    sessionKey: agent.sessionKey,
    agentId: agent._id,
    lastMessage: null,
  });
  log.debug("Registered session:", agent.sessionKey);
}

/**
 * Remove a session by agent id.
 * Used by agent sync when an agent is deleted in Convex.
 */
export function removeAgentSession(agentId: Id<"agents">): void {
  for (const [key, info] of state.sessions.entries()) {
    if (info.agentId === agentId) {
      state.sessions.delete(key);
      log.debug("Removed session:", key);
      return;
    }
  }
}

/**
 * Send a message to an OpenClaw session.
 */
export async function sendToOpenClaw(
  sessionKey: string, 
  message: string
): Promise<void> {
  const session = state.sessions.get(sessionKey);
  if (!session) {
    throw new Error(`Unknown session: ${sessionKey}`);
  }
  
  log.debug("Sending to", sessionKey, ":", message.substring(0, 100));

  // TODO: Actual OpenClaw message send
  // This would use the OpenClaw SDK/CLI:
  // clawdbot session send --key {sessionKey} --message "{message}"
  
  session.lastMessage = Date.now();
}

/**
 * Receive a response from an OpenClaw session.
 * Called by OpenClaw webhook/callback.
 */
export async function receiveFromOpenClaw(
  sessionKey: string,
  response: string,
  config: { serviceToken: string; accountId: Id<"accounts"> },
  taskId?: Id<"tasks">
): Promise<void> {
  const session = state.sessions.get(sessionKey);
  if (!session) {
    throw new Error(`Unknown session: ${sessionKey}`);
  }
  
  log.debug("Received from", sessionKey, ":", response.substring(0, 100));
  
  // Post response as message in Convex via service action
  const client = getConvexClient();
  
  if (taskId) {
    // Note: Types will be available after running `npx convex dev`
    await client.action(api.service.actions.createMessageFromAgent, {
      agentId: session.agentId,
      taskId,
      content: response,
      serviceToken: config.serviceToken,
      accountId: config.accountId,
    });
  }
}

/**
 * Get current gateway state.
 */
export function getGatewayState(): GatewayState {
  return {
    isRunning: state.isRunning,
    sessions: new Map(state.sessions),
  };
}

/**
 * Shutdown gateway gracefully.
 */
export async function shutdownGateway(): Promise<void> {
  state.isRunning = false;
  state.sessions.clear();
  
  // TODO: Graceful OpenClaw shutdown
  // clawdbot gateway stop
  
  log.info("Shutdown complete");
}
