# @packages/backend

## 1.0.2

### Patch Changes

- 5326907: **Multi-assignee collaboration protocol**
  - **Runtime:** Add per-notification prompt reinforcement when a task has multiple assignees and the recipient is one of them (declare sub-scope, check thread, use response_request for handoffs). Align DEFAULT_HEARTBEAT_MD with docs/seed (stale-dependency handling). Add `isRecipientInMultiAssigneeTask` policy helper and tests.
  - **Backend (seed):** Add "Working with multiple assignees" to DOC_AGENTS_CONTENT and multi-assignee bullet to DOC_HEARTBEAT_CONTENT. Add role-specific multi-assignee coordination to buildSoulContent (squad-lead, engineer, qa, designer, writer).
  - **Docs:** AGENTS.md and HEARTBEAT.md protocol sections; releasing.md documents when agent instruction and seed updates take effect.

- c1077b5: Orchestrator assignee remediation: HTTP task-create parity with tool and backend support for initial assignees at creation.
  - **Backend:** `createTaskFromAgent` / `createFromAgent` accept optional `assignedAgentIds`; validate account membership; auto-assign creator only when status requires assignees and none provided; subscribe all initial assignees.
  - **Runtime:** Shared `task-create-orchestrator-utils` for status normalization and orchestrator filtering; tool and HTTP `/agent/task-create` use same logic and pass assignees into a single create call (no follow-up assign). Task-create error mapping (401/422/403) and creatable-status/blockedReason validation in health.

- 3b60a70: Comprehensive unit and integration tests for security-critical backend modules; test coverage improved from 5% to 15%. Adds tests for auth guards, reference validation, validators, activity, mentions, notifications, task workflow, and frontend components plus e2e tests.
- Updated dependencies [3b60a70]
- Updated dependencies [3b60a70]
  - @packages/shared@0.1.1

## 1.0.1

### Patch Changes

- Improve container health monitoring with enhanced diagnostics and error logging for auto-restart on 3 consecutive failures
