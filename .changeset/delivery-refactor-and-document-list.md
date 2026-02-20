---
"@packages/backend": minor
"runtime-service": minor
---

Delivery refactor, tests, and code-review follow-ups

- **Runtime:** Refactored delivery loop; single poll seam `_runOnePollCycle`, `markDeliveredAndLog` helper, delivery-loop and delivery tests. **document_list** tool and `POST /agent/document-list` HTTP fallback when tools disabled. Simplified `resolveFinalTextToPost` (fallback disabled); consolidated policy tests; TypeScript/clarity in delivery and policy (TaskStatus, validation, no redundant casts). DeliveryContext payload truncation (doc/message caps). Session-key logging note per security audit.
- **Backend:** Service action `listDocumentsForAgent` and internal `listForAgentTool`; index `by_account_undelivered_created`, take-based `listUndeliveredForAccount`. Mark actions (`markDelivered`, `markRead`, `markDeliveryEnded`) now take `accountId` and enforce existence in-mutation (single round-trip). `getForDelivery` parallelizes agent/task/message fetches. Upgrade error sanitization (`lib/sanitize.ts`, first-line + length cap). Service token length enforced in `requireServiceAuth`; `blockedReason`/`reason` max length in handlers. Validated `pendingUpgrade` and PR response in actions; removed redundant account-settings casts (schema types used). `clearTypingStateForAccount` capped via take; delivery rate-limit posture documented in `docs/runtime/delivery-rate-limiting.md`.
