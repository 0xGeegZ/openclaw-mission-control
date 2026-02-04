# Code Review: Orchestrator Subscription Refactor

**Plan:** [.cursor/plans/orchestrator-subscription-refactor_1b3a3575.plan.md](.cursor/plans/orchestrator-subscription-refactor_1b3a3575.plan.md)  
**Scope:** Backend (Convex), Runtime (delivery), Frontend (Agents UI), Docs (AGENTS.md)

---

## 1. Understanding the change

- **Goal:** Replace regex-based “lead/PM” detection with an explicit per-account `orchestratorAgentId`. The orchestrator is auto-subscribed to task threads and receives agent-authored `thread_update` notifications so they can review and respond.
- **Impacted areas:** Account settings, subscriptions helper, task create/assign, user and agent message flows, service notification context, runtime delivery filter, agent deletion, seed, Agents UI, AGENTS.md.
- **Assumptions:** One orchestrator per account; UI only allows choosing from the same account’s agents (no cross-account ID in normal use). Loop prevention remains via `sourceNotificationType === "thread_update"`.

---

## 2. Review checklist

### Functionality

| Item                                             | Status | Notes                                                                                                                                                          |
| ------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intended behavior works and matches requirements | ✅     | Orchestrator is subscribed on task create/assign and on message create (user + agent); runtime delivers when `context.orchestratorAgentId === recipientId`.    |
| Edge cases handled gracefully                    | ✅     | No orchestrator → no-op in `ensureOrchestratorSubscribed`; deleted agent → `orchestratorAgentId` cleared in `agents.remove`; `ensureSubscribed` is idempotent. |
| Error handling appropriate and informative       | ✅     | Toasts on set/remove orchestrator; backend throws on invalid account/agent where applicable.                                                                   |

### Code quality

| Item                                    | Status | Notes                                                                                                                                                                       |
| --------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code structure clear and maintainable   | ✅     | Helper in `subscriptions.ts`, single place for orchestrator subscription; delivery logic in one block in `delivery.ts`.                                                     |
| No unnecessary duplication or dead code | ✅     | Regex lead logic removed from service/messages and runtime.                                                                                                                 |
| Tests/documentation updated as needed   | ✅     | AGENTS.md documents orchestrator; JSDoc on `ensureOrchestratorSubscribed`. Plan’s “Optional: note in AGENTS.md” is done. No new automated tests (plan suggested manual QA). |

### Security & safety

| Item                                           | Status | Notes                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No obvious security vulnerabilities introduced | ✅     | Admin-only for setting orchestrator; service actions unchanged.                                                                                                                                                                                                                                                                         |
| Inputs validated, outputs sanitized            | ⚠️     | **Suggestion:** In `accounts.update`, when `orchestratorAgentId` is set (non-null), validate that the agent exists and `agent.accountId === args.accountId` to avoid storing a different account’s agent ID. Today `ensureOrchestratorSubscribed` would no-op for wrong-account agents, but the setting would remain and could confuse. |
| Sensitive data handled correctly               | ✅     | No new secrets or PII.                                                                                                                                                                                                                                                                                                                  |

---

## 3. Additional review notes

### Architecture and design

- **Explicit orchestrator ID:** Moving from regex to `orchestratorAgentId` matches the plan and concept doc (lead as first-class, configurable in UI).
- **Subscription points:** Orchestrator is ensured on: task create, task assign, user message create, agent message create. That covers new tasks, reassignments, and legacy tasks when any message is posted.
- **Delivery:** `shouldDeliverToAgent` keeps the existing `thread_update` + agent-author branch and adds the explicit orchestrator check before reviewer/assigned checks. Loop guard (`sourceNotificationType === "thread_update"`) is unchanged.

### Implementation details

- **Schema:** `settings.orchestratorAgentId` is `v.optional(v.id("agents"))` in schema; validator allows `v.null()` for “clear” from UI. Backend maps `null` → `undefined` when patching so the field is unset. Consistent.
- **Subscriptions:** `ensureOrchestratorSubscribed` reads settings via cast `(account.settings as { orchestratorAgentId?: Id<"agents"> })`. Same pattern used in notifications and agents; consider a shared type for account settings if it grows.
- **Runtime:** `recipientId` (string) and `context.orchestratorAgentId` (Id<"agents">) are both strings at runtime; comparison is correct. Using `!= null` for orchestrator check is correct for undefined/null.
- **UI:** Detail page uses admin-only dropdown with “Set as Orchestrator” / “Remove Orchestrator”; roster passes `orchestratorAgentId` and shows Crown badge on `AgentCard`. Matches plan.

### Performance and resources

- **Extra work per task/message:** One extra `ensureOrchestratorSubscribed` per create (task or message). It does one account read, optional agent read, and optional subscription insert; cost is small and idempotent.
- **Delivery:** One extra field in `getForDelivery` response; no new queries. No concern.

### Plan vs implementation

- Plan todo **“Add Agents UI to set/clear orchestrator”** is implemented (detail page + roster badge). The plan file still has `ui-orchestrator` as `pending`; consider updating to `completed` for accuracy.

---

## 4. Actionable suggestions

1. **Optional validation in `accounts.update`:** When `args.settings.orchestratorAgentId` is present and not `null`, load the agent and require `agent.accountId === args.accountId` (and agent exists). This keeps the stored setting always referring to an agent of that account.
2. **Plan file:** Set `ui-orchestrator` todo to `completed` in `.cursor/plans/orchestrator-subscription-refactor_1b3a3575.plan.md`.
3. **Manual QA (from plan):** Create task → confirm orchestrator subscribed; assign to another agent → that agent posts → orchestrator receives `thread_update`; set/remove orchestrator in UI and confirm badge and behavior; confirm no notification loops.

---

## 5. Verdict

**Approve with minor suggestions.** The refactor matches the plan, preserves multi-tenancy and loop prevention, and integrates cleanly. Typecheck passes (`npm run typecheck`). Optional improvement: validate `orchestratorAgentId` in `accounts.update` so the setting cannot reference another account’s agent.
