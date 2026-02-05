---
name: Agent prompt and tool fixes
overview: 'Code review of the current branch (feat/add-tools) plus a plan to fix two agent-message issues: (1) agents confusing their identity (e.g. Engineer asking "Am I the QA?"), and (2) task_status tool reported as "in Capabilities but not in my function set" / tool blocked. Port 3001 is out of scope (user confirmed it is the web app port).'
todos: []
isProject: false
---

# Agent prompt and tool reliability fixes

## 1. Code review summary (current branch `feat/add-tools`)

### Scope of changes

- **Runtime:** [apps/runtime/src/delivery.ts](apps/runtime/src/delivery.ts), [apps/runtime/src/tooling/agentTools.ts](apps/runtime/src/tooling/agentTools.ts), [apps/runtime/src/tooling/taskStatusTool.ts](apps/runtime/src/tooling/taskStatusTool.ts), [apps/runtime/src/config.ts](apps/runtime/src/config.ts), new tests and vitest config.
- **Web:** [apps/web/src/components/tasks/AgentsSidebar.tsx](apps/web/src/components/tasks/AgentsSidebar.tsx), [apps/web/src/lib/hooks/useRelativeTime.ts](apps/web/src/lib/hooks/useRelativeTime.ts).

### Functionality

- Delivery loop fetches undelivered notifications, builds context via `getNotificationForDelivery`, and sends to OpenClaw with **per-request tools** derived from `effectiveBehaviorFlags` and task context ([delivery.ts](apps/runtime/src/delivery.ts) 201–224). Tools and capability text are built from the same flags but in two places (capabilities array vs `getToolSchemasForCapabilities`), which can theoretically diverge.
- Task status tool: schema and execution live in [taskStatusTool.ts](apps/runtime/src/tooling/taskStatusTool.ts); execution goes through Convex `updateTaskStatusFromAgent`. Health server exposes POST `/agent/task-status` as HTTP fallback ([health.ts](apps/runtime/src/health.ts)).
- Config: `taskStatusBaseUrl` defaults to `http://{HEALTH_HOST}:{HEALTH_PORT}` with `HEALTH_PORT` default **3000** ([config.ts](apps/runtime/src/config.ts) 190–197). Port 3001 is the user's web app (Next.js) when 3000 is taken; no change needed in runtime.

### Quality

- Clear separation: tool schemas in tooling/, delivery orchestration in delivery.ts, config in config.ts. Tests cover `shouldDeliverToAgent` and `executeTaskStatusTool`.
- Minor: capability list and tool list are computed separately in `formatNotificationMessage` vs in the delivery loop; they use the same conditions but are not forced from a single source of truth.

### Security and safety

- Service token validated; account scoping in Convex. Health `/agent/*` routes require `x-openclaw-session-key` and are restricted to local/private addresses (`isLocalAddress`). No obvious new risks.

---

## 2. Root-cause analysis (and log findings)

### Issue A: Engineer "mentioning itself" / asking "Am I the QA?"

- **Finding:** The notification prompt never states the **recipient identity**. The agent sees thread history with labels like "Engineer", "Squad Lead", "QA" and the mentionable list, but there is no line like "You are replying as: Engineer (Role)." So the model can be unsure which role it is.
- **Fix direction:** Add an explicit **identity line** at the start of the prompt (e.g. right after or before capabilities): "You are replying as: **{agent.name}** ({agent.role}). Reply only as this agent; do not speak as or ask whether you are another role."

### Issue B: Tool blocked — "task_status in Capabilities but not in my function set"

