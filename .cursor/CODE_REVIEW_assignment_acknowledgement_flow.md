# Code Review: Assignment Acknowledgement Flow

**Plan:** [assignment_acknowledgement_flow_dcf5a9b4.plan.md](.cursor/plans/assignment_acknowledgement_flow_dcf5a9b4.plan.md)  
**Scope:** Backend auto-start on agent assign, runtime acknowledgment prompt, docs/seed alignment.

---

## 1. Understand the change

- **Goal:** When an agent is assigned to an inbox task, the task moves to **In Progress** immediately (no wait for first message). The agent is prompted to **acknowledge and ask clarifying questions first** before doing substantive work.
- **Files touched:** `packages/backend/convex/tasks.ts`, `apps/runtime/src/delivery.ts`, `docs/runtime/AGENTS.md`, `docs/runtime/HEARTBEAT.md`, `packages/backend/convex/seed.ts`.
- **Assumption (from plan):** Auto-start applies only when at least one **agent** is assigned; user-only assignments keep `inbox → assigned`.

---

## 2. Review checklist

### Functionality

- [x] **Intended behavior matches requirements**
  - Assign mutation: when `task.status === "inbox"` and `nextAssignedAgentIds.length > 0`, `nextStatus = "in_progress"`; when only users are assigned, `nextStatus = "assigned"`. Matches plan.
  - Status-change notifications are **not** sent for the auto-start path: they are gated by `nextStatus && nextStatus !== task.status && hasAssignees && !shouldAssign`. When we auto-start, `shouldAssign` is true, so `!shouldAssign` is false → no duplicate notifications. Correct.
  - Activity is logged with `meta.reason: "auto_start_on_assign"` when moving from inbox to in_progress, and `"auto_assignment"` when moving to assigned. Audit trail is in place.
  - Runtime: assignment notifications get an extra instruction block (short ack first, clarifying questions, orchestrator or primary user mention). Orchestrator is chosen when `canMentionAgents` and `orchestratorAgentId` present and in `mentionableAgents`; otherwise primary user or “ask in the thread”. Matches plan.

- [x] **Edge cases**
  - **User-only assign:** `nextAssignedAgentIds.length === 0` → `nextStatus = "assigned"`. Correct.
  - **Task already in `assigned` and we add an agent:** `shouldAssign = task.status === "inbox" && ...` is false, so `nextStatus` stays null; status unchanged. Plan only required auto-start “on first agent assignment on an **inbox** task”, so this is acceptable.
  - **No orchestrator / no primary user:** `assignmentClarificationTarget` falls back to “If you need clarification, ask in the thread.” Safe.
  - **Workflow validator:** `TASK_STATUS_TRANSITIONS` still has `inbox: ["assigned"]`. The assign mutation does a direct `ctx.db.patch` and does not call `isValidTransition` for this system path, so the validator is unchanged for user-driven status changes. Intentional and correct.

- [x] **Error handling**
  - Assign: existing validation (task exists, account member, agents exist and belong to account) unchanged. No new failure paths introduced.
  - Delivery: `formatNotificationMessage` only builds strings; no new throws. `context` is typed as `any`; acceptable for this module but could be tightened later.

### Code quality

- [x] **Structure and naming**
  - `nextStatus` and `autoStartOnAssign` are clear. Comment “When at least one agent is assigned from inbox, auto-start to in_progress for UI” documents intent.
  - Runtime: `assignmentClarificationTarget` and `assignmentAckBlock` are descriptive; logic is localized and readable.

- [x] **Duplication**
  - Docs (AGENTS.md, HEARTBEAT.md) and seed (`DOC_AGENTS_CONTENT`, HEARTBEAT section, SOUL for squad-lead/engineer/qa) use consistent “acknowledge first” wording. No unnecessary duplication.

- [ ] **Tests / documentation**
  - No new automated tests (plan allowed optional unit test when/if backend test harness exists). Manual QA steps are documented in the plan.
  - **Suggestion:** When adding backend tests, add a case for `assign` that asserts: inbox + add agent → status `in_progress` and activity `meta.reason === "auto_start_on_assign"`.

### Security & safety

- [x] **No new vulnerabilities**
  - Assign still uses `requireAccountMember` and validates agents by `accountId`. No new inputs that could bypass auth.
  - Runtime prompt is assembled from Convex-backed context; no user-controlled injection into the assignment block.

- [x] **Inputs / outputs**
  - Assign args unchanged. Activity `meta` is structured (`oldStatus`, `newStatus`, `reason`). No sensitive data in new fields.

- [x] **Sensitive data**
  - No secrets or PII added. Orchestrator/primary user mention uses existing mention surface.

---

## 3. Additional notes

### Architecture

- System-only auto-start is confined to `tasks.assign` and does not change `task_workflow.ts` or the public transition table. User- and agent-driven status changes still go through the same rules. Good separation.

### Observability

- Activity feed stores `meta.reason` (`auto_start_on_assign` | `auto_assignment`), but `getActivityDescription` in `lib/activity.ts` does not take `meta` and always shows “changed status of …”. So the reason is **stored** and traceable in the DB/dashboard but **not** shown in the in-app feed. Acceptable for rollout; if you want it visible, extend `getActivityDescription(..., meta?)` and the feed UI to show a short reason (e.g. “(auto-started)” when `reason === "auto_start_on_assign"`).

### Consistency

- **Default SOUL template** (seed.ts fallback for roles other than squad-lead/engineer/qa) does **not** include the “On new assignment, acknowledge first…” line. Squad-lead, engineer, and qa do. Plan said “optionally” for SOUL; for full consistency you could add the same line to the default SOUL block so any future role gets it without code change.

### Performance

- No extra queries in assign (same notifications and subscriptions as before). Runtime adds a small amount of string building and one `mentionableAgents.some`/`.find` for the orchestrator; negligible.

---

## 4. Verdict and actions

**Approve** with optional follow-ups:

1. **Optional:** Extend activity feed to show `meta.reason` (e.g. “(auto-started)”) for `task_status_changed` when present, so the reason is visible in the UI.
2. **Optional:** Add the acknowledgment-first line to the default SOUL template in seed.ts for consistency across all roles.
3. **Optional:** When a backend test harness exists, add a test for assign auto-start (inbox + agent → in_progress + `auto_start_on_assign` in activity meta).

No blocking issues; behavior and security align with the plan.
