---
name: downloads-and-agent-share
overview: Implement end-to-end document/attachment download across the web app and enable agent-side document sharing tools, building on the existing upload-v2-hardening and agent-task-creation plans.
todos:
  - id: backend_upload_v2
    content: Finish tokenized upload flow + schema updates
    status: pending
  - id: backend_doc_export
    content: Add document export storage + caching
    status: pending
  - id: agent_share_tool
    content: Add service action + runtime endpoint for sharing
    status: pending
  - id: frontend_downloads
    content: Render attachments + doc download UI
    status: pending
  - id: tests_cleanup
    content: Cleanup jobs + tests + QA checklist
    status: pending
isProject: false
---

# Download Links + Agent Sharing Plan

## 1. Context & goal

We need a reliable, end-to-end download experience across the web app (task threads, task documents, documents library) and a runtime tool path for agents to share documents with users.

**Do this first (prerequisite):** Complete the plan `[.cursor/plans/todo/upload-v2-hardening_a9046080.plan.md](.cursor/plans/todo/upload-v2-hardening_a9046080.plan.md)` (tokenized upload flow, schema, MessageInput/MessageItem wiring, MessageAttachments). This plan assumes that upload-v2-hardening is done so attachment storage and UI are in place before adding document export and agent share.

This plan then builds on that attachment flow and the `agent-task-creation` runtime tool patterns, while keeping multi-tenant constraints, strict auth, and server-side validation. Downloads must be backed by storage URLs (not local workspace paths) so links are usable outside the web app (e.g., Telegram). JSDoc should be added for new public functions.

## 2. Codebase research summary

Files inspected and patterns to reuse:

- [apps/web/src/components/tasks/MessageInput.tsx](/Users/guillaumedieudonne/Desktop/mission-control/apps/web/src/components/tasks/MessageInput.tsx) — attachment UI exists but no upload wiring.
- [apps/web/src/components/tasks/MessageItem.tsx](/Users/guillaumedieudonne/Desktop/mission-control/apps/web/src/components/tasks/MessageItem.tsx) — message rendering has no attachment display.
- [apps/web/src/components/tasks/TaskDocuments.tsx](/Users/guillaumedieudonne/Desktop/mission-control/apps/web/src/components/tasks/TaskDocuments.tsx) — links to `/docs/:id` without account slug and no download action.
- [apps/web/src/app/(dashboard)/[accountSlug]/docs/page.tsx](</Users/guillaumedieudonne/Desktop/mission-control/apps/web/src/app/(dashboard)/[accountSlug]/docs/page.tsx>) — document list; upload is disabled; no download/export UI.
- [packages/backend/convex/messages.ts](/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/messages.ts) — upload URL generation, register upload, attachment validation and read-time URL resolution.
- [packages/backend/convex/service/messages.ts](/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/service/messages.ts) — agent-side attachment validation + message creation.
- [packages/backend/convex/service/actions.ts](/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/service/actions.ts) — service-token pattern + register upload from agent.
- [packages/backend/convex/documents.ts](/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/documents.ts) and [packages/backend/convex/schema.ts](/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/schema.ts) — documents are markdown content in Convex.
- [apps/runtime/src/health.ts](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/health.ts) — local-only runtime endpoint pattern (`/agent/task-status`).
- [docs/runtime/AGENTS.md](/Users/guillaumedieudonne/Desktop/mission-control/docs/runtime/AGENTS.md) — operator instructions and tool usage patterns.
- Existing plan docs: [upload-v2-hardening_a9046080.plan.md](/Users/guillaumedieudonne/Desktop/mission-control/.cursor/plans/todo/upload-v2-hardening_a9046080.plan.md) and [agent-task-creation_decf130e.plan.md](/Users/guillaumedieudonne/Desktop/mission-control/.cursor/plans/agent-task-creation_decf130e.plan.md).

Existing patterns to reuse:

- Convex `ctx.storage.generateUploadUrl()` + read-time URL resolution.
- Service actions with `requireServiceAuth()` and internal mutations for agent work.
- Local-only runtime endpoints guarded by `isLocalAddress()` and `x-openclaw-session-key`.

## 3. High-level design

### Architecture summary

