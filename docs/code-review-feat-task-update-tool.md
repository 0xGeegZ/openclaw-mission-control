# Code Review: feat/task-update-tool (against DEV)

**Reviewer:** Code review checklist  
**Scope:** All changes vs `origin/dev`  
**Date:** 2025-02-12

---

## 1. Understand the change

### PR / branch summary

- **Branch:** `feat/task-update-tool`
- **Purpose:** Add a unified **task_update** tool and HTTP endpoint so agents can update task fields (title, description, priority, labels, assignees, status, dueDate) in one call, with the same permission model as `task_status` (`canModifyTaskStatus`).

### Scope of changes

| Area | Files | Summary |
|------|--------|--------|
| Runtime tool | `taskUpdateTool.ts`, `taskUpdateTool.test.ts` | Schema, validation, Convex action call, unit tests |
| Runtime health | `health.ts` | `POST /agent/task-update` using `requireLocalAgentSession`, validation, metrics |
| Runtime tooling | `agentTools.ts`, `agentTools.test.ts` | Register task_update when `hasTaskContext` + `canModifyTaskStatus`, execution branch, tests |
| Backend | `service/actions.ts`, `service/tasks.ts` | `updateTaskFromAgent` action, `updateFromAgent` internal mutation, validation, activity logging |
| Docs / seeds / prompts | `seed.ts`, `AGENTS.md`, `openclaw-profiles.ts`, `delivery.ts`, `gateway.ts` | Capabilities list, HTTP fallback, delivery instructions, comments |

### Assumptions

- Service token and account scoping are trusted (same as other agent endpoints).
- `assignedUserIds` are Clerk user IDs (strings); no Convex `users` table.
- Status transitions reuse existing `findStatusPath` / `updateStatusFromAgent`; “must be in review before done” rule is preserved.

---

## 2. Validate functionality

### Intended behavior

- **Tool:** When an agent has task context and `canModifyTaskStatus`, it can call `task_update` with `taskId` and any subset of title, description, priority, labels, assignedAgentIds, assignedUserIds, status, blockedReason, dueDate. At least one updatable field is required.
- **HTTP:** Same contract via `POST /agent/task-update` with JSON body and `x-openclaw-session-key`; local-only, same auth as other agent endpoints.
- **Backend:** `updateTaskFromAgent` checks service auth, account, agent existence, `canModifyTaskStatus`, task existence/account; validates priority and status/blockedReason; applies status via existing transition path, then patches other fields via `updateFromAgent`. Activity is logged as `task_updated`.

### Edge cases

- **Empty taskId:** Rejected in tool, health, and action (task lookup fails).
- **No fields to update:** Rejected in tool and health with 400; action returns `changedFields: []` if called with none (defensive).
- **Status “blocked” without blockedReason:** Rejected in tool, health, and action.
- **Invalid status:** Rejected; allowed set is in_progress, review, done, blocked (no inbox/assigned via this tool).
- **Priority:** Validated to 1–5 in tool, health, and action (aligned with schema and UI; see fix below).
- **assignedUserIds:** Validated as array; normalized to non-empty strings in `updateFromAgent`; no DB lookup (Clerk IDs).
- **assignedAgentIds:** Validated in `updateFromAgent` to exist and belong to the same account.
- **“Done” without canMarkDone:** Rejected in `agentTools` before calling the tool (same pattern as task_status).

### Error handling and logging

- **Tool:** Returns `{ success: false, error }` on validation or Convex errors; logs warning on failure.
- **Health:** Uses `mapTaskStatusError` for HTTP status (401/403/404/422/500); logs warn/error with context (agentId, taskId, duration).
- **Backend:** Throws with clear messages; “Invalid priority” mapped to 422 via `mapTaskStatusError` (and “invalid priority” added to that mapper).
- **Metrics:** `recordSuccess` / `recordFailure` for `agent.task_update` with duration.

---

## 3. Assess quality

### Structure and maintainability

- **DRY:** Health uses `requireLocalAgentSession` for task-update (same as task-status, task-create). Validation is intentionally duplicated in runtime vs backend (defense in depth and clear error messages at each layer).
- **Naming:** Consistent `task_update`, `updateTaskFromAgent`, `updateFromAgent`, and `task-update` in URLs and logs.
- **File layout:** New tool in dedicated `taskUpdateTool.ts`; backend logic in existing `service/actions.ts` and `service/tasks.ts`; no new backend files.

### Duplication and dead code

