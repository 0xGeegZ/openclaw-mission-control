---
name: task-scoped-session-isolation
overview: Add task-scoped session isolation, move delivery guidance into OpenResponses system instructions, and introduce a task_history tool (messages + activities) for explicit context loading.
todos:
  - id: audit-current-implementation
    content: Validate current prompt/task-history scoping and session isolation behavior
    status: completed
  - id: clarify-session-lifecycle
    content: Confirm desired session granularity and reopen behavior with user
    status: completed
  - id: design-task-scoped-session-model
    content: Define per-(task,agent) session generation model with done/reopen lifecycle
    status: completed
  - id: map-code-changes
    content: Map backend/runtime files and test updates for implementation
    status: completed
  - id: define-rollout-and-tests
    content: Specify migration, rollout strategy, and verification checklist
    status: completed
isProject: false
---

# Task-Scoped History, System Instructions, and Session Isolation Plan

## 1. Context & goal

We want three guarantees in runtime delivery: (a) the agent should act only on current-task context, (b) context pollution across tasks should be minimized with one persistent OpenClaw session per `(task, agent)` while active and a new generation after reopen, and (c) operational guidance should move from a giant inline user prompt to a clearer system-instruction layer. We also want an explicit `task_history` tool so agents load context from backend data (messages + activities) instead of relying on large injected blobs.

Key constraints:

- Keep current runtime and Convex architecture (notification-driven delivery).
- No backward compatibility requirement: perform a clean cutover to the new session + instruction model.
- Keep local `/agent/*` fallback endpoints working with new session keys.
- Avoid cross-account leakage and preserve tenant isolation.
- Keep prompts deterministic and auditable (versioned instruction contract).

### Explicit scope decisions (already confirmed)

- Session granularity: one persistent session per `(task, agent)` while task is active.
- Reopen behavior: reopening a completed task creates a new session generation (`v2`, `v3`, ...), never reuses a closed generation.
- Non-task notifications (heartbeat/system): use the new unified runtime session resolver (no legacy `agents.sessionKey` dependency).
- Instructions persistence model: OpenResponses `instructions` are request-level, so resend deterministic instructions on every turn.

### Success criteria (must all be true before merge)

- A junior engineer can run one task with two agents and observe different task-scoped session keys for each agent-task pair.
- The same agent on two different tasks uses different session keys and does not reference unrelated task history in replies.
- After task transitions to `done`, sessions for that task are marked closed; after reopen, next delivery uses a fresh generation key.
- Runtime sends OpenResponses `instructions` + compact `input`; the old giant instruction blob is no longer the only policy source.
- `task_history` tool returns task snapshot + message history + activity history with account-safe validation.
- Legacy delivery/session paths are removed from runtime code; all flows run through the new session resolver.
- Non-task flows and `/agent/*` endpoints remain functional under the new model.
- Orchestrator chat continues to work as coordination-only with no behavior regressions.

### Non-goals (to avoid scope creep)

- Do not keep legacy `agents.sessionKey`-driven runtime routing after cutover.
- Do not redesign OpenClaw profile sync or heartbeat architecture.
- Do not change task workflow semantics (status transitions/permissions) beyond session close hooks on `done`.
- Do not introduce cross-account/global history tools.
- Do not alter orchestrator role permissions or orchestrator-chat product semantics.

## 2. Codebase research summary

Main files inspected:

- [apps/runtime/src/delivery/prompt.ts](apps/runtime/src/delivery/prompt.ts)
- [apps/runtime/src/delivery.ts](apps/runtime/src/delivery.ts)
- [apps/runtime/src/delivery/types.ts](apps/runtime/src/delivery/types.ts)
- [apps/runtime/src/gateway.ts](apps/runtime/src/gateway.ts)
- [apps/runtime/src/health.ts](apps/runtime/src/health.ts)
- [apps/runtime/src/agent-sync.ts](apps/runtime/src/agent-sync.ts)
- [packages/backend/convex/service/notifications.ts](packages/backend/convex/service/notifications.ts)
- [packages/backend/convex/service/actions.ts](packages/backend/convex/service/actions.ts)
- [packages/backend/convex/schema.ts](packages/backend/convex/schema.ts)
- [packages/backend/convex/agents.ts](packages/backend/convex/agents.ts)
- [packages/backend/convex/tasks.ts](packages/backend/convex/tasks.ts)
- [packages/backend/convex/service/tasks.ts](packages/backend/convex/service/tasks.ts)
- [apps/runtime/src/tooling/agentTools.ts](apps/runtime/src/tooling/agentTools.ts)
- [packages/backend/convex/service/messages.ts](packages/backend/convex/service/messages.ts)
- [packages/backend/convex/activities.ts](packages/backend/convex/activities.ts)
- [apps/runtime/src/delivery.test.ts](apps/runtime/src/delivery.test.ts)

