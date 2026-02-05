---
name: Assignment acknowledgement flow
overview: Auto-start tasks on agent assignment and enforce an immediate acknowledgment/clarification reply before work begins, aligning runtime prompts and docs with the intended workflow.
todos:
  - id: backend-auto-start
    content: Update assign mutation to auto-start agent tasks
    status: completed
  - id: runtime-ack-prompt
    content: Add assignment acknowledgment prompt block
    status: completed
  - id: docs-sync
    content: Align AGENTS/HEARTBEAT/seed docs with ack rule
    status: completed
  - id: manual-qa
    content: Verify auto-start + acknowledgment flow in UI
    status: completed
isProject: false
---

# Assignment Acknowledgement Start Flow

## 1. Context & goal

We want assigned agent tasks to show **In Progress immediately** (no waiting for the first agent message) while also prompting the agent to **acknowledge and ask clarifying questions first** before starting work. This must align with the canonical workflow in `docs/concept/` and keep audit trails, multi-tenancy, and realtime updates intact. Assumption (user skipped scope question): auto-start applies globally and only when at least one **agent** is assigned; user-only assignments keep current behavior.

## 2. Codebase research summary

Files inspected:

- [docs/concept/openclaw-mission-control-initial-article.md](docs/concept/openclaw-mission-control-initial-article.md) — canonical task lifecycle and team collaboration model.
- [docs/concept/openclaw-mission-control-cursor-core-instructions.md](docs/concept/openclaw-mission-control-cursor-core-instructions.md) — invariants: workflow validation, audit logs, multi-tenancy, runtime contract.
- [docs/runtime/AGENTS.md](docs/runtime/AGENTS.md) and [docs/runtime/HEARTBEAT.md](docs/runtime/HEARTBEAT.md) — agent rules and response format.
- [packages/backend/convex/lib/task_workflow.ts](packages/backend/convex/lib/task_workflow.ts) — allowed transitions and validation.
- [packages/backend/convex/tasks.ts](packages/backend/convex/tasks.ts) — `assign` mutation currently moves `inbox -> assigned` and creates assignment notifications.
- [packages/backend/convex/lib/notifications.ts](packages/backend/convex/lib/notifications.ts) — assignment/status notifications.
- [packages/backend/convex/service/notifications.ts](packages/backend/convex/service/notifications.ts) — runtime delivery context includes `orchestratorAgentId` and `primaryUserMention`.
- [apps/runtime/src/delivery.ts](apps/runtime/src/delivery.ts) — prompt assembly and auto-advance behavior.
- [packages/backend/convex/schema.ts](packages/backend/convex/schema.ts) — task and notification fields.

Existing patterns to reuse:

- Status validation and audit logging (`isValidTransition`, `validateStatusRequirements`, `logActivity`).
- Runtime prompt assembly in `formatNotificationMessage()`.
- Orchestrator and primary user mention context from `getForDelivery`.

## 3. High-level design

### Backend (Convex)

- When an **agent** is assigned to a task in `inbox`, immediately move status to `in_progress` inside `tasks.assign`.
- Continue to create assignment notifications and thread subscriptions.
- Log a `task_status_changed` activity with a clear `meta.reason` (e.g., `auto_start_on_assign`) for auditability.
- Keep workflow transitions unchanged for user-driven status changes; this is a **system-only** auto-start path.

### Runtime prompt (OpenClaw)

- For `notification.type === "assignment"`, add explicit instructions:
  - Send a **short acknowledgment first** (1–2 sentences).
  - Ask **clarifying questions** if needed.
  - If `canMentionAgents` is true and `orchestratorAgentId` exists, mention that orchestrator; otherwise mention the primary user.
  - Do **not** claim completion or provide full Summary/Work done format in this first reply.
  - Begin substantive work **after** the acknowledgment.

### Docs / agent guidance

- Update `AGENTS.md`, `HEARTBEAT.md`, and `DOC_AGENTS_CONTENT` (seed) to make the acknowledgment-first rule explicit.

### Data flow (updated)

User assigns agent → `tasks.assign` auto-sets `in_progress` + logs activity → assignment notification → runtime prompt requests acknowledgment/clarification → agent posts short ack → thread updated.

## 4. File & module changes

- [packages/backend/convex/tasks.ts](packages/backend/convex/tasks.ts)
  - In `assign`, when `task.status === "inbox"` and `nextAssignedAgentIds.length > 0`, set `nextStatus` to `"in_progress"` (instead of `"assigned"`).
  - Add `logActivity` meta reason `auto_start_on_assign` for the status change.
  - Keep assignment notifications intact; decide whether to **skip** status-change notifications for this auto-start to avoid duplicate noise (recommend skip, since UI updates in realtime).