- **Finding (code):** Capabilities and tools are derived from the same flags but in **two separate code paths** (capabilities array in `formatNotificationMessage`, tools via `getToolSchemasForCapabilities` in the delivery loop). OpenClaw receives tools per-request in the same payload as the message ([gateway.ts](apps/runtime/src/gateway.ts) 396–404).
- **Finding (logs):** Terminal logs show a **session mismatch**. The runtime sends to `agent:engineer:j574w46mry174bda8z152bah9d80a6xm` with 2 tools ("Sending with tools 2", "Capabilities: change task status (task_status tool); create/update documents (document_upsert tool)"). The OpenClaw gateway run that produced the "task_status not in my function set" reply is logged as `agent=main` and `session=openresponses:7273d662-a89d-4865-a84c-0fa931f3b6a8` with `sessionKey=unknown`. So the run that executed was in a **different** session (main / openresponses), not the per-agent session the runtime posted to. Per-request tools are sent with the HTTP request for the engineer session; if the gateway runs the request under a different session (e.g. main or an openresponses webchat session), that session may not receive our tools.
- **Fix direction:** (1) **Single source of truth (runtime):** Compute allowed tools once and derive both capabilities text and tool schemas from it so prompt and payload never diverge. (2) **Session key / gateway:** Verify that the runtime uses the session key that the gateway actually uses for the run (e.g. that `/v1/responses` with `x-openclaw-session-key: agent:engineer:...` results in a run under that session, not under `main` or openresponses). If the gateway maps OpenResponses or webchat to a different session, document or fix so that delivery requests run in the session we send tools to. (3) **Docs/logging:** Document that tools are sent per-request; reference [OpenClaw Session Tools](https://docs.openclaw.ai/concepts/session-tool) / gateway behavior as needed.

---

## 3. High-level design

- **Delivery flow (unchanged):** Convex → runtime poll → `getNotificationForDelivery` → `shouldDeliverToAgent` → build message + tools → `sendToOpenClaw` → tool execution + write-back.
- **Changes:**
  1. **Identity line:** In `formatNotificationMessage`, add a line that states the recipient agent's name and role from `context.agent`.
  2. **Capabilities vs tools alignment:** Introduce a single computed set of allowed tools used both to build the capabilities string and the tool schema array, so the prompt never advertises a capability we don't send.
  3. **Session key verification:** Confirm that the gateway runs the `/v1/responses` request in the session identified by `x-openclaw-session-key` (so per-request tools are applied to that run). If OpenResponses/webchat uses a different session (e.g. main or openresponses:uuid), document or fix routing so delivery runs in the intended agent session.

---

## 4. File and module changes

| File                                                                             | Change                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [apps/runtime/src/delivery.ts](apps/runtime/src/delivery.ts)                     | (1) Add identity line in prompt using `context.agent?.name` and `context.agent?.role`. (2) Derive capabilities list from the same logic used to build the tools array (single source of truth for allowed tools).                                                                                                |
| [apps/runtime/src/tooling/agentTools.ts](apps/runtime/src/tooling/agentTools.ts) | Optional: add a function that returns both capability labels and tool schemas (e.g. `getToolCapabilitiesAndSchemas(options)`) so delivery uses one call for both prompt text and `sendOptions.tools`.                                                                                                            |
| Gateway / OpenClaw config or docs                                                | Verify or document how `/v1/responses` with `x-openclaw-session-key: agent:&lt;slug&gt;:&lt;accountId&gt;` is routed; ensure the run executes in that session so per-request tools are applied. If OpenResponses uses a different session (e.g. main or openresponses:uuid), fix routing or document workaround. |

No change to Convex schema, health endpoint, or runtime URL handling. Port 3001 / web app URL are out of scope (user confirmed 3001 is their web app).

---

## 5. Step-by-step tasks

1. **Single source for capabilities and tools (runtime)**
   In [delivery.ts](apps/runtime/src/delivery.ts): Define a small helper (e.g. `getAllowedToolsForContext(flags, hasTaskContext)`) that returns both capability labels (for the prompt) and the tool schemas (for OpenClaw). Use it in the delivery loop for `sendOptions.tools` and in `formatNotificationMessage` for the capabilities block and status instructions. Ensure task_status is only in both when `hasTaskContext && canModifyTaskStatus`.
2. **Identity line in prompt (runtime)**
   In `formatNotificationMessage`: Add a line (e.g. before or right after the capabilities block): `You are replying as: **{agent.name}** ({agent.role}). Reply only as this agent; do not speak as or ask whether you are another role.` Use `context.agent?.name` and `context.agent?.role` with safe fallbacks (e.g. "Agent", "Unknown role").
3. **Session key / gateway verification**
   Confirm that when the runtime sends POST to `/v1/responses` with `x-openclaw-session-key: agent:engineer:&lt;accountId&gt;` and a `tools` array, the gateway runs that request in the session for that key (so the model sees those tools). If logs show `agent=main` or `session=openresponses:...` for runs that should be per-agent, investigate OpenClaw gateway config (e.g. OpenResponses adapter mapping to a different session) and either fix routing or document the limitation.
4. **Tests**
   Extend or add unit tests for the new helper so that capabilities and tool list stay in sync. Optionally add a test that the formatted message includes the identity line when `context.agent` has name/role.

---

## 6. Edge cases and risks

- **Agent without name/role:** Use fallbacks (e.g. "Agent", "Unknown role") so the identity line never breaks the prompt.
- **OpenClaw overriding tools:** If the gateway or session config merges/overrides per-request tools, our sent tools might not appear. The plan does not change how we send tools; it only aligns our prompt with what we send and documents the behavior. If needed later, document OpenClaw’s tool merge behavior and recommend runtime and gateway config alignment.
- **Backwards compatibility:** Prompt changes are additive (identity line); clearer identity may reduce confusion.

---

## 7. Testing strategy

- **Unit:** Test `getAllowedToolsForContext` (or equivalent) so that for each combination of flags and hasTaskContext, the capability list and tool list match. Test that the formatted message includes the identity line when `context.agent` has name/role.
- **Manual:** Deliver a notification to an agent and confirm the thread shows the identity line; confirm in gateway logs that the run uses the same session key the runtime sent (e.g. `agent:engineer:...`) and that the model has the advertised tools.

---

## 8. Summary

| Issue                             | Root cause                                                                                 | Fix                                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Engineer "mentioning itself"      | No explicit recipient identity in prompt                                                   | Add identity line: "You are replying as: **{name}** ({role})."                                                                                                           |
| task_status "not in function set" | Session mismatch: runtime sends tools to agent session, gateway runs as main/openresponses | Single source of truth for tools in runtime; verify gateway runs `/v1/responses` in the session identified by `x-openclaw-session-key` so per-request tools are applied. |