What is already good:

- Prompt has explicit scoping directives: "Respond only to this notification" and "Use only the thread history shown above for this task".
- Delivery thread context is fetched by `notification.taskId` and injected as `THREAD HISTORY`.
- Cross-task overview is already gated to orchestrator chat only.
- Runtime already has a `task_load` tool path that can be extended/reused for tool-first context loading.
- OpenClaw OpenResponses supports `instructions` merged into system prompt.

Gaps found:

- Hard isolation is mostly instruction-level; current tests do not explicitly lock these scope rules.
- In `getForDelivery`, thread query uses `taskId` index only; add stronger account/task consistency checks.
- Session model is currently global per agent (`agent:{slug}:{accountId}`), not per `(task,agent)`.
- Delivery guidance is mostly embedded in one large user-prompt body, which is harder to reason about and version.
- No single tool returns both task message history and activity history together.

## 3. High-level design

Introduce three aligned layers: unified session routing (task + non-task), system-instruction contract via OpenResponses `instructions`, and tool-first history retrieval.

- Replace `agents.sessionKey` runtime routing with a unified session model managed by backend resolver state.
- Add a backend session table for per-agent runtime sessions:
  - task sessions: `(accountId, taskId, agentId, generation)`
  - non-task/system sessions: `(accountId, agentId, sessionType=system)`
- Resolve `deliverySessionKey` in `service.actions.getNotificationForDelivery`:
  - If notification has task + agent: return active task session key (create if missing).
  - If last task session was closed (task previously done): create next generation key.
  - If no task: return/create active system session key from the same resolver.
- Add a versioned `deliveryInstructionProfile` generated from runtime policy + capabilities and send it via OpenResponses `instructions` on each turn for that session.
- Keep user `input` focused on notification payload + compact current task context; move policy-heavy guidance into the `instructions` layer.
- Add a new `task_history` tool returning current task snapshot + message history + activity history in one call; deprecate `task_load` (or keep only as thin alias to the new backend payload during cutover window).
- On status transition to `done`, close active task sessions for that task.
- On reopen, no eager mutation required; next delivery lazily creates new generation (as requested: new session on reopen).
- Preserve orchestrator-chat special handling (`orchestratorChatTaskId` gates account-level context, orchestrator-only coordination behavior, and orchestrator subscription semantics).

```mermaid
flowchart LR
  notif[Notification] --> actionGet[service.actions.getNotificationForDelivery]
  actionGet --> resolver[ensureRuntimeSession]
  resolver --> key[deliverySessionKey]
  key --> runtimeDelivery[apps/runtime delivery loop]
  runtimeDelivery --> instructionBuilder[buildDeliveryInstructions]
  runtimeDelivery --> inputBuilder[buildNotificationInput]
  instructionBuilder --> gatewaySend[POST /v1/responses instructions + input + tools]
  inputBuilder --> gatewaySend
  gatewaySend --> toolCall[task_history tool when more context needed]
  statusDone[Task status -> done] --> closeSessions[closeTaskSessionsForTask]
  closeSessions --> reopenNext[Next delivery creates new generation key]
```

### Data contracts for implementation

- Delivery context extension:
  - `deliverySessionKey?: string`
  - `deliveryInstructionProfileVersion?: string` (for observability/regression debugging)
- OpenResponses send payload extension:
  - `instructions?: string`
  - `input: string | item[]` (compact notification body + minimal structured context)
- New tool schema:
  - `task_history(taskId: string, messageLimit?: number, activityLimit?: number)`
  - Availability: all agents with task context (not orchestrator-only).
  - Defaults/caps: `messageLimit` default `25`, max `200`; `activityLimit` default `30`, max `200`.
  - Return shape:
    - `task`: core task metadata
    - `messages`: recent thread messages (oldest -> newest)
    - `activities`: recent task-targeted activities (newest -> oldest acceptable if documented)
    - `meta`: `{ messageLimitApplied, activityLimitApplied }`

## 4. File & module changes

### Backend schema and session lifecycle

