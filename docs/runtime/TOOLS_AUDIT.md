# Agent tools audit — existing, brainstorm, priority

Full audit of runtime/OpenClaw agent tools: what exists, what might be added, and what to do with them, ordered by priority.

---

## 1. Verification: @all and agents

**Conclusion: @all does include agents.**

- **Backend:** `getAllMentions()` in `packages/backend/convex/lib/mentions.ts` returns both workspace members (users) and agents (excluding the author). So when a user posts a message with `@all`, the resolved mention list contains every other user and every agent.
- **Notifications:** `createMentionNotifications()` in `packages/backend/convex/lib/notifications.ts` creates one notification per mention with `recipientType: mention.type` (user or agent). So agents receive mention notifications for @all.
- **User flow:** In `packages/backend/convex/messages.ts` (user message create), `hasAllMention(args.content)` triggers `getAllMentions(ctx, accountId, userId)` and that full list is passed to `createMentionNotifications`. No filtering of agents.

If agents appear not to be “mentioned” by @all, the cause is elsewhere (e.g. model returning no reply, or prompt/UX not making it obvious). The delivery prompt already includes the notification body and the “REQUEST TO RESPOND TO” section with the full message content (which contains “@all”). Optional improvement: when the triggering message contained @all, set the notification body to something like “You were mentioned via @all in task …” so the prompt explicitly states it.

---

## 2. Existing tools (runtime / OpenClaw)

Defined in `apps/runtime/src/tooling/agentTools.ts` (and `taskStatusTool.ts`, `taskUpdateTool.ts`, `taskDeleteTool.ts`). Attached per delivery based on behavior flags and orchestrator role.

| Tool                 | Scope                                  | Purpose                                                                                                                  |
| -------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **task_status**      | All (with task + canModifyTaskStatus)  | Update current task status (in_progress, review, done, blocked). Policy: only reviewers can set done when QA configured. |
| **task_update**      | Same as task_status                    | Update task fields: title, description, priority, labels, assignees, status, dueDate.                                    |
| **task_create**      | When canCreateTasks                    | Create a new task (title required; optional description, priority, labels, status, assigneeSlugs for orchestrator).      |
| **document_upsert**  | When canCreateDocuments                | Create or update a document (deliverable, note, template, reference); optional taskId, documentId.                       |
| **response_request** | When hasTaskContext + canMentionAgents | Request a response from other agents by slug (taskId, recipientSlugs, message). Replaces @mentions for notifying agents. |
| **task_load**        | All (with task)                        | Load full task details with thread summary (title, description, status, blockers, assignees, thread history).            |
| **get_agent_skills** | All                                    | List skills per agent; optional agentId to query one agent.                                                              |
| **task_assign**      | Orchestrator only                      | Assign agents to a task by slug (taskId, assigneeSlugs).                                                                 |
| **task_message**     | Orchestrator only                      | Post a message to another task’s thread (taskId, content).                                                               |
| **task_list**        | Orchestrator only                      | List tasks with optional status, assigneeSlug, limit.                                                                    |
| **task_get**         | Orchestrator only                      | Fetch one task by ID.                                                                                                    |
| **task_thread**      | Orchestrator only                      | Fetch recent thread messages for a task (limit).                                                                         |
| **task_search**      | Orchestrator only                      | Search tasks by title/description/blockers (query, limit).                                                               |
| **task_delete**      | Orchestrator only                      | Archive a task with required reason (soft delete).                                                                       |
| **task_link_pr**     | Orchestrator only                      | Link task to a GitHub PR bidirectionally (taskId, prNumber).                                                             |

HTTP fallbacks are documented in AGENTS.md and seed/USER_TEMPLATE for task_status, task_update, task_create, document, response_request when tools are not offered.

---

## 3. Brainstorm: additional tools (candidates)

| Candidate                                 | Purpose                                                                                          | Rationale                                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **document_list**                         | List documents for account/task with optional filters (type, taskId).                            | Agents need to discover existing docs before creating duplicates or referencing them; today they only have document_upsert. |
| **activity_feed**                         | Read recent activity for a task or account (type, actor, target, limit).                         | Enables “what changed recently” and audit-style context without scraping thread.                                            |
| **task_comment_only** / **thread_ack**    | Post a short thread message without triggering full “reply as agent” flow (e.g. “Ack, will do”). | Reduces noise when agent only needs to acknowledge; could be a lightweight variant of existing message creation.            |
| **file_upload** / **attachment_register** | Upload a file (e.g. screenshot, log) and attach to task thread or document.                      | Matches UI attachment flow; agents could attach evidence to threads or docs.                                                |
| **notification_preferences** (read-only)  | Read account notification preferences (taskUpdates, agentActivity, etc.).                        | Agents could adapt behavior (e.g. avoid pinging users who muted agent activity).                                            |
| **task_bulk_status**                      | Update status for multiple tasks in one call (e.g. “move all my assigned to review”).            | Orchestrator efficiency; lower priority than single-task flow.                                                              |
| **task_subscribe** / **task_unsubscribe** | Subscribe/unsubscribe current agent to a task thread.                                            | Explicit control over thread_update delivery; today subscription is implicit (assignment, mention, response_request).       |
| **user_roster** (read-only)               | List workspace members (id, name, email) for @mention context.                                   | Complements get_agent_skills; agents could know who to @mention.                                                            |
| **repository_info** (read-only)           | Structured read of Repository document (repo path, base branch, worktree rules).                 | Already in prompt as text; tool would allow explicit “get repo config” for tool-only flows.                                 |
| **search_documents**                      | Full-text or metadata search over documents.                                                     | Find relevant docs before creating or referencing.                                                                          |
| **task_merge** / **task_split**           | Merge two tasks or split one into several.                                                       | Advanced workflow; likely out of scope for near term.                                                                       |

