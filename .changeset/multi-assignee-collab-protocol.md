---
"runtime-service": patch
"@packages/backend": patch
---

**Multi-assignee collaboration protocol**

- **Runtime:** Add per-notification prompt reinforcement when a task has multiple assignees and the recipient is one of them (declare sub-scope, check thread, use response_request for handoffs). Align DEFAULT_HEARTBEAT_MD with docs/seed (stale-dependency handling). Add `isRecipientInMultiAssigneeTask` policy helper and tests.
- **Backend (seed):** Add "Working with multiple assignees" to DOC_AGENTS_CONTENT and multi-assignee bullet to DOC_HEARTBEAT_CONTENT. Add role-specific multi-assignee coordination to buildSoulContent (squad-lead, engineer, qa, designer, writer).
- **Docs:** AGENTS.md and HEARTBEAT.md protocol sections; releasing.md documents when agent instruction and seed updates take effect.
