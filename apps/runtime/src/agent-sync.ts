import { RuntimeConfig } from "./config";
import { getConvexClient, api } from "./convex-client";
import { getGatewayState, registerAgentSession, removeAgentSession } from "./gateway";
import {
  ensureHeartbeatScheduled,
  getScheduledAgentIds,
  removeHeartbeat,
  type AgentForHeartbeat,
} from "./heartbeat";
import { createLogger } from "./logger";
import {
  syncOpenClawProfiles,
  type AgentForProfile,
} from "./openclaw-profiles";
import { Id } from "@packages/backend/convex/_generated/dataModel";

const log = createLogger("[AgentSync]");

interface SyncState {
  running: boolean;
  lastSyncAt: number | null;
  lastError: string | null;
  syncInProgress: boolean;
  addedCount: number;
  removedCount: number;
}

const state: SyncState = {
  running: false,
  lastSyncAt: null,
  lastError: null,
  syncInProgress: false,
  addedCount: 0,
  removedCount: 0,
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Run one sync: fetch agents from Convex, diff with gateway/heartbeat state,
 * add new agents and remove deleted ones.
 */
async function runSync(config: RuntimeConfig): Promise<void> {
  if (state.syncInProgress) {
    log.debug("Sync already in progress, skipping");
    return;
  }
  state.syncInProgress = true;
  state.lastError = null;

  try {
    const client = getConvexClient();
    const agents = (await client.action(api.service.actions.listAgents, {
      accountId: config.accountId,
      serviceToken: config.serviceToken,
    })) as Array<AgentForHeartbeat & { _id: Id<"agents"> }>;

    const gateway = getGatewayState();
    const sessionAgentIds = new Set(
      Array.from(gateway.sessions.values()).map((s) => s.agentId)
    );
    const scheduledAgentIds = new Set(getScheduledAgentIds());
    const currentAgentIds = new Set([...sessionAgentIds, ...scheduledAgentIds]);
    const freshIds = new Set(agents.map((a) => a._id));

    let added = 0;
    let removed = 0;

    for (const agentId of currentAgentIds) {
      if (!freshIds.has(agentId)) {
        removeHeartbeat(agentId);
        removeAgentSession(agentId);
        removed++;
      }
    }

    for (const agent of agents) {
      removeAgentSession(agent._id);
      registerAgentSession({ _id: agent._id, sessionKey: agent.sessionKey });
      ensureHeartbeatScheduled(agent, config);
      if (!currentAgentIds.has(agent._id)) {
        added++;
      }
    }

    if (config.openclawProfileSyncEnabled) {
      const profileAgents = (await client.action(
        api.service.actions.listAgentsForRuntime,
        {
          accountId: config.accountId,
          serviceToken: config.serviceToken,
        },
      )) as AgentForProfile[];

      syncOpenClawProfiles(profileAgents, {
        workspaceRoot: config.openclawWorkspaceRoot,
        configPath: config.openclawConfigPath,
        agentsMdPath: config.openclawAgentsMdPath,
      });
    }

    state.lastSyncAt = Date.now();
    state.addedCount = added;
    state.removedCount = removed;
    if (added > 0 || removed > 0) {
      log.info("Sync complete:", { added, removed, total: agents.length });
    }
  } catch (error) {
    const message = getErrorMessage(error);
    state.lastError = message;
    log.error("Sync failed:", message);
  } finally {
    state.syncInProgress = false;
  }
}

/**
 * Run profile sync once (fetch listAgentsForRuntime, write workspaces and openclaw.json).
 * Used at startup before heartbeats so OpenClaw config exists when gateway runs.
 */
export async function runProfileSyncOnce(config: RuntimeConfig): Promise<void> {
  if (!config.openclawProfileSyncEnabled) return;
  try {
    const client = getConvexClient();
    const profileAgents = (await client.action(
      api.service.actions.listAgentsForRuntime,
      {
        accountId: config.accountId,
        serviceToken: config.serviceToken,
      },
    )) as AgentForProfile[];
    syncOpenClawProfiles(profileAgents, {
      workspaceRoot: config.openclawWorkspaceRoot,
      configPath: config.openclawConfigPath,
      agentsMdPath: config.openclawAgentsMdPath,
    });
  } catch (error) {
    log.warn("Initial profile sync failed:", getErrorMessage(error));
  }
}

/**
 * Start the periodic agent sync loop.
 * Fetches the agent list from Convex on an interval and keeps gateway sessions
 * and heartbeat schedules in sync so new agents go online without restart.
 */
export function startAgentSync(config: RuntimeConfig): void {
  if (state.running) {
    log.debug("Agent sync already running");
    return;
  }
  state.running = true;
  log.info("Starting agent sync, interval", config.agentSyncInterval, "ms");

  const tick = () => runSync(config);
  tick(); // run once immediately
  const intervalId = setInterval(tick, config.agentSyncInterval);
  (state as SyncState & { _intervalId?: NodeJS.Timeout })._intervalId =
    intervalId;
}

/**
 * Stop the agent sync loop.
 */
export function stopAgentSync(): void {
  if (!state.running) return;
  state.running = false;
  const s = state as SyncState & { _intervalId?: NodeJS.Timeout };
  if (s._intervalId != null) {
    clearInterval(s._intervalId);
    s._intervalId = undefined;
  }
  log.info("Agent sync stopped");
}

/**
 * Get agent sync state for health endpoint.
 */
export function getAgentSyncState(): {
  running: boolean;
  lastSyncAt: number | null;
  lastError: string | null;
  addedCount: number;
  removedCount: number;
} {
  return {
    running: state.running,
    lastSyncAt: state.lastSyncAt,
    lastError: state.lastError,
    addedCount: state.addedCount,
    removedCount: state.removedCount,
  };
}
