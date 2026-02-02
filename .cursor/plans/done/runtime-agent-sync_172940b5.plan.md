---
name: runtime-agent-sync
overview: Add a periodic agent sync loop in the runtime service so new agents are picked up without container restarts, while keeping gateway sessions and heartbeat schedules in sync with Convex.
todos: []
isProject: false
---

# Runtime agent auto-sync

## 1. Context & goal

We need the runtime service to automatically discover newly created agents (and handle deletions/updates) without requiring a Docker restart. The runtime currently fetches agents only at startup, so new agents stay offline. The goal is to add a periodic sync loop that keeps gateway sessions and heartbeat schedules aligned with the Convex agent list, so the UI can show online/offline correctly in live deployments.

Constraints:

- Must be safe for production (no restarts, no manual steps).
- Use existing Convex service auth and APIs.
- Avoid heavy load; keep polling interval configurable.
- Keep behavior backward compatible for existing runtime workflows.

## 2. Codebase research summary

Files inspected:

- [apps/runtime/src/index.ts](apps/runtime/src/index.ts) – runtime startup sequence.
- [apps/runtime/src/gateway.ts](apps/runtime/src/gateway.ts) – registers sessions once at startup.
- [apps/runtime/src/heartbeat.ts](apps/runtime/src/heartbeat.ts) – schedules heartbeats once at startup.
- [apps/runtime/src/config.ts](apps/runtime/src/config.ts) – env config loading.
- [apps/runtime/src/health.ts](apps/runtime/src/health.ts) – runtime health JSON.
- [packages/backend/convex/service/actions.ts](packages/backend/convex/service/actions.ts) – `listAgents` and `updateAgentHeartbeat`.
- [packages/backend/convex/service/agents.ts](packages/backend/convex/service/agents.ts) – internal list/heartbeat mutations.
- [packages/backend/convex/agents.ts](packages/backend/convex/agents.ts) – agent creation/removal.
- [packages/backend/convex/schema.ts](packages/backend/convex/schema.ts) – agent fields.

Key findings:

- Runtime calls `listAgents` only at startup in `initGateway` and `startHeartbeats`.
- Heartbeats are the mechanism that marks agents online via `updateAgentHeartbeat`.
- Agents can be deleted, so the runtime should remove schedules/sessions for missing agents.

## 3. High-level design

Add a periodic agent sync loop in the runtime process:

- **Runtime → Convex**: Poll `api.service.actions.listAgents` on an interval.
- **Sync logic**: Compare the returned agent list with in-memory gateway sessions and heartbeat schedules.
  - Add new agents (register session + schedule heartbeat immediately).
  - Remove deleted agents (clear schedule + remove session).
  - Update changed fields (session key changes, heartbeat interval changes).
- **Health reporting**: Optionally expose sync state (last run, counts, last error) to `/health` for debugging.

Data flow:

Runtime timer → `listAgents` → diff vs local state → `registerSession` + `scheduleHeartbeat` → heartbeat triggers → `updateAgentHeartbeat` → UI shows online status.

## 4. File & module changes

### Existing files to touch

- [apps/runtime/src/config.ts](apps/runtime/src/config.ts)
  - Add `agentSyncInterval` to `RuntimeConfig`.
  - Parse `AGENT_SYNC_INTERVAL` env var (ms) with a safe default (e.g., 60000).
- [apps/runtime/src/index.ts](apps/runtime/src/index.ts)
  - Start the agent sync loop after `initGateway` and `startHeartbeats`.
  - Stop the sync loop in the shutdown handler.
- [apps/runtime/src/gateway.ts](apps/runtime/src/gateway.ts)
  - Add helper(s) to register or remove sessions for a single agent.
  - Optionally expose a `syncGatewaySessions(agents)` helper to update the session map cleanly.
- [apps/runtime/src/heartbeat.ts](apps/runtime/src/heartbeat.ts)
  - Add helper(s) to schedule or remove heartbeats for a single agent.
  - Track heartbeat interval per agent so changes can be rescheduled.
- [apps/runtime/src/health.ts](apps/runtime/src/health.ts)
  - Add agent sync state to `/health` (running, lastSyncAt, lastError).
- [apps/runtime/.env.example](apps/runtime/.env.example)
  - Document `AGENT_SYNC_INTERVAL` and default.