- **Web app**: users upload attachments through a tokenized upload flow; attachments render with download links in threads; documents can be exported to storage for direct download.
- **Backend**: extend upload-v2-hardening (tokenized upload + metadata + cleanup); add document export action that writes markdown to storage and returns a URL; optionally cache exports by document version.
- **Runtime**: add a local-only endpoint for agents to request document sharing; this endpoint calls a Convex service action to export the doc and create a message with attachment or return a link.
- **Agent tools**: update `AGENTS.md` to document the new runtime tool for sharing documents and keep behavior flags aligned with the agent-task-creation plan.

### Data flow (key paths)

1. **User attachment upload**

- `MessageInput` → `messages.generateUploadUrl` → upload to Convex storage → `messages.registerUpload` → `messages.create` with attachment metadata → `messages.listByTask` resolves URLs → `MessageItem` renders download link.

1. **Document export/download (web app)**

- Documents UI → `documents.exportForDownload` action → Convex storage → URL returned → browser download.

1. **Agent document share (runtime tool)**

- Agent calls runtime endpoint `/agent/document-share` with doc/task → runtime validates session → Convex service action exports doc + registers upload → creates message from agent with attachment (or returns URL to agent for text reply).

## 4. File & module changes

### Existing files to touch

- [packages/backend/convex/schema.ts](/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/schema.ts)
  - Extend `messageUploads` per upload-v2-hardening (token, expiresAt, contentType, size, originalFileName).
  - Add new `documentExports` table (documentId, accountId, storageId, version, contentType, createdAt).
- [packages/backend/convex/messages.ts](/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/messages.ts)
  - Implement tokenized upload return shape and token validation in `registerUpload`.
  - Enforce upload registration before accepting attachments in `create`.
- [packages/backend/convex/lib/validators.ts](/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/lib/validators.ts)
  - Allow `text/markdown` (or map `.md` to `text/plain`) for exported document attachments.
  - Add upload token validators required by v2 flow.
- [packages/backend/convex/documents.ts](/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/documents.ts)
  - Add `exportForDownload` action/mutation that writes markdown content to storage and returns `{ storageId, url, fileName }`.
  - Optional: reuse or refresh `documentExports` based on `document.version`.
- [packages/backend/convex/service/actions.ts](/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/service/actions.ts)
  - Add service action to export a document for sharing (agent auth + account check).
  - Use `registerMessageUploadFromAgent` then `createMessageFromAgent` to attach export.
- [packages/backend/convex/service/messages.ts](/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/service/messages.ts)
  - If needed, add internal mutation to register document export uploads (agent/system).
- [apps/web/src/components/tasks/MessageInput.tsx](/Users/guillaumedieudonne/Desktop/mission-control/apps/web/src/components/tasks/MessageInput.tsx)
  - Wire the v2 upload flow; track per-file progress/errors; pass attachments to `messages.create`.
- [apps/web/src/components/tasks/MessageItem.tsx](/Users/guillaumedieudonne/Desktop/mission-control/apps/web/src/components/tasks/MessageItem.tsx)
  - Render attachments via a shared component; show download buttons and image previews.
- [apps/web/src/components/tasks/TaskDocuments.tsx](/Users/guillaumedieudonne/Desktop/mission-control/apps/web/src/components/tasks/TaskDocuments.tsx)
  - Fix link to include `accountSlug` and add a quick download action.
- [apps/web/src/app/(dashboard)/[accountSlug]/docs/page.tsx](</Users/guillaumedieudonne/Desktop/mission-control/apps/web/src/app/(dashboard)/[accountSlug]/docs/page.tsx>)
  - Add export/download action on each doc row/card.
- [apps/runtime/src/health.ts](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/health.ts)
  - Add a new local-only runtime endpoint `/agent/document-share` (mirrors `/agent/task-status`).
- [docs/runtime/AGENTS.md](/Users/guillaumedieudonne/Desktop/mission-control/docs/runtime/AGENTS.md)
  - Document the new document-sharing endpoint and usage rules for agents.

### New files to create

- [apps/web/src/components/tasks/MessageAttachments.tsx](/Users/guillaumedieudonne/Desktop/mission-control/apps/web/src/components/tasks/MessageAttachments.tsx)
  - Reusable attachment list UI (download link, size, MIME label, image preview).
- [apps/web/src/app/(dashboard)/[accountSlug]/docs/[docId]/page.tsx](</Users/guillaumedieudonne/Desktop/mission-control/apps/web/src/app/(dashboard)/[accountSlug]/docs/[docId]/page.tsx>)
  - Document detail view with download button and markdown renderer.
