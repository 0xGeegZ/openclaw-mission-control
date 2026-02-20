---
"@packages/backend": minor
"runtime-service": minor
---

Delivery refactor and tests, backend service updates

- **Runtime:** Refactored delivery loop; single poll seam `_runOnePollCycle`, `markDeliveredAndLog` helper, delivery-loop and delivery tests. Added **document_list** tool (list documents for account/task); tool-only, documented in AGENTS.md and CHANGELOG.
- **Backend:** New service action `listDocumentsForAgent` and internal query `listForAgentTool`; internal query `getByIdForAccount` for lightweight notification existence check (used by markNotificationDelivered, markNotificationRead, markNotificationDeliveryEnded). Shared `AGENT_ALLOWED_STATUSES`; finite limit validation for document list; index `by_account_undelivered_created` and take-based `listUndeliveredForAccount`. Schema: new notifications index.
