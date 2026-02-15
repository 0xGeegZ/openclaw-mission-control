---
"runtime-service": patch
"@packages/backend": patch
---

Orchestrator assignee remediation: HTTP task-create parity with tool and backend support for initial assignees at creation.

- **Backend:** `createTaskFromAgent` / `createFromAgent` accept optional `assignedAgentIds`; validate account membership; auto-assign creator only when status requires assignees and none provided; subscribe all initial assignees.
- **Runtime:** Shared `task-create-orchestrator-utils` for status normalization and orchestrator filtering; tool and HTTP `/agent/task-create` use same logic and pass assignees into a single create call (no follow-up assign). Task-create error mapping (401/422/403) and creatable-status/blockedReason validation in health.
