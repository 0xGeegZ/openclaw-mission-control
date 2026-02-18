---
name: Session key full migration
overview: Migrate the entire runtime and backend off the legacy agent session key (agent:slug:accountId) so that all code uses only the new task/system-scoped session keys from agentRuntimeSessions. This covers initGateway, agent-sync, heartbeat, delivery prompt fallback, health and tests, and backend listAgents/listForRuntime.
todos: []
isProject: false
---

# Complete migration from legacy to new session keys

## 1. Context and goal

We are removing all use of the legacy session key format (`agent:{slug}:{accountId}`) from the runtime and service layer. Today, delivery already uses backend-resolved `deliverySessionKey` (task or system), but **initGateway**, **agent-sync**, and **heartbeat** still rely on `agent.sessionKey` from the `agents` table. The goal is that no runtime path reads or sends the legacy key; all session resolution goes through `agentRuntimeSessions` (task- and system-scoped keys).

**Constraints**

- No backward compatibility: clean cutover. Rollback = deploy previous runtime/backend.
- Keep `agents.sessionKey` in the schema for now (seed, `agents.create`, dashboard display); it is no longer used for routing.
- Preserve multi-tenant isolation and existing delivery/heartbeat semantics.

---

## 2. Codebase research summary

**Main files**

- [apps/runtime/src/gateway.ts](apps/runtime/src/gateway.ts) — `initGateway` and `registerAgentSession` use `agent.sessionKey`; `resolveAgentIdFromSessionKey` parses legacy format as fallback.
- [apps/runtime/src/agent-sync.ts](apps/runtime/src/agent-sync.ts) — Calls `listAgents`, then `registerAgentSession({ _id, sessionKey: agent.sessionKey })` and passes agents to heartbeat.
- [apps/runtime/src/heartbeat.ts](apps/runtime/src/heartbeat.ts) — Uses `agent.sessionKey` in `sendToOpenClaw` and `sendOpenClawToolResults` (lines 884, 921).
- [apps/runtime/src/delivery/prompt.ts](apps/runtime/src/delivery/prompt.ts) — Line 253–254: `sessionKey = context.deliverySessionKey ?? context.agent?.sessionKey ?? "<session-key>"`; must use only `deliverySessionKey`.
- [packages/backend/convex/service/actions.ts](packages/backend/convex/service/actions.ts) — `listAgents` returns agents from `listInternal` (includes `sessionKey`); delivery path already attaches `deliverySessionKey` via `ensureRuntimeSession` in `getNotificationForDelivery`.
- [packages/backend/convex/service/agentRuntimeSessions.ts](packages/backend/convex/service/agentRuntimeSessions.ts) — `ensureRuntimeSession(accountId, agentId, agentSlug, taskId?)` returns task or system session key; `buildTaskSessionKey` / `buildSystemSessionKey` define the new formats.
- [packages/backend/convex/agents.ts](packages/backend/convex/agents.ts) — `generateSessionKey`, `getBySessionKey` (by_session_key on agents); schema has `sessionKey` on agents.
- [packages/backend/convex/service/agents.ts](packages/backend/convex/service/agents.ts) — `listForRuntime` returns `sessionKey: agent.sessionKey`.
- [apps/runtime/src/health.ts](apps/runtime/src/health.ts) — Resolves `x-openclaw-session-key` via `getAgentIdForSessionKey(sessionKey)` (gateway state); no change needed as long as all keys are registered.
- [apps/web/src/app/(dashboard)/[accountSlug]/agents/[agentId]/page.tsx](<apps/web/src/app/(dashboard)/[accountSlug]/agents/[agentId]/page.tsx>) — Displays `agent.sessionKey`; can keep for display (legacy label) or adjust copy.

**Patterns to follow**

- Delivery already uses `deliverySessionKey` and `registerSession(sessionKey, agentId)` before send.
- New key formats: task `task:{taskId}:agent:{agentSlug}:{accountId}:v{gen}`, system `system:agent:{agentSlug}:{accountId}:v{gen}`.

---

## 3. High-level design

**Data flow after migration**