- [apps/runtime/src/delivery.ts](apps/runtime/src/delivery.ts)
  - Extend `formatNotificationMessage` with an **assignment-specific** instruction block.
  - Add a small helper to surface **orchestrator mention** (by matching `orchestratorAgentId` to `mentionableAgents`) and fall back to `primaryUserMention`.
- [docs/runtime/AGENTS.md](docs/runtime/AGENTS.md)
  - Add an “Assignment acknowledgment” rule under Task state rules or Communication rules.
- [docs/runtime/HEARTBEAT.md](docs/runtime/HEARTBEAT.md)
  - Add a step: if a new assignment is detected, acknowledge first with a short reply and questions, then proceed.
- [packages/backend/convex/seed.ts](packages/backend/convex/seed.ts)
  - Update `DOC_AGENTS_CONTENT` to mirror the new acknowledgment rule.
  - Optionally add a small SOUL personality constraint reinforcing “acknowledge first”.

## 5. Step-by-step tasks

1. **Backend auto-start**

- Update [packages/backend/convex/tasks.ts](packages/backend/convex/tasks.ts) `assign` mutation to set `nextStatus = "in_progress"` when the first agent assignment occurs on an `inbox` task.
- Add/adjust `logActivity` meta with `reason: "auto_start_on_assign"` so this is traceable in the activity feed.
- Decide and implement status-change notification behavior for this auto-start (recommended: no extra notifications to avoid redundant alerts).

1. **Runtime acknowledgment prompt**

- Update [apps/runtime/src/delivery.ts](apps/runtime/src/delivery.ts) `formatNotificationMessage` to append an `assignment`-specific instruction block.
- Compute orchestrator mention (if `orchestratorAgentId` is present and mentions are allowed), otherwise instruct to @mention the primary user.

1. **Docs alignment**

- Update [docs/runtime/AGENTS.md](docs/runtime/AGENTS.md) and [docs/runtime/HEARTBEAT.md](docs/runtime/HEARTBEAT.md) with the acknowledgment-first rule and clarification guidance.
- Mirror the same language in [packages/backend/convex/seed.ts](packages/backend/convex/seed.ts) `DOC_AGENTS_CONTENT` (and optionally SOUL templates).

1. **Manual QA + sanity checks**

- Verify assignment changes immediately move tasks to `in_progress` in the UI.
- Verify the first agent reply is short and includes clarifying questions if needed.

## 6. Edge cases & risks

- **Assigned column becomes underused**: auto-start skips `assigned` for agent tasks. Mitigation: treat auto-start as system-only and document behavior clearly.
- **User-only assignments**: should keep current `inbox -> assigned` behavior (per assumption). Ensure agent-only condition is enforced.
- **Agent lacks mention permission**: ensure prompt falls back to primary user for questions.
- **Agent doesn’t respond quickly**: status will still be `in_progress` immediately; visibility improves but could be misleading. Consider adding a future “awaiting acknowledgment” badge if this becomes an issue.

## 7. Testing strategy

- **Manual QA**
  - Create task → assign agent → status immediately changes to `in_progress`.
  - Assignment notification delivered → agent posts short acknowledgment (1–2 sentences).
  - If agent needs clarification, message includes a question and mention as instructed.
  - Verify no extra status-change notifications are created if we choose to skip them.
- **Optional automated coverage (if desired)**
  - Add a lightweight unit test around `assign` status auto-start behavior if/when backend test harness is introduced.

## 8. Rollout / migration

- No data migration required.
- Behavior change is immediate once deployed to Convex + runtime.
- Monitor activity feed to confirm `auto_start_on_assign` entries and confirm no notification spam.

## 9. TODO checklist

- Backend: update `assign` mutation to auto-start on agent assignment
- Backend: log `task_status_changed` with `reason: auto_start_on_assign`
- Runtime: add assignment acknowledgment instructions to `formatNotificationMessage`
- Runtime: add orchestrator/primary user mention guidance
- Docs: update `AGENTS.md` acknowledgment rule
- Docs: update `HEARTBEAT.md` acknowledgment rule
- Seed: mirror doc changes in `DOC_AGENTS_CONTENT` (and SOUL if needed)
- QA: verify status auto-start and acknowledgment flow end-to-end
