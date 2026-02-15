---
name: billing-usage-tracking
overview: Implement end-to-end usage tracking and plan enforcement for billing metrics (agents, tasks, documents, messages, storage) across user and agent/runtime flows.
todos:
  - id: backend-storage-usage
    content: Update billing usage mutation to handle storage-only increments (internal-safe).
    status: pending
  - id: user-flows-tracking
    content: Wire enforcement + usage increments into user create/upload flows.
    status: pending
  - id: agent-flows-tracking
    content: Wire enforcement + usage increments into agent/runtime create/upload flows.
    status: pending
  - id: tests-usage
    content: Add tests for usage/enforcement and verify UI updates.
    status: pending
isProject: false
---

# Billing Usage Tracking & Enforcement Plan

## 1. Context & goal

We need to complete billing usage tracking so the Usage tab reflects real activity and plan limits are enforced for both user actions and agent/runtime actions. This adds consistent counting for agents, tasks, documents, messages, and storage, and blocks creations/uploads when limits are reached. Constraints: Convex backend, multi-tenant auth guards, existing billing schema and enforcement helpers, and runtime service-auth flows.

## 2. Codebase research summary

Files inspected:

- [packages/backend/convex/billing.ts](packages/backend/convex/billing.ts)
- [packages/backend/convex/lib/billing_enforcement.ts](packages/backend/convex/lib/billing_enforcement.ts)
- [packages/backend/convex/schema.ts](packages/backend/convex/schema.ts)
- [packages/backend/convex/agents.ts](packages/backend/convex/agents.ts)
- [packages/backend/convex/tasks.ts](packages/backend/convex/tasks.ts)
- [packages/backend/convex/documents.ts](packages/backend/convex/documents.ts)
- [packages/backend/convex/messages.ts](packages/backend/convex/messages.ts)
- [packages/backend/convex/service/tasks.ts](packages/backend/convex/service/tasks.ts)
- [packages/backend/convex/service/documents.ts](packages/backend/convex/service/documents.ts)
- [packages/backend/convex/service/messages.ts](packages/backend/convex/service/messages.ts)
- [packages/backend/convex/service/actions.ts](packages/backend/convex/service/actions.ts)
- [apps/web/src/components/billing/UsageCard.tsx](apps/web/src/components/billing/UsageCard.tsx)

What we learned:

- `usageRecords` is already defined in schema and `getCurrentUsage` reads it.
- `incrementUsage` exists but has no call sites.
- Enforcement utilities exist (`enforceAgentLimit`, `enforceTaskLimit`, `enforceDocumentLimit`, `enforceStorageLimit`) but are unused.
- User flows: `agents.create`, `tasks.create`, `documents.create`, `messages.create`, `messages.registerUpload`.
- Agent/runtime flows: `service.tasks.createFromAgent`, `service.documents.createOrUpdateFromAgent`, `service.messages.createFromAgent`, `service.messages.registerUploadFromAgent` via `service/actions`.
- Storage currently only exists for message attachments (`messageUploads` and `_storage`).

## 3. High-level design

Backend-only changes to wire usage tracking and enforcement into existing create/upload flows.

Data flows:

- User create → Convex mutation (`agents.create` / `tasks.create` / `documents.create` / `messages.create`) → enforce limit (plan) → insert → call `incrementUsage` → UI reads `getCurrentUsage`.
- Agent create via runtime → `service/actions.*` → `internal.service.*` create → enforce limit (plan) → insert → `incrementUsage`.
- Uploads → `messages.registerUpload` / `service.messages.registerUploadFromAgent` → enforce storage limit → insert into `messageUploads` → `incrementUsage` storageBytes.

Key functions/types:

- `requireAccountMember`, `requireAccountAdmin` (account + plan access).
- `incrementUsage` (extend for storage updates).
- `enforceAgentLimit`, `enforceTaskLimit`, `enforceDocumentLimit`, `enforceStorageLimit`.
- `messageUploads` and `_storage` metadata for file size.

## 4. File & module changes

Existing files to touch:

- [packages/backend/convex/billing.ts](packages/backend/convex/billing.ts)
  - Extend `incrementUsage` to support storage-only increments (e.g., allow `type: "storage"` or add a dedicated `incrementStorageUsage` mutation). Ensure it can update `storageBytes` without incrementing counts.
  - Keep auth guard (`requireAccountMember`) or add an internal variant if needed for agent/runtime flows.
- [packages/backend/convex/agents.ts](packages/backend/convex/agents.ts)
  - In `create`, enforce agent limit using `account.plan` before insert.
  - After successful insert, call `incrementUsage` for `agents`.
- [packages/backend/convex/tasks.ts](packages/backend/convex/tasks.ts)
  - In `create`, enforce `enforceTaskLimit` using account plan before insert.
  - After insert, call `incrementUsage` for `tasks`.
- [packages/backend/convex/documents.ts](packages/backend/convex/documents.ts)
  - In `create`, enforce `enforceDocumentLimit` when creating a file (not folder) and `taskId` is present; skip for folders.
  - After insert, call `incrementUsage` for `documents` when creating a file.
  - In `duplicate`, also increment documents usage for the newly created file.