- [packages/backend/convex/schema.ts](packages/backend/convex/schema.ts)
  - Add `agentRuntimeSessions` table.
  - Suggested fields: `accountId`, `agentId`, `sessionType` (`task` | `system`), `taskId?`, `agentSlug`, `generation`, `sessionKey`, `openedAt`, `closedAt`, `closedReason`.
  - Add indexes for:
    - active task lookup by `(accountId, sessionType, taskId, agentId, closedAt)`
    - active system lookup by `(accountId, sessionType, agentId, closedAt)`
    - lookup by `sessionKey` (for validation/diagnostics)
    - task-wide active session closure.
  - Add message index `by_account_task_created` to harden thread query scoping.
- [packages/backend/convex/agents.ts](packages/backend/convex/agents.ts)
  - Remove runtime reliance on `generateSessionKey` for delivery routing.
  - Keep/remodel field only if needed for migration, not runtime path selection.
- [packages/backend/convex/service/notifications.ts](packages/backend/convex/service/notifications.ts)
  - Harden `getForDelivery`:
    - Validate `task.accountId === notification.accountId` when task exists.
    - Validate `message.accountId === notification.accountId` when message exists.
    - Fetch thread via account+task composite index (or defensive post-filter) to guarantee tenant+task scoping.
  - Keep orchestrator context gating unchanged, but trim injected thread payload (tool-first approach).
  - Keep `shouldIncludeOrchestratorContext` behavior unchanged for `orchestratorChatTaskId`.
- [packages/backend/convex/service/actions.ts](packages/backend/convex/service/actions.ts)
  - Extend `getNotificationForDelivery` to resolve and return `deliverySessionKey`.
  - Wire to new internal mutation/query for unified session resolution (`task` + `system`).
  - Add `getTaskHistoryForAgentTool` action (service auth + account/agent/task checks).
- [packages/backend/convex/service/messages.ts](packages/backend/convex/service/messages.ts)
  - Ensure tool query path for thread remains account-safe and reusable by `task_history`.
- [packages/backend/convex/service/activities.ts](packages/backend/convex/service/activities.ts) (new)
  - Add internal query to list task-scoped activities for tools (`targetType=task`, `targetId=taskId`, bounded limit, account-validated).
- [packages/backend/convex/service/tasks.ts](packages/backend/convex/service/tasks.ts)
  - In `updateStatusFromAgent`, when transitioning to `done`, close active task sessions for the task.
- [packages/backend/convex/tasks.ts](packages/backend/convex/tasks.ts)
  - In user-driven `updateStatus`, when transitioning to `done`, close active task sessions for the task.
  - Keep `reopen` behavior; new session generation should happen lazily on next delivery.

### Runtime delivery/session usage

- [apps/runtime/src/delivery/types.ts](apps/runtime/src/delivery/types.ts)
  - Add optional `deliverySessionKey` on `DeliveryContext`.
- [apps/runtime/src/delivery/prompt.ts](apps/runtime/src/delivery/prompt.ts)
  - Split into:
    - `buildDeliveryInstructions(...)` for policy/system guidance.
    - `buildNotificationInput(...)` for current notification/task payload.
  - Keep strict current-task scope constraints in instructions.
  - Preserve orchestrator-chat-specific instruction blocks (coordination-only + required response_request/review flow).
- [apps/runtime/src/delivery.ts](apps/runtime/src/delivery.ts)
  - Use `deliverySessionKey` for:
    - `sendToOpenClaw`
    - `sendOpenClawToolResults`
  - Send `instructions` (system contract) and compact `input` separately.
  - Ensure gateway session registry includes resolved runtime session keys before sending.
- [apps/runtime/src/gateway.ts](apps/runtime/src/gateway.ts)
  - Support registering many runtime session keys per agent (`task` + `system`).
  - Update remove-by-agent helper to remove all keys for the agent, not first match only.
  - Keep `resolveAgentIdFromSessionKey` compatible with new key format.
  - Extend send payload options to pass `instructions` through OpenResponses.
- [apps/runtime/src/health.ts](apps/runtime/src/health.ts)
  - Keep `x-openclaw-session-key` validation working for new runtime session keys.
  - Add resolver-backed refresh path for unknown keys after restart (no legacy fallback mode).
- [apps/runtime/src/agent-sync.ts](apps/runtime/src/agent-sync.ts)
  - Sync active sessions from resolver outputs; remove assumptions about one base session per agent.
