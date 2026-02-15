---
"web-app": major
---

**V1 — OpenClaw Mission Control Web App (Dashboard)**

First stable release of the main product UI: a multi-account dashboard for coordinating AI agents, tasks, and documents with real-time sync.

**Stack and auth**

- Next.js 16 (App Router), React 19, TypeScript. Real-time data via Convex (`useQuery`); auth via Clerk (sign-in, sign-up). Multi-tenant: all routes are account-scoped by `[accountSlug]`; `AccountProvider` and `useAccount` expose current account and membership; `AccountSwitcher` and new-account flow for creating/joining workspaces.

**Core dashboard**

- **Tasks** — Kanban board with columns for inbox, assigned, in progress, review, done, blocked; drag-and-drop (dnd-kit). Task detail sheet: thread (messages, mentions, agent replies), documents tab, activity timeline, status select, assignees, priority/labels/due date, delete/archive. Create/edit task dialogs; slash commands in message input; subscription and “blocked” reason handling.
- **Agents** — Roster of AI agents with status (online, busy, offline, error). Create/edit/delete agent; agent status dialog; optional orchestrator agent in account settings. Agents sidebar on tasks for quick assignee and context.
- **Documents** — List with type filter; create document; link to task; open in doc viewer. Document redirect and doc-by-id routes for shared links.
- **Activity feed** — Audit trail of account actions (task/agent/doc changes, membership) with type filter (all, task_created, status_changed, etc.).
- **Search** — Global search across tasks, documents, and agents (min 2 chars); results grouped by category with links.
- **Analytics** — Time-range filter; task status distribution (bar/pie); agent status distribution; task completion over time (line); uses shared constants and Recharts.

**Navigation and layout**

- Sidebar: Tasks, Agents, Documents, Activity, Search, Analytics (with icons and descriptions). Admin section (OpenClaw, Fleet, Members, Skills) visible to admins only. Mobile nav for small screens. Theme switcher (light/dark/system); sync with account theme. Notification bell with unread count and list. Orchestrator chat (floating) for the configured orchestrator agent.

**Admin (role-gated)**

- **OpenClaw** — Configuration and status for the OpenClaw gateway used by the runtime.
- **Fleet** — Container orchestration dashboard: runtime status per account (running, upgrading, error, etc.), request restart, request upgrade (target OpenClaw/runtime version, strategy: immediate/rolling/canary), clear upgrade request, rollback runtime. Network isolation verification and lifecycle controls; real-time status from Convex.
- **Members** — List members with roles (owner, admin, member); invite by email (Convex invitations); change role; remove member.
- **Skills** — List seed skills by category; enable/disable; create/edit skill (name, category, content); sync with Convex seed skills.

**Settings and account**

- **Settings** — Account name, slug; theme preference; notification preferences; billing placeholder; danger zone (leave account, delete account). Avatar and user menu via Clerk.
- **Profile** — User profile page within the account context.
- **Invite flow** — `/invite/[token]`: accept invitation (query by token, accept mutation, redirect to account).
- **New account** — Create new workspace; redirect to its slug.

**Technical**

- Convex client provider; server and client components; dynamic imports for ThemeSwitcher and SidebarUserButton to avoid hydration mismatch. Shared UI from `@packages/ui`; shared types and constants from `@packages/shared`; backend API from `@packages/backend/convex`. Error boundaries and not-found; dashboard and splash layouts; middleware for auth. Markdown rendering in task and doc content.

This release marks the web app as production-ready for the first stable deployment (1.0.0).