```mermaid
sequenceDiagram
  participant Runtime
  participant Backend
  participant agentRuntimeSessions

  Note over Runtime: Startup / sync
  Runtime->>Backend: listAgents(accountId, serviceToken)
  Backend->>agentRuntimeSessions: ensureRuntimeSession(accountId, agentId, slug, undefined) per agent
  Backend-->>Runtime: agents with systemSessionKey
  Runtime->>Runtime: registerSession(systemSessionKey, agentId) for each

  Note over Runtime: Heartbeat
  Runtime->>Runtime: sendToOpenClaw(agent.systemSessionKey, ...)

  Note over Runtime: Delivery
  Runtime->>Backend: getNotificationForDelivery(...)
  Backend->>agentRuntimeSessions: ensureRuntimeSession(..., taskId?)
  Backend-->>Runtime: deliverySessionKey (task or system)
  Runtime->>Runtime: registerSession(deliverySessionKey, agentId); sendToOpenClaw(deliverySessionKey, ...)
```

**Decisions**

- **Backend**: `listAgents` will ensure a system session per agent (via a new batch helper or per-agent `ensureRuntimeSession`) and return `systemSessionKey` for each agent. It will **not** return `sessionKey` in the runtime contract (or will document that runtime must use `systemSessionKey` only).
- **Runtime**: All registration and send paths use only keys from the backend (system from listAgents, task/system from getNotificationForDelivery). Remove legacy parsing and fallbacks.
- **agents.sessionKey**: Remain in DB and in `agents.get` / `agents.list` for dashboard and seed/create; not used by runtime.

---

## 4. File and module changes

**Backend**

- **[packages/backend/convex/service/agentRuntimeSessions.ts](packages/backend/convex/service/agentRuntimeSessions.ts)**
  - Add internal mutation `ensureSystemSessionsForAccount` (args: `accountId`). For each agent in the account, ensure an active system session (reuse existing or create new generation); return array `{ agentId, sessionKey }[]`. This avoids N separate `ensureRuntimeSession` calls from the action.
- **[packages/backend/convex/service/actions.ts](packages/backend/convex/service/actions.ts)**
  - In `listAgents`: after fetching agents and account, call `ensureSystemSessionsForAccount(accountId)`, build a map `agentId -> sessionKey`, then return agents with `systemSessionKey` set (and omit `sessionKey` from the returned object for the runtime, or keep both and document that runtime uses `systemSessionKey` only). Ensure service auth and account match unchanged.
- **[packages/backend/convex/service/agents.ts](packages/backend/convex/service/agents.ts)**
  - In `listForRuntime`: stop including `sessionKey` in the returned shape (so runtime profile sync does not depend on legacy key). If `AgentForProfile` in runtime still has a field for display, it can be removed or left optional and unused.
- **[packages/backend/convex/agents.ts](packages/backend/convex/agents.ts)**
  - Optional: extend `getBySessionKey` to resolve new-format keys by querying `agentRuntimeSessions` with `by_session_key` and then loading the agent by `agentId`, so any future consumer that receives a new-format key can resolve the agent. Today the runtime does not call this (it uses in-memory map only).

**Runtime**

- **[apps/runtime/src/gateway.ts](apps/runtime/src/gateway.ts)**
  - `initGateway`: Call `listAgents`; for each agent register `state.sessions.set(agent.systemSessionKey, { sessionKey: agent.systemSessionKey, agentId: agent._id, lastMessage: null })`. Do not use `agent.sessionKey`.
  - `AgentForSession` / `ListAgentsItem`: Type must include `systemSessionKey` (and not require `sessionKey` for runtime).
  - `registerAgentSession`: Accept `{ _id, systemSessionKey }` (or keep a single key field named `sessionKey` but documented as “system session key”); register that key.
  - `resolveAgentIdFromSessionKey`: Remove legacy parsing (`agent:slug:accountId`). Only resolve from `state.sessions.get(trimmed)`. If not found, return `"main"` (or keep current behavior for unknown key).
- **[apps/runtime/src/agent-sync.ts](apps/runtime/src/agent-sync.ts)**
  - After `listAgents`, use `agent.systemSessionKey` for registration: `registerAgentSession({ _id: agent._id, sessionKey: agent.systemSessionKey })` (or equivalent type with `systemSessionKey`). Pass agents (with `systemSessionKey`) to `ensureHeartbeatScheduled`.
- **[apps/runtime/src/heartbeat.ts](apps/runtime/src/heartbeat.ts)**
  - `AgentForHeartbeat`: Replace `sessionKey` with `systemSessionKey` (or keep one field that is always the system key). In `runHeartbeatCycle`, use `agent.systemSessionKey` in `sendToOpenClaw` and `sendOpenClawToolResults`.