- [apps/runtime/src/tooling/agentTools.ts](apps/runtime/src/tooling/agentTools.ts)
  - Add `task_history` tool schema + execution path.
  - Reuse existing `task_load` action path initially or delegate `task_load` to new backend response shape.
  - Include capability label for `task_history`.

### Tests and docs

- [apps/runtime/src/delivery.test.ts](apps/runtime/src/delivery.test.ts)
  - Add assertions for strict task-scope instructions presence in instruction builder.
  - Add tests for `deliverySessionKey` precedence.
  - Add orchestrator-chat regression assertions for preserved coordination-only behavior.
- [apps/runtime/src/tooling/agentTools.test.ts](apps/runtime/src/tooling/agentTools.test.ts)
  - Add validation/execution tests for `task_history`.
- [apps/runtime/src/**tests**/health-agent-endpoints.test.ts](apps/runtime/src/__tests__/health-agent-endpoints.test.ts)
  - Add coverage for unified runtime session key acceptance (`task` + `system`).
- [packages/backend/convex/service/notifications.retry.test.ts](packages/backend/convex/service/notifications.retry.test.ts)
  - Extend/add tests for account/task consistency checks in `getForDelivery` (or add a dedicated test file if cleaner).
- [packages/backend/convex/service/actions.test.ts](packages/backend/convex/service/actions.test.ts)
  - Add tests for `getTaskHistoryForAgentTool` account and orchestrator/agent access rules.
- [packages/backend/convex/lib/notifications.test.ts](packages/backend/convex/lib/notifications.test.ts)
  - Add/retain orchestrator-chat notification fanout regression coverage.
- [apps/runtime/README.md](apps/runtime/README.md)
  - Document new session strategy and `instructions` + `input` layering.
- [docs/runtime/TOOLS_AUDIT.md](docs/runtime/TOOLS_AUDIT.md)
  - Mark `task_history` as implemented target and document expected payload.

## 5. Step-by-step tasks

1. Add schema primitives (single commit).

- Files: `packages/backend/convex/schema.ts`
- Add `agentRuntimeSessions` table and indexes.
- Add `messages.by_account_task_created` index.
- Done when: schema validates and generated API types compile.

1. Implement unified session resolver internals (single commit).

- Files: `packages/backend/convex/service/notifications.ts` (or dedicated `service/agentRuntimeSessions.ts` + imports)
- Add helpers:
  - `buildRuntimeSessionKey(...)`
  - `getActiveTaskSession(...)`
  - `getActiveSystemSession(...)`
  - `ensureRuntimeSession(...)`
  - `closeTaskSessionsForTask(...)`
- Done when: unit tests cover create/reuse/new-generation behavior.

1. Wire delivery session resolution (single commit).

- Files: `packages/backend/convex/service/actions.ts`, `packages/backend/convex/service/notifications.ts`
- Extend `getNotificationForDelivery` response with `deliverySessionKey`.
- Resolve both task and non-task notifications through unified resolver.
- Done when: runtime receives resolver-generated key for all notification types.

1. Harden context isolation checks (single commit).

- Files: `packages/backend/convex/service/notifications.ts`
- Enforce account consistency for notification/task/message relationships.
- Use account+task-safe thread query path.
- Keep `orchestratorChatTaskId` context gating unchanged.
- Done when: cross-account mismatch returns safe behavior (no leakage / explicit error path).

1. Add task history backend path (single commit).

- Files: `packages/backend/convex/service/actions.ts`, `packages/backend/convex/service/messages.ts`, `packages/backend/convex/service/activities.ts` (new)
- Implement `getTaskHistoryForAgentTool`.
- Reuse existing validated thread query helper.
- Add activities query constrained by account + `targetType=task` + `targetId`.
- Done when: returns combined payload and enforces auth/account checks.

1. Add runtime tool contract for `task_history` (single commit).

- Files: `apps/runtime/src/tooling/agentTools.ts`, `apps/runtime/src/tooling/agentTools.test.ts`
- Add schema + capability label + execute branch.
- Deprecate direct `task_load` usage in prompts/instructions; if retained briefly, make it an alias to the same `task_history` backend payload.
- Done when: tool validation + happy path tests pass.

1. Refactor prompt layering to instruction contract (single commit).