- [packages/backend/convex/document_exports.ts](/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/document_exports.ts)
  - Scheduled cleanup for stale exports (if `documentExports` table is added).

## 5. Step-by-step tasks

1. **Finalize remaining upload-v2-hardening backend work**

- Extend `messageUploads` schema and indices.
- Update `messages.generateUploadUrl` to return `{ uploadUrl, uploadToken }` and validate tokens in `registerUpload`.
- Update attachment validation to accept `text/markdown` or map `.md` to a permitted type.

1. **Document export backend**

- Add `documentExports` table and `documents.exportForDownload` action/mutation that:
  - Verifies account membership.
  - Writes a `.md` file to storage using doc content.
  - Reuses cached export if `document.version` unchanged.
  - Returns `url` + `storageId` + `fileName`.

1. **Agent share service action**

- Add a Convex service action to export a document and register it as a message upload for a task.
- Reuse `registerMessageUploadFromAgent` and `createMessageFromAgent` with attachments.

1. **Runtime endpoint for agents**

- Add `/agent/document-share` endpoint in `apps/runtime/src/health.ts`:
  - Validate local-only, session key, agentId, payload (docId, taskId, optional message text).
  - Call the new Convex service action to export + post a message with attachment.

1. **Web app attachment uploads**

- Wire `MessageInput` to the v2 upload flow: generate URL → upload → register → create message.
- Add per-file progress and failure states; surface upload errors in UI.

1. **Web app download surfaces**

- Implement `MessageAttachments` component and render in `MessageItem`.
- Fix `TaskDocuments` link to include `accountSlug` and add a download button.
- Add document detail route for `/[accountSlug]/docs/[docId]` with download button.
- Add download/export action in documents list page.

1. **Agent tool docs + behavior flags (from agent-task-creation)**

- Update `docs/runtime/AGENTS.md` with the new document-share endpoint instructions.
- Ensure behavior flags related to document creation/sharing are exposed in runtime tooling where needed.

1. **Cleanup + tests**

- Add scheduled cleanup for expired uploads and stale exports.
- Add backend tests for tokenized upload + export + agent share action.
- Add manual QA checklist covering downloads in all surfaces and agent share flow.

## 6. Edge cases & risks

- **Token expiry**: upload completes but registration fails; show clear retry UI.
- **Export freshness**: document updated after export; must regenerate if version changed.
- **Auth drift**: ensure accountId checks on every export and share path.
- **Download URL expiry**: Convex URLs may be time-limited; refresh URL on demand.
- **Large files**: enforce size limits and show user-facing errors.
- **Missing content type**: normalize `.md` to a permitted type to avoid blocking downloads.

## 7. Testing strategy

- **Unit tests**: token validation, export caching, validator allowance for markdown.
- **Integration tests**:
  - Upload → register → message create → attachment URL resolution.
  - Export document → download URL returned → message attachment created by agent.
- **Manual QA**:
  - Upload file, see it in thread, download it.
  - Download doc from docs list and doc detail.
  - Agent shares doc in thread; user downloads from message attachment.
  - Verify download URL refresh if link expires.

## 8. Rollout / migration

- Keep legacy attachments readable (existing `url` field).
- Consider feature flag for v2 upload flow (single account rollout first).
- Log export failures + token validation failures for observability.

## 9. TODO checklist

- Backend: extend `messageUploads` schema + indices.
- Backend: tokenized upload flow in `messages.generateUploadUrl`/`registerUpload`.
- Backend: allow markdown content type for attachments.
- Backend: add `documentExports` table and `documents.exportForDownload`.
- Backend: add cleanup for expired uploads and stale exports.
- Backend: service action to export doc + register upload + create agent message.
- Runtime: add `/agent/document-share` endpoint.
- Docs: update `docs/runtime/AGENTS.md` with new tool usage.
- Frontend: wire `MessageInput` upload flow with progress/errors.
- Frontend: add `MessageAttachments` component and render in `MessageItem`.
- Frontend: fix `TaskDocuments` links and add download action.
- Frontend: add docs detail route and download button.
- Frontend: add download action to docs list page.
- Tests: backend unit/integration for upload + export.
- QA: manual checklist for all download surfaces + agent sharing.