- Allowed status set and “at least one field” checks appear in tool, health, and action; acceptable for validation at each boundary.
- No dead code observed.

### Tests and documentation

- **taskUpdateTool.test.ts:** Covers empty taskId, no fields, priority range, invalid status, blocked without blockedReason, title-only update, multiple fields, status+blockedReason, Convex error, trimming, all statuses, assignee arrays, dueDate. Uses top-level import and `vi.mocked(getConvexClient)` (no `require` in body).
- **agentTools.test.ts:** Ensures task_update is present when `hasTaskContext` and `canModifyTaskStatus`, and absent otherwise; capability label and schema names checked.
- **JSDoc:** Present on exported schema, `executeTaskUpdateTool`, `updateTaskFromAgent`, and `updateFromAgent`. Comments explain non-obvious rules (e.g. status transitions, allowed fields whitelist).

---

## 4. Security and safety

### Vulnerabilities and validation

- **Auth:** task-update uses same local-only + session checks as other agent endpoints; no new auth surface.
- **Inputs:** taskId and optional fields validated; priority 1–5; status from fixed set; blockedReason required when status is blocked. assignedAgentIds validated to same-account agents in mutation.
- **Mutation:** `updateFromAgent` only allows a fixed set of fields; no arbitrary key injection.
- **Secrets:** No tokens or credentials in logs; only taskId/agentId and error messages.

### Sensitive data

- No PII in success logs; failure logs include error message (may include backend messages; acceptable for operator debugging).

---

## 5. Review checklist

### Functionality

- [x] Intended behavior works and matches requirements (unified task field updates, same gating as task_status).
- [x] Edge cases handled (empty taskId, no fields, invalid status/priority, blockedReason, assignees).
- [x] Error handling and logging are appropriate and actionable.

### Code quality

- [x] Structure is clear and maintainable; reuse of `requireLocalAgentSession` and existing status flow.
- [x] No unnecessary duplication beyond intentional validation at boundaries; no dead code.
- [x] Tests and documentation updated (taskUpdateTool tests, agentTools tests, seed, AGENTS.md, profiles, delivery, gateway).

### Security and safety

- [x] No obvious new vulnerabilities; auth and validation aligned with existing agent endpoints.
- [x] Inputs validated and outputs constrained (whitelist in mutation).
- [x] Sensitive data handled correctly (no credential logging).

---

## 6. Findings and fixes applied

### Critical: Priority range vs schema and UI (fixed)

- **Issue:** task_update and backend originally used priority **0–4**, while the Convex schema and web app use **1–5** (1 = highest, 5 = lowest). That would allow storing 0 (no UI mapping) or misalign “lowest” with the rest of the product.
- **Fix:** Priority validation and schema descriptions were updated to **1–5** in:
  - `taskUpdateTool.ts` (schema min/max and error message)
  - `health.ts` (validation and error message)
  - `service/actions.ts` (validation and error message)
  - `taskUpdateTool.test.ts` (out-of-range test now uses priority 6 and expects “1 and 5” message).

---

## 7. Additional notes

### Architecture and design

- Reusing `findStatusPath` and `updateStatusFromAgent` for status keeps transition rules and notifications consistent. Splitting “other fields” into `updateFromAgent` is clear and keeps the mutation focused.
- task_update is offered alongside task_status under the same capability; agents can use either for status, or task_update for status + other fields in one call.

### Performance

- One action call from runtime; action does several queries (auth, agent, account, task) then one or two mutations (status path + optional patch). Acceptable for an agent-triggered operation.
- No N+1; assignedAgentIds validation is a bounded loop over the provided list.

### Standards and practices

- Matches project patterns: Convex snake_case, auth guards, activity logging, runtime local-only + session, metrics.
- Imports at top of file; JSDoc on exports; meaningful log prefixes (`[task-update]`).

### Suggestions (optional)

- **Backend unit test:** Consider a Convex test for `updateTaskFromAgent` (e.g. success, no-op when no updates, invalid priority, forbidden status transition) to lock behavior.
- **Seed/AGENTS:** If you later add an example payload for task-update HTTP fallback, use priority in 1–5 (e.g. `"priority": 3`) for consistency.

---

## 8. Summary

The feat/task-update-tool change is **production-ready** with one critical fix applied: **priority range is now 1–5** everywhere, aligned with the schema and UI. After that fix, functionality, edge cases, error handling, structure, tests, docs, and security are in good shape. Recommend merge after standard CI (typecheck, lint, tests) and a quick smoke test of the task-update tool and HTTP endpoint in a dev environment.
