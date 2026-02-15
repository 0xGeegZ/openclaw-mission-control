import { RuntimeConfig } from "./config";
import { getConvexClient, api } from "./convex-client";
import {
  getGatewayState,
  registerAgentSession,
  removeAgentSession,
} from "./gateway";
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
import { recordSuccess, recordFailure } from "./metrics";

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

  const syncStart = Date.now();
  try {
    const client = getConvexClient();
    const agents = (await client.action(api.service.actions.listAgents, {
      accountId: config.accountId,
      serviceToken: config.serviceToken,
    })) as Array<AgentForHeartbeat & { _id: Id<"agents"> }>;

    const gateway = getGatewayState();
    const sessionAgentIds = new Set(
      Array.from(gateway.sessions.values()).map((s) => s.agentId),
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

      const { configChanged } = syncOpenClawProfiles(profileAgents, {
        workspaceRoot: config.openclawWorkspaceRoot,
        configPath: config.openclawConfigPath,
        agentsMdPath: config.openclawAgentsMdPath,
        heartbeatMdPath: config.openclawHeartbeatMdPath,
      });
      // Reload is handled by the gateway when OPENCLAW_CONFIG_RELOAD=1 (file watch + restart).
      if (configChanged) {
        log.debug(
          "OpenClaw config file changed; gateway will reload if OPENCLAW_CONFIG_RELOAD=1",
        );
      }
    }

    state.lastSyncAt = Date.now();
    state.addedCount = added;
    state.removedCount = removed;
    const syncDuration = Date.now() - syncStart;
    recordSuccess("agent_sync.run", syncDuration);
    if (added > 0 || removed > 0) {
      log.info("Sync complete:", { added, removed, total: agents.length });
    }
  } catch (error) {
    const message = getErrorMessage(error);
    const syncDuration = Date.now() - syncStart;
    recordFailure("agent_sync.run", syncDuration, message);
    state.lastError = message;
    log.error("Sync failed:", message);
  } finally {
    state.syncInProgress = false;
  }
}

/**
 * Run profile sync once (fetch listAgentsForRuntime, write workspaces and openclaw.json).
 * Used at startup before heartbeats so OpenClaw config exists when gateway runs.
 * When profile sync is disabled and the gateway URL is set, logs a one-time warning
 * so operators know why SOUL.md/AGENTS.md/TOOLS.md are missing.
 */
export async function runProfileSyncOnce(config: RuntimeConfig): Promise<void> {
  if (!config.openclawProfileSyncEnabled) {
    if (config.openclawGatewayUrl?.trim()) {
      log.warn(
        "Profile sync is disabled (OPENCLAW_PROFILE_SYNC). Agent workspaces (SOUL.md, AGENTS.md, TOOLS.md) will not be written; set OPENCLAW_PROFILE_SYNC=true to populate them.",
      );
    }
    return;
  }
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
      heartbeatMdPath: config.openclawHeartbeatMdPath,
    });
  } catch (error) {
    const message = getErrorMessage(error);
    log.warn("Initial profile sync failed", { error: message });
    if (
      message.includes("EACCES") ||
      message.toLowerCase().includes("permission denied")
    ) {
      log.warn(
        "Workspace mount must be writable by runtime. From repo root run: sudo chown -R $(id -u):$(id -g) .runtime/openclaw-workspace && sudo chmod -R a+rwX .runtime/openclaw-workspace (or re-run npm run dev:openclaw which does this automatically).",
      );
    }
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