- Files: `apps/runtime/src/delivery/prompt.ts`, `apps/runtime/src/delivery.test.ts`
- Introduce `buildDeliveryInstructions` and `buildNotificationInput`.
- Keep strict current-task-only rules in instructions.
- Preserve orchestrator-chat-specific instruction blocks.
- Reduce raw thread injection in input to compact transitional summary.
- Done when: tests assert key policy phrases remain enforced.

1. Pass OpenResponses `instructions` in gateway send path (single commit).

- Files: `apps/runtime/src/gateway.ts`, `apps/runtime/src/delivery.ts`, `apps/runtime/src/delivery/types.ts`
- Extend send options with `instructions`.
- Always use `deliverySessionKey` for both initial send and tool-result continuation (no legacy fallback).
- Done when: payload includes `instructions` and uses resolver key in all paths.

1. Update runtime session registry + endpoint validation (single commit).

- Files: `apps/runtime/src/gateway.ts`, `apps/runtime/src/agent-sync.ts`, `apps/runtime/src/health.ts`, `apps/runtime/src/__tests__/health-agent-endpoints.test.ts`
- Support many session keys per agent; remove all on cleanup.
- Ensure `/agent/` accepts unified resolver keys (task + system).
- Done when: endpoint tests pass for the new key model only.

1. Close task sessions on `done` transition (single commit).

- Files: `packages/backend/convex/tasks.ts`, `packages/backend/convex/service/tasks.ts`
  - Call close helper only when transitioning into `done`.
  - Done when: close behavior works for both user and agent status updates.

1. Remove legacy runtime routing implementation (single commit).

- Files: `apps/runtime/src/delivery.ts`, `apps/runtime/src/gateway.ts`, `apps/runtime/src/agent-sync.ts`, `packages/backend/convex/agents.ts` (if referenced)
  - Delete old `agent.sessionKey` delivery fallback and related dead code paths.
  - Done when: runtime-delivery path no longer depends on legacy session routing.

1. Add rollout controls + docs (single commit).

- Files: `apps/runtime/README.md`, `docs/runtime/TOOLS_AUDIT.md`, config docs if needed
  - Add flags:
    - `OPENCLAW_TASK_SCOPED_SESSIONS`
    - `OPENCLAW_DELIVERY_INSTRUCTIONS_V2`
  - Document cutover and migration behavior (no legacy fallback wording).
  - Done when: operator docs describe only the new model.

1. Run explicit orchestrator-chat regression pass (single commit or release gate).

- Files: `apps/runtime/src/delivery.test.ts`, `packages/backend/convex/lib/notifications.test.ts`, manual QA checklist evidence.
  - Validate orchestrator chat still gets expected coordination semantics after all changes.
  - Done when: orchestrator-chat automated + manual checks pass.

## 6. Edge cases & risks

- Taskless notifications (`taskId` absent): must use resolver-generated `sessionType=system` session.
- Runtime restart between send and tool fallback: session key may be unknown in memory; refresh from resolver state (no legacy fallback path).
- Task done -> reopened without immediate notification: ensure lazy generation logic still creates fresh session on first next delivery.
- Agent slug rename: if key encodes slug, ensure resolver uses current slug consistently and does not break old keys.
- Session table growth: define retention/cleanup policy for closed sessions.
- Cutover risk: existing in-flight conversations on old keys are intentionally not preserved.
- `instructions` are request-level in OpenResponses, not stored as a separate persistent session object; we must resend deterministic instructions every turn for guarantee.
- If thread injection is reduced too aggressively before tool adoption, agent quality may regress; keep a transitional compact thread snippet.
- If `orchestratorChatTaskId` gating regresses, orchestrator may lose account-level context (`taskOverview`, `globalBriefingDoc`) and coordination quality.
- If orchestrator-chat notification fanout filtering regresses, non-orchestrator agents may receive unintended orchestrator-chat updates.

## 7. Testing strategy

Unit tests:

- Session key resolver logic (new vs existing active vs closed generation).
- Done-transition closure behavior.
- Defensive account/task checks in delivery context fetch.
- Prompt/instruction construction keeps strict scope rules and stable instruction versioning.
- `task_history` tool schema and execution validation.

Integration/runtime tests:

- Delivery loop sends with resolver-generated session and tool-result follow-up uses same key.
- Delivery loop sends OpenResponses `instructions` and compact `input` correctly.
- `/agent/` endpoints accept unified runtime session keys (`task` + `system`).
- Reopen flow creates next generation key and does not reuse closed session.
- `task_history` returns both recent messages and activities for the same task/account.
- Orchestrator chat still receives account-level context when `taskId == orchestratorChatTaskId`.
- Orchestrator-only tool capabilities and coordination-only instruction blocks remain intact in orchestrator chat.

