# HEARTBEAT.md — Wake Checklist (Strict)

## 1) Load context (always)

- Read memory/WORKING.md
- Read today's note (memory/YYYY-MM-DD.md)
- Fetch:
  - unread notifications (mentions + thread updates)
  - tasks assigned to me where status != done
  - last 20 activities for the account

## 2) Decide what to do (priority order)

1. A direct @mention to me
2. A task assigned to me and in REVIEW (needs response)
3. A task assigned to me and in IN_PROGRESS / ASSIGNED
4. A thread I'm subscribed to with new messages
5. Otherwise: scan the activity feed for something I can improve

## 3) Execute one atomic action

Pick one action that can be completed quickly:

- post a clarifying question (only if truly blocked)
- write a doc section
- test a repro step and attach logs
- update a task status with explanation
- refactor a small component (developer agent)
- produce a small deliverable chunk

## 4) Report + persist memory (always)

- Post a thread update using the required format
- Update WORKING.md:
  - Current task
  - Status
  - Next step (single)
- Append a short entry to today's log with timestamp

## 5) Stand down rules

If you did not act:

- Post `HEARTBEAT_OK` only if your team wants that signal
- Otherwise stay silent to avoid noise
