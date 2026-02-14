# HEARTBEAT.md — Wake Checklist (Strict)

## 1) Load context (always)

- Read memory/WORKING.md
- Read today's note (memory/YYYY-MM-DD.md)
- Fetch:
  - unread notifications (mentions + thread updates)
  - tasks assigned to me where status != done
  - last 20 activities for the account
- If you are the orchestrator: also review assigned / in_progress / blocked tasks across the account.

## 2) Decide what to do (priority order)

1. A direct @mention to me
2. A task assigned to me and in IN_PROGRESS / ASSIGNED
3. A thread I'm subscribed to with new messages
4. If orchestrator: follow up on assigned / in_progress / blocked tasks even if assigned to others. When requesting status from assignees, use **response_request** only; put your follow-up summary in your reply (do not also post task_message).
5. Otherwise: scan the activity feed for something I can improve

Avoid posting review status reminders unless you have new feedback or a direct request.

**New assignment:** If the notification is an assignment, your first action must be to acknowledge in 1–2 sentences and ask clarifying questions if needed (@mention orchestrator or primary user). Only after that reply, proceed to substantive work on a later turn.

## 3) Execute one atomic action

Pick one action that can be completed quickly:

- post a clarifying question (only if truly blocked)
- write a doc section
- test a repro step and attach logs
- update a task status with explanation (follow AGENTS.md task state rules: valid transitions, human dependency -> blocked, unblock -> in_progress)
- refactor a small component (developer agent)
- produce a small deliverable chunk
 
Action scope rules:

- Only do work that is strictly required by the current task
- Do not add cleanup, refactors, or "nice-to-have" changes
- If you discover out-of-scope improvements, create a follow-up task instead
- Use your available skills as much as possible while working.

Do not narrate the checklist or your intent (avoid lines like "I'll check..."). Reply only with a concrete action update or `HEARTBEAT_OK`.

Action scope rules:

- Only do work that is strictly required by the current task
- Do not add cleanup, refactors, or "nice-to-have" changes
- If you discover out-of-scope improvements, create a follow-up task instead
- Before executing the action, check your assigned skills and use every relevant skill.
- If no assigned skill applies, include `No applicable skill` in your task update.

## 4) Report + persist memory (always)

- If you took a concrete action on a task:
  - Post a thread update using the required format
  - Include a line: `Task ID: <id>` so the runtime can attach your update
  - Update WORKING.md (current task, status, next step)
  - Append a short entry to today's log with timestamp
- If you did not take a concrete action:
  - Reply with `HEARTBEAT_OK` only
  - Do not post a thread update

## 5) Stand down rules

If you did not act:

- Post `HEARTBEAT_OK` only
- Otherwise stay silent to avoid noise