- **[apps/runtime/src/delivery/prompt.ts](apps/runtime/src/delivery/prompt.ts)**
  - Set `sessionKey = context.deliverySessionKey` only; remove `context.agent?.sessionKey` fallback and the `"<session-key>"` placeholder. Require `deliverySessionKey` for agent notifications (already enforced in delivery.ts).
- **[apps/runtime/src/delivery/types.ts](apps/runtime/src/delivery/types.ts)**
  - If `sessionKey` is optional on context, remove it or document that only `deliverySessionKey` is used.
- **[apps/runtime/src/openclaw-profiles.ts](apps/runtime/src/openclaw-profiles.ts)**
  - `AgentForProfile`: Remove `sessionKey` from the interface if `listForRuntime` no longer returns it; update call sites if any.

**Web (optional)**

- **[apps/web/src/app/(dashboard)/[accountSlug]/agents/[agentId]/page.tsx](<apps/web/src/app/(dashboard)/[accountSlug]/agents/[agentId]/page.tsx>)**
  - Keep showing `agent.sessionKey` if present (from `agents.get`), optionally with a short note that routing uses task/system keys.

**Tests**

- **[apps/runtime/src/delivery.test.ts](apps/runtime/src/delivery.test.ts)**
  - Use `deliverySessionKey` in context; remove or replace `agent.sessionKey` in test fixtures.
- **[apps/runtime/src/openclaw-profiles.test.ts](apps/runtime/src/openclaw-profiles.test.ts)**
  - Replace `sessionKey: "agent:engineer:acc1"` with a system-format key where the type still requires a key, or remove the field if the type no longer has it.
- **[apps/runtime/src/tests/health-agent-endpoints.test.ts](apps/runtime/src/__tests__/health-agent-endpoints.test.ts)**
  - Use a new-format key (e.g. `system:agent:squad-lead:test-account-id:v1`) for `x-openclaw-session-key`; mocks already control `getAgentIdForSessionKey`, so behavior is unchanged.
- **Gateway / agent-sync / heartbeat tests**
  - Any tests that pass or assert `sessionKey` must use `systemSessionKey` and new format.

**Seed / docs**

- **[packages/backend/convex/seed.ts](packages/backend/convex/seed.ts)**
  - No change: continue setting `sessionKey` on agents for DB shape and dashboard; runtime will ignore it.
- **Docs (e.g. [apps/runtime/README.md](apps/runtime/README.md), [docs/runtime/AGENTS.md](docs/runtime/AGENTS.md))**
  - State that runtime uses only backend-resolved task/system session keys; legacy `agent.sessionKey` is not used for routing.

---

## 5. Step-by-step tasks

1. **Backend: batch system sessions**
   In [packages/backend/convex/service/agentRuntimeSessions.ts](packages/backend/convex/service/agentRuntimeSessions.ts), add internal mutation `ensureSystemSessionsForAccount` with args `accountId`. Query all agents for the account; for each, reuse or create active system session (same logic as in `ensureRuntimeSession` for system branch). Return `{ agentId, sessionKey }[]`.
2. **Backend: listAgents returns systemSessionKey**
   In [packages/backend/convex/service/actions.ts](packages/backend/convex/service/actions.ts), in `listAgents`, after loading agents and account, call `ctx.runMutation(internal.service.agentRuntimeSessions.ensureSystemSessionsForAccount, { accountId })`. Build a map from agentId to sessionKey. In the return, add `systemSessionKey` per agent and do not expose `sessionKey` in the returned object (so runtime code does not rely on it). Keep `effectiveBehaviorFlags` and other existing fields.
3. **Backend: listForRuntime drop sessionKey**
   In [packages/backend/convex/service/agents.ts](packages/backend/convex/service/agents.ts), in `listForRuntime` return value, remove `sessionKey: agent.sessionKey`. If any caller needs a key for display, it can be added later as a separate field; for this migration, runtime profile sync should not depend on legacy key.
4. **Backend (optional): getBySessionKey for new keys**
   In [packages/backend/convex/agents.ts](packages/backend/convex/agents.ts), in `getBySessionKey`: if no agent found by `agents.by_session_key`, query `agentRuntimeSessions` by `sessionKey`, take first row, get `agentId`, then return `ctx.db.get(agentId)`. Document that this supports both legacy and new-format keys.