- [packages/backend/convex/messages.ts](packages/backend/convex/messages.ts)
  - In `registerUpload`, enforce storage limit using meta.size and account.plan, then increment storage usage only when a new `messageUploads` record is created.
  - In `create`, increment usage for `messages` after insert.
- [packages/backend/convex/service/tasks.ts](packages/backend/convex/service/tasks.ts)
  - In `createFromAgent`, read account plan via `agent.accountId` and enforce `enforceTaskLimit` before insert.
  - After insert, increment `tasks` usage.
- [packages/backend/convex/service/documents.ts](packages/backend/convex/service/documents.ts)
  - In `createOrUpdateFromAgent`, when creating a new document, enforce `enforceDocumentLimit` (only when `taskId` provided), and increment documents usage after insert.
- [packages/backend/convex/service/messages.ts](packages/backend/convex/service/messages.ts)
  - In `registerUploadFromAgent`, enforce storage limit using meta.size and account.plan, and increment storage usage when inserting a new upload record.
  - In `createFromAgent`, increment messages usage after insert.
- [packages/backend/convex/service/actions.ts](packages/backend/convex/service/actions.ts)
  - If `incrementUsage` remains user-auth only, add internal helper mutation calls via `internal.billing.*` or add internal variants; ensure service actions can increment usage without requiring user auth.
  - Keep service-token validation as-is.

No new files required unless tests are added.

## 5. Step-by-step tasks

1. Update `billing.ts` to support storage usage increments (explicit `incrementStorageUsage` mutation or `type: "storage"` path) and define any internal variant needed for service flows.
2. Wire enforcement + usage increment into user create flows:

- `agents.create` → enforce agent limit → increment agents.
- `tasks.create` → enforce task limit → increment tasks.
- `documents.create` and `documents.duplicate` → enforce doc limit (files only) → increment documents.
- `messages.create` → increment messages.

1. Wire storage enforcement and tracking into user upload flow:

- `messages.registerUpload` → enforce storage limit using `_storage` size → increment storageBytes only on new upload insert.

1. Wire enforcement + usage increment into agent/runtime create flows:

- `service.tasks.createFromAgent` → enforce task limit → increment tasks.
- `service.documents.createOrUpdateFromAgent` (create path) → enforce doc limit (files only) → increment documents.
- `service.messages.createFromAgent` → increment messages.

1. Wire storage enforcement + tracking for agent/runtime upload flow:

- `service.messages.registerUploadFromAgent` → enforce storage limit using `_storage` size → increment storageBytes only on new upload insert.

1. If needed, add tests for tracking/enforcement behavior (unit tests for helpers + integration tests for create flows updating `usageRecords`).

## 6. Edge cases & risks

- **Double counting uploads**: only increment `storageBytes` when `messageUploads` insert is new; skip if already exists.
- **Folders vs files**: document limits should apply only to files; folders should not increment document usage.
- **Docs without `taskId**`: enforcement is per task; decide whether to skip enforcement when `taskId` is missing (current plan: skip enforcement, still increment usage).
- **Concurrency**: simultaneous creates may exceed limits if two requests pass enforcement before usage is incremented. Mitigate with optimistic checks and accept small race risk, or add retry logic if needed.
- **Service auth**: internal usage increments must be callable from service actions without user auth. Ensure a safe internal mutation path or allow service token with internal auth.

## 7. Testing strategy

- Unit tests:
  - `incrementUsage` (including storage-only increments).
  - `enforceTaskLimit` / `enforceDocumentLimit` / `enforceStorageLimit` with boundary conditions.
- Integration tests:
  - Creating agent/task/document/message increments `usageRecords` for the correct period.
  - Registering an upload increments `storageBytes` and enforces limits.
  - Agent/runtime create paths update usage the same way as user paths.
- Manual QA:
  - Create an agent → Usage “AI Agents” increases.
  - Create a task → Usage “Tasks” increases.
  - Create a document linked to a task → “Documents” increases.
  - Upload an attachment → “Storage” increases; over-limit upload is blocked.

## 8. Rollout / migration

- No data migration required. Roll out behind existing billing feature; add logging if needed for enforcement errors.
- Consider a feature flag if enforcement should be staged (e.g., tracking first, enforcement later).

## 9. TODO checklist

- Backend
  - Extend `incrementUsage` to support storage-only increments or add `incrementStorageUsage`.
  - Add enforcement + usage increments to `agents.create`.
  - Add enforcement + usage increments to `tasks.create`.
  - Add enforcement + usage increments to `documents.create` and `documents.duplicate` (files only).
  - Add message usage increments to `messages.create`.
  - Add storage enforcement + increments to `messages.registerUpload`.
  - Add enforcement + usage increments to `service.tasks.createFromAgent`.
  - Add enforcement + usage increments to `service.documents.createOrUpdateFromAgent`.
  - Add message usage increments to `service.messages.createFromAgent`.
  - Add storage enforcement + increments to `service.messages.registerUploadFromAgent`.
  - Ensure service flows can call usage increment mutations (internal-safe path).
- Tests
  - Add unit tests for billing usage and enforcement helpers.
  - Add integration tests for create/upload flows updating `usageRecords`.
- QA
  - Manually verify UI usage numbers update after each action.
  - Validate enforcement errors at limit boundaries for each resource.
