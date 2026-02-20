# @packages/backend

## 1.2.0

### Minor Changes

- 2c44b28: Delivery refactor, tests, and code-review follow-ups
  - **Runtime:** Refactored delivery loop; single poll seam `_runOnePollCycle`, `markDeliveredAndLog` helper, delivery-loop and delivery tests. **document_list** tool and `POST /agent/document-list` HTTP fallback when tools disabled. Simplified `resolveFinalTextToPost` (fallback disabled); consolidated policy tests; TypeScript/clarity in delivery and policy (TaskStatus, validation, no redundant casts). DeliveryContext payload truncation (doc/message caps). Session-key logging note per security audit.
  - **Backend:** Service action `listDocumentsForAgent` and internal `listForAgentTool`; index `by_account_undelivered_created`, take-based `listUndeliveredForAccount`. Mark actions (`markDelivered`, `markRead`, `markDeliveryEnded`) now take `accountId` and enforce existence in-mutation (single round-trip). `getForDelivery` parallelizes agent/task/message fetches. Upgrade error sanitization (`lib/sanitize.ts`, first-line + length cap). Service token length enforced in `requireServiceAuth`; `blockedReason`/`reason` max length in handlers. Validated `pendingUpgrade` and PR response in actions; removed redundant account-settings casts (schema types used). `clearTypingStateForAccount` capped via take; delivery rate-limit posture documented in `docs/runtime/delivery-rate-limiting.md`.

## 1.1.0

### Minor Changes

- c83febf: Backend-resolved task and system session keys; delivery uses OpenResponses instructions + compact input.
  - **Backend:** `agentRuntimeSessions` table and `resolveSessionKeys`; `getNotificationForDelivery` returns `deliverySessionKey` (task or system). Session keys no longer derived from legacy `agents.sessionKey`.
  - **Runtime:** Gateway and delivery use backend-resolved keys only; `buildDeliveryInstructions` + `buildNotificationInput` split; `task_history` tool; health and agent-sync register system keys from resolver.

### Patch Changes

- c83febf: USER.md + IDENTITY.md prompt layering and behavior flags (PR #128).
  - **Schema:** `accounts.settings.userMd`, `agents.identityContent`, behavior flags `canReviewTasks` / `canMarkDone` (account + agent).
  - **Backend:** `accounts.update` accepts `userMd`; `agents.create`/`update` accept `identityContent`; `migratePromptScaffold` mutation; `listForRuntime` returns effective USER/IDENTITY; fallback helpers in `lib/user_identity_fallback.ts`.
  - **Runtime:** Profile sync writes USER.md and IDENTITY.md per agent; delivery policy uses `effectiveBehaviorFlags.canReviewTasks` / `canMarkDone` only (no role/slug heuristics).
  - **Web:** Settings > Agent Profile tab for account-shared USER.md (admin-only save); Admin OpenClaw migration button and per-agent behavior flags.

## 1.0.3

### Patch Changes

- 6351a13: Security audit remediations: message content max length (100k), user message attachment validation from storage metadata, Next.js security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy), and root npm override for esbuild (>=0.25.0).

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