5. **Runtime: gateway types and initGateway**
   In [apps/runtime/src/gateway.ts](apps/runtime/src/gateway.ts), update `ListAgentsItem` / `AgentForSession` to use `systemSessionKey`. In `initGateway`, iterate over listAgents result and `state.sessions.set(agent.systemSessionKey, { sessionKey: agent.systemSessionKey, agentId: agent._id, lastMessage: null })`. Do not read `agent.sessionKey`.
6. **Runtime: registerAgentSession contract**
   In [apps/runtime/src/gateway.ts](apps/runtime/src/gateway.ts), change `registerAgentSession(agent: AgentForSession)` to accept a key that is the system session key (e.g. `agent.systemSessionKey`). Type: `{ _id: Id<"agents">; systemSessionKey: string }` and register `systemSessionKey`.
7. **Runtime: resolveAgentIdFromSessionKey**
   In [apps/runtime/src/gateway.ts](apps/runtime/src/gateway.ts), remove the fallback that parses `agent:slug:accountId`. Only use `state.sessions.get(trimmed)`; if missing, return `"main"` (or keep current unknown-key behavior).
8. **Runtime: agent-sync**
   In [apps/runtime/src/agent-sync.ts](apps/runtime/src/agent-sync.ts), use `agent.systemSessionKey` when calling `registerAgentSession` (e.g. `registerAgentSession({ _id: agent._id, sessionKey: agent.systemSessionKey })` or with a `systemSessionKey` property depending on the chosen type). Ensure the same agent object (with `systemSessionKey`) is passed to `ensureHeartbeatScheduled`.
9. **Runtime: heartbeat**
   In [apps/runtime/src/heartbeat.ts](apps/runtime/src/heartbeat.ts), update `AgentForHeartbeat` to have `systemSessionKey` instead of `sessionKey`. In the cycle, use `agent.systemSessionKey` in `sendToOpenClaw` and `sendOpenClawToolResults`.
10. **Runtime: delivery prompt**
    In [apps/runtime/src/delivery/prompt.ts](apps/runtime/src/delivery/prompt.ts), set `const sessionKey = context.deliverySessionKey` and remove `?? context.agent?.sessionKey ?? "<session-key>"`. Rely on delivery.ts to enforce presence of `deliverySessionKey` for agent notifications.
11. **Runtime: delivery types**
    In [apps/runtime/src/delivery/types.ts](apps/runtime/src/delivery/types.ts), remove or narrow optional `sessionKey` on context if it is only legacy; ensure `deliverySessionKey` is the single source for the key used in prompts.
12. **Runtime: openclaw-profiles**
    In [apps/runtime/src/openclaw-profiles.ts](apps/runtime/src/openclaw-profiles.ts), remove `sessionKey` from `AgentForProfile` and update any code that referenced it (grep showed only the type).
13. **Tests: delivery**
    In [apps/runtime/src/delivery.test.ts](apps/runtime/src/delivery.test.ts), ensure test contexts supply `deliverySessionKey` and do not rely on `agent.sessionKey` for the key used in send/prompt.
14. **Tests: openclaw-profiles**
    In [apps/runtime/src/openclaw-profiles.test.ts](apps/runtime/src/openclaw-profiles.test.ts), update fixtures: either use new-format keys where a key is still required, or remove `sessionKey` from mock agents if the type no longer has it.
15. **Tests: health-agent-endpoints**
    In [apps/runtime/src/**tests**/health-agent-endpoints.test.ts](apps/runtime/src/__tests__/health-agent-endpoints.test.ts), set `sessionKey` to a new-format value (e.g. `system:agent:squad-lead:test-account-id:v1`) so the runtime contract uses only new keys.
16. **Docs**
    In [apps/runtime/README.md](apps/runtime/README.md) and any [docs/runtime/](docs/runtime/) references, state that all session routing uses backend-resolved task/system keys and that legacy `agent.sessionKey` is not used by the runtime.

---

## 6. Edge cases and risks

- **listAgents performance**: Ensuring system sessions for all agents on every listAgents call adds work. Using one batch mutation `ensureSystemSessionsForAccount` keeps it to one mutation per sync/list; if an account has many agents, consider caching or ensuring only on first use (out of scope for this migration).
- **Missing systemSessionKey**: If the backend ever returns an agent without `systemSessionKey`, initGateway or heartbeat could throw or misbehave. Validate in listAgents that every agent has a system session and return type is strict.
- **Health endpoint**: Incoming requests with `x-openclaw-session-key` must be registered in `state.sessions`. Today only the runtime sends these; it always registers before send. So any key in the header should already be registered. No change to health logic beyond tests.
- **Rollback**: No backward compatibility; rollback is redeploy previous version. Document in README/changelog.