---

## 4. Priority order and what we’ll do

Ordered by impact and dependency: core correctness and clarity first, then discovery and UX, then efficiency and advanced features.

| Priority | Item                                                                                                                     | Why                                                                    | Action                                                                                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0**   | Existing tools (task_status, task_update, task_create, document_upsert, response_request, task_load, get_agent_skills)   | Core workflow; already implemented.                                    | Keep; document and test. Ensure AGENTS.md and USER_TEMPLATE stay in sync with `getToolCapabilitiesAndSchemas`.                                                                                                |
| **P0**   | Orchestrator tools (task_assign, task_message, task_list, task_get, task_thread, task_search, task_delete, task_link_pr) | Required for squad lead coordination.                                  | Keep; document. No new tool here.                                                                                                                                                                             |
| **P1**   | **document_list**                                                                                                        | Prevents duplicate docs and enables “reference existing doc” behavior. | Add: Convex query for documents by accountId (optional taskId, type, limit). Expose as tool when canCreateDocuments or hasTaskContext. Implement in runtime, add schema to agentTools, document in AGENTS.md. |
| **P1**   | **activity_feed** (read-only)                                                                                            | Gives agents “what changed” and audit context.                         | Add: Convex query for activities by taskId or accountId (limit, optional type filter). Expose as tool for any agent with task context. Implement in runtime, add schema, document.                            |
| **P2**   | **user_roster** (read-only)                                                                                              | Clear “who can I @mention” for users; complements get_agent_skills.    | Add: Convex query for memberships (account); return safe fields (id, name, email). Expose as tool; document “@mention the user above” and roster in AGENTS.md.                                                |
| **P2**   | **repository_info** (read-only)                                                                                          | Explicit repo/worktree config for tool-only or scripted flows.         | Add: Resolve Repository document for account; return structured fields. Optional if prompt already injects repository context; add if we see agents needing machine-readable repo config.                     |
| **P3**   | **file_upload** / **attachment_register**                                                                                | Parity with UI attachments; evidence in thread.                        | Design: align with existing generateUploadUrl/registerUpload flow; define tool args (taskId, messageId?, filename, contentType). Implement after P1–P2.                                                       |
| **P3**   | **task_comment_only** / **thread_ack**                                                                                   | Short acks without full reply.                                         | Design: either a flag on existing “post message” path or a dedicated lightweight tool; avoid duplicate delivery logic. Defer until we see clear demand (e.g. heartbeat ack).                                  |
| **P4**   | **notification_preferences** (read-only)                                                                                 | Nice-to-have for respectful pinging.                                   | Add only if product wants agents to adapt to user preferences; otherwise defer.                                                                                                                               |
| **P4**   | **search_documents**                                                                                                     | Discovery over documents.                                              | Add after document_list is in place; depends on backend search or list+filter.                                                                                                                                |
| **P5**   | **task_bulk_status**, **task_subscribe** / **task_unsubscribe**, **task_merge** / **task_split**                         | Efficiency or advanced workflow.                                       | Defer; revisit when orchestrator or multi-task workflows demand them.                                                                                                                                         |

---

## 5. Summary

- **@all:** Confirmed in code: @all includes agents; they receive mention notifications. If something “doesn’t seem” to mention agents, the fix is likely in prompt wording or model behavior, not in backend mention resolution.
- **Existing tools:** 15 tools are implemented and gated by behavior flags and orchestrator role; keep them and keep docs (AGENTS.md, USER_TEMPLATE, CHANGELOG) in sync.
- **New tools (priority):**
  - **P1:** document_list, activity_feed — implement next for discovery and audit context.
  - **P2:** user_roster, repository_info — implement for clarity and tool-only flows.
  - **P3:** file_upload, task_comment_only — design then implement when needed.
  - **P4–P5:** notification_preferences, search_documents, bulk/subscribe/merge — defer or add when product demands them.

This doc should be updated when new tools are added or when priority changes (e.g. after user research or support feedback).