Manual QA checklist:

- Assign two tasks to same agent; verify different session keys are used.
- Post thread updates on task A and task B; verify no cross-task history references in replies.
- Trigger reply where agent calls `task_history`; confirm payload includes both timeline parts.
- Mark task done then reopen; verify new generation key on next notification.
- Validate non-task notifications use resolver-generated system sessions and continue working.
- Verify orchestrator chat still behaves as coordination-only and preserves response_request/review workflow rules.
- Verify orchestrator chat still receives expected thread updates without notifying non-orchestrator subscribers.

## 8. Rollout / migration

- Perform explicit cutover migration from legacy session routing to unified runtime sessions.
- Deploy order: schema + resolver + runtime send path + legacy path removal.
- Feature flags (optional for staged rollout, not for long-term fallback):
  - `OPENCLAW_TASK_SCOPED_SESSIONS`
  - `OPENCLAW_DELIVERY_INSTRUCTIONS_V2`
- Rollback path is deployment rollback, not runtime fallback to legacy routing.
- Add operational logging for session resolution decisions (`task` vs `system`, generation number).
- Log instruction-profile version and whether `task_history` was called for observability.

## 9. TODO checklist

### Backend

- Add `agentRuntimeSessions` table and indexes in schema.
- Add `messages.by_account_task_created` index.
- Implement internal session resolver helpers (ensure active, close by task, lookup by session key).
- Add service/internal activity query for task history tool.
- Add `getTaskHistoryForAgentTool` service action.
- Extend `service.actions.getNotificationForDelivery` to return `deliverySessionKey`.
- Harden `service.notifications.getForDelivery` with account/task/message consistency checks.
- Preserve `orchestratorChatTaskId` context gating behavior in `getForDelivery`.
- Close task sessions on `done` transition in both user and agent status paths.

### Runtime

- Add `deliverySessionKey` to runtime delivery context type.
- Use resolved key in `delivery.ts` for send + tool-result continuation.
- Refactor prompt into instruction contract + compact input payload.
- Pass `instructions` through `sendToOpenClaw`.
- Update gateway session registry to support many keys per agent and full cleanup.
- Ensure health endpoint/session validation accepts unified runtime session keys after restart.
- Add `task_history` tool schema/execution and capability label.
- Preserve orchestrator-chat-specific instruction blocks and orchestration rules.

### Tests

- Add prompt-scope regression tests for strict current-task wording.
- Add instruction-layer tests for `instructions` payload and versioning.
- Add delivery tests for session-key precedence.
- Add backend tests for task/account consistency and session generation lifecycle.
- Add runtime endpoint tests for unified runtime session key acceptance.
- Add tests for `task_history` output and account/task isolation.
- Add orchestrator-chat regression tests for context gating, fanout, and instruction behavior.

### Minimum test cases to implement (explicit checklist)

- Session generation:
  - create first generation for new `(task, agent)`
  - reuse active generation
  - create next generation after close
- Delivery routing:
  - task notification uses `deliverySessionKey`
  - non-task notification uses resolver-generated system session key
- Isolation:
  - account mismatch in `getForDelivery` is rejected/sanitized
  - thread query never returns messages outside `(accountId, taskId)`
- Tooling:
  - `task_history` requires `taskId`
  - `task_history` returns bounded messages + activities
  - unauthorized agent/account combinations fail
- Prompt/instructions:
  - instruction payload includes current-task-only constraints
  - compact input still includes notification id + task id anchors
- Reopen lifecycle:
  - close on `done`, new generation on first delivery after reopen
- Orchestrator chat:
  - retains account-level context gating (`orchestratorChatTaskId`)
  - retains orchestrator-only coordination instruction semantics

### Ops/Docs

- Update runtime README with session model and troubleshooting notes.
- Update TOOLS audit/docs to include task_history and prompt layering.
- Add rollout flags and logging guidance for phased enablement.

### Implementation guardrails for junior engineer

- Keep all imports at top-of-file only.
- Add JSDoc for all new exported functions and tool schemas.
- Prefer extending existing modules (`service/actions.ts`, `tooling/agentTools.ts`) before creating new files.
- Any new file must be justified by single responsibility and referenced in this plan.
- Remove old behavior during cutover once new-model tests pass; do not keep long-term dual paths.