---

## 7. Testing strategy

- **Unit**: (1) `resolveAgentIdFromSessionKey` with only map lookup (no legacy parse). (2) Prompt builder with only `deliverySessionKey` (no fallback). (3) `ensureSystemSessionsForAccount` returns one entry per agent and reuses existing active system sessions.
- **Integration**: (1) listAgents returns `systemSessionKey` and initGateway registers them; (2) heartbeat cycle uses `agent.systemSessionKey` and send succeeds when gateway state has that key; (3) delivery continues to use `deliverySessionKey` and registerSession before send.
- **Manual**: Run runtime against Convex dev; create task, assign agent; confirm notification delivered with task-scoped key; trigger heartbeat; confirm system session key used; check health endpoint with new-format key.

---

## 8. Rollout / migration

- Single cutover: deploy backend then runtime (or together). No feature flag.
- No data migration: `agentRuntimeSessions` already stores new keys; `agents.sessionKey` remains for dashboard/seed only.
- Logging: Optional log at runtime startup “Using system session keys only (no legacy agent.sessionKey)”.

---

## 9. TODO checklist

**Backend**

- Add `ensureSystemSessionsForAccount(accountId)` in [packages/backend/convex/service/agentRuntimeSessions.ts](packages/backend/convex/service/agentRuntimeSessions.ts); return `{ agentId, sessionKey }[]`.
- In [packages/backend/convex/service/actions.ts](packages/backend/convex/service/actions.ts) `listAgents`, call the new mutation and return agents with `systemSessionKey`; do not expose `sessionKey` to runtime.
- In [packages/backend/convex/service/agents.ts](packages/backend/convex/service/agents.ts) `listForRuntime`, remove `sessionKey` from return shape.
- (Optional) In [packages/backend/convex/agents.ts](packages/backend/convex/agents.ts) `getBySessionKey`, resolve new-format keys via `agentRuntimeSessions.by_session_key`.

**Runtime**

- In [apps/runtime/src/gateway.ts](apps/runtime/src/gateway.ts): types use `systemSessionKey`; `initGateway` registers `agent.systemSessionKey` only; `registerAgentSession` accepts system key; `resolveAgentIdFromSessionKey` no legacy parse.
- In [apps/runtime/src/agent-sync.ts](apps/runtime/src/agent-sync.ts): use `agent.systemSessionKey` for `registerAgentSession` and pass agents with `systemSessionKey` to heartbeat.
- In [apps/runtime/src/heartbeat.ts](apps/runtime/src/heartbeat.ts): `AgentForHeartbeat` has `systemSessionKey`; use it in `sendToOpenClaw` and `sendOpenClawToolResults`.
- In [apps/runtime/src/delivery/prompt.ts](apps/runtime/src/delivery/prompt.ts): `sessionKey = context.deliverySessionKey` only; remove legacy fallback.
- In [apps/runtime/src/delivery/types.ts](apps/runtime/src/delivery/types.ts): remove or narrow legacy `sessionKey` on context.
- In [apps/runtime/src/openclaw-profiles.ts](apps/runtime/src/openclaw-profiles.ts): remove `sessionKey` from `AgentForProfile`.

**Tests**

- [apps/runtime/src/delivery.test.ts](apps/runtime/src/delivery.test.ts): use `deliverySessionKey` in fixtures; no `agent.sessionKey` for routing.
- [apps/runtime/src/openclaw-profiles.test.ts](apps/runtime/src/openclaw-profiles.test.ts): new-format keys or no `sessionKey` in mocks.
- [apps/runtime/src/**tests**/health-agent-endpoints.test.ts](apps/runtime/src/__tests__/health-agent-endpoints.test.ts): use new-format session key in requests.
- Any gateway/agent-sync/heartbeat tests: assert or pass `systemSessionKey` in new format.

**Docs**

- [apps/runtime/README.md](apps/runtime/README.md) and [docs/runtime/](docs/runtime/): document that runtime uses only backend-resolved task/system session keys; legacy `agent.sessionKey` is not used for routing.