- [apps/runtime/README.md](apps/runtime/README.md)
  - Mention automatic agent sync and the env var.
- [docs/runtime/runtime-docker-compose.md](docs/runtime/runtime-docker-compose.md)
  - Include the env var in the runtime env list (optional but consistent with README).

### New files to create

- [apps/runtime/src/agent-sync.ts](apps/runtime/src/agent-sync.ts)
  - Encapsulate the sync loop (`startAgentSync`, `stopAgentSync`, `getAgentSyncState`).
  - Use `listAgents` to fetch the current list and call gateway/heartbeat helpers.

## 5. Step-by-step tasks

1. **Add config support**
  - Update [apps/runtime/src/config.ts](apps/runtime/src/config.ts) to add `agentSyncInterval` to `RuntimeConfig` and load `AGENT_SYNC_INTERVAL`.
  - Update [.env.example](apps/runtime/.env.example) with a short comment describing the interval.
2. **Create agent sync module**
  - Add [apps/runtime/src/agent-sync.ts](apps/runtime/src/agent-sync.ts) with:
    - `startAgentSync(config)` using `setInterval`.
    - `stopAgentSync()` to clear timers.
    - `getAgentSyncState()` for health output.
  - Use a guard to prevent overlapping syncs.
  - Log counts for added/removed/updated agents.
  - Include JSDoc for public functions.
3. **Expose gateway helpers**
  - Update [apps/runtime/src/gateway.ts](apps/runtime/src/gateway.ts) with helper(s):
    - `registerAgentSession(agent)` – idempotent add/update.
    - `removeAgentSession(agentId or sessionKey)`.
  - Ensure these helpers only modify in-memory state; no side effects.
4. **Expose heartbeat helpers**
  - Update [apps/runtime/src/heartbeat.ts](apps/runtime/src/heartbeat.ts) with helper(s):
    - `ensureHeartbeatScheduled(agent, config)` – idempotent schedule.
    - `removeHeartbeat(agentId)`.
    - Track interval per agent to reschedule if it changes.
  - Keep the existing stagger for startup; new agents can start immediately or with short jitter.
5. **Wire sync into runtime lifecycle**
  - Update [apps/runtime/src/index.ts](apps/runtime/src/index.ts) to:
    - Start agent sync after `startHeartbeats`.
    - Stop agent sync during shutdown.
6. **Health reporting**
  - Update [apps/runtime/src/health.ts](apps/runtime/src/health.ts) to include agent sync state in `/health`.
7. **Docs updates**
  - Update [apps/runtime/README.md](apps/runtime/README.md) and [docs/runtime/runtime-docker-compose.md](docs/runtime/runtime-docker-compose.md) to mention auto-sync and `AGENT_SYNC_INTERVAL`.

## 6. Edge cases & risks

- **Agent created after runtime starts**: sync loop should add it within one interval.
- **Agent deleted**: remove heartbeat and session to avoid errors or wasted work.
- **Session key or heartbeat interval changes**: resync should update schedules and session mapping.
- **Service token errors**: sync loop should log errors and continue retrying without crashing the runtime.
- **Overlapping sync runs**: guard against concurrent sync executions.

## 7. Testing strategy

Unit tests (if added later):

- Diff logic for added/removed/updated agents.
- Rescheduling behavior when heartbeat interval changes.

Manual QA:

- Start runtime, create a new agent, confirm it goes online without restart.
- Delete an agent, confirm runtime stops scheduling heartbeats for it.
- Change `heartbeatInterval`, confirm reschedule behavior.
- Check `/health` for agent sync diagnostics.

## 8. Rollout / migration

- No data migration required.
- Safe to deploy with a default interval; override via `AGENT_SYNC_INTERVAL` if needed.
- Monitor runtime logs for sync errors or unexpected churn.

## 9. TODO checklist

- Add `AGENT_SYNC_INTERVAL` to config and `.env.example`.
- Create `agent-sync.ts` with periodic `listAgents` polling and diffing.
- Add gateway session helpers for idempotent add/remove.
- Add heartbeat helpers and rescheduling support.
- Wire sync start/stop into runtime lifecycle.
- Add agent sync state to `/health` output.
- Update runtime README and docker-compose docs with new env var.
- Manual QA: new agent becomes online without restart.
- Manual QA: deleted agent removed from schedules.
- Manual QA: interval updates reschedule correctly.

