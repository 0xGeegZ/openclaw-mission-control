# OpenClaw Mission Control SaaS — Core Engineering Instructions (Cursor)

This document is the **foundation** for building the OpenClaw Mission Control SaaS with:
- **Next.js (App Router)** for the web app
- **Convex** for realtime database + server functions
- **shadcn/ui** for UI primitives
- **OpenClaw (formerly Clawdbot)** for agent runtime sessions/tools
- **One runtime server per customer account** (hard requirement)

Use this file as the **core instruction set** for Cursor agents and human engineers.

---

## 0) Assumptions & scope (read first)

**Assumption A (repo layout):** Monorepo with:
- `apps/web` → Next.js app (OpenClaw Mission Control UI)
- `apps/runtime` → Node.js service that runs per-account (agent runtime + notification delivery)
- `packages/ui` → shared shadcn wrappers / design system
- `packages/shared` → shared types, constants, helpers (no server secrets)

If your repo differs, **map paths accordingly** but keep the same separation of concerns:
- Web app = UI + user auth + customer-facing API routes (minimal)
- Convex = database + business logic + authorization
- Runtime = trusted service running on the per-account server

**Assumption B (tenancy model):** Multi-tenant by `accountId` (a.k.a. org/workspace).  
Every Convex record is scoped to exactly one `accountId`.

**Assumption C (auth):** Users authenticate in the web app, then Convex functions enforce membership via `memberships`.

**Hard constraints (non-negotiable):**
- No cross-account data access (ever).
- Agent runtime is isolated per customer account (1 server per account).
- Every "important" event produces an audit trail entry (activities).
- Realtime UI updates must be driven by Convex queries/subscriptions (not polling).

---

## 1) Context & goal

We are building an "OpenClaw Mission Control" dashboard that makes multiple AI agents work like a real team:
- tasks move through a Kanban workflow
- discussions happen in task threads with @mentions and subscriptions
- documents/deliverables are stored and linked to tasks
- a live activity feed provides visibility

On the backend, agents run in OpenClaw sessions on a **per-account runtime server**.  
Agents read work from Convex and write results back to Convex (messages, docs, task updates).

Key constraints:
- TypeScript end-to-end
- secure multi-tenancy + RBAC
- predictable realtime behavior (no inconsistent client state)
- observable runtime operations (logs + health + delivery metrics)

---

## 2) Codebase research summary (how to work in this repo)

Before planning or coding, always do this:

### 2.1 Identify affected areas
- **Frontend:** Next.js routes, components, hooks, UI state
- **Backend:** Convex schema + queries/mutations + auth checks
- **Runtime:** notification delivery, heartbeat scheduler, OpenClaw session messaging
- **Shared:** types/constants for statuses, activity types, notification kinds

### 2.2 Skim and reuse existing patterns
Use project-wide search and symbol navigation to find:
- existing Convex auth guard helpers (e.g. `requireAccountMember`)
- existing mutations that write `activities`
- existing UI patterns for loading/error/empty states
- existing "service-only" functions (runtime-only) and how they authenticate

### 2.3 Never invent patterns if one exists
If the repo already has:
- a `useMutation` wrapper
- a `zod` validation helper
- a `TaskStatus` union type
- an activity logging helper like `logActivity()`

Then **reuse it**. Do not create duplicates.

---

## 3) High-level design (system architecture)

### 3.1 Components
1) **Web App (Next.js)**
- UI for tasks, agents, docs, feed
- user auth + account switching
- calls Convex via client
- does NOT run trusted automation logic

2) **Convex (database + server functions)**
- source of truth for all account data
- authorization enforcement (membership, roles)
- realtime subscriptions for UI
- service-only endpoints for runtime

3) **Per-account Runtime Server**
- runs OpenClaw gateway + sessions
- consumes agent notifications (mentions/subscriptions/assignments)
- performs heartbeats or event-driven delivery
- posts agent outputs back to Convex using a service credential scoped to one account

### 3.2 Primary data flows (must be consistent everywhere)

#### A) Human updates a task
User action → Next.js component → Convex mutation → DB write → activities write → UI updates via subscriptions

#### B) Human comments and mentions an agent
Message submit → Convex mutation:
- create message
- parse mentions
- create notifications for recipients
- auto-subscribe participants
- create activity record
→ UI updates + runtime sees new agent notifications

#### C) Runtime delivers agent notification
Runtime loop → Convex query for undelivered agent notifications → deliver to OpenClaw session → mark delivered → write activity/log

#### D) Agent posts result
Agent (via runtime tool/script) → Convex service mutation:
- create message/doc
- update task status if needed
- create activity
→ UI updates in realtime

---

## 4) Data model invariants (Convex rules you must follow)

### 4.1 Tenancy
**Invariant T1:** Every table includes `accountId`.  
**Invariant T2:** Every query/mutation filters by `accountId` derived from the caller's identity.  
**Invariant T3:** Service-only runtime calls are scoped to exactly one account (service identity includes `accountId` claim).

### 4.2 Authorization
**Invariant A1:** User calls require membership in `memberships`.  
**Invariant A2:** Role-based actions (e.g. provisioning servers, managing members) require `role in ["owner","admin"]`.  
**Invariant A3:** Agents never use user auth. Agents use service auth only.

### 4.3 Audit trail
**Invariant L1:** Any state change of tasks/agents/docs/messages creates an `activities` record.  
**Invariant L2:** Activities are append-only (never edited), except optional redaction policy.

### 4.4 Task workflow
Allowed states (canonical):
- `inbox` → `assigned` → `in_progress` → `review` → `done`
- `blocked` can be entered from `assigned` or `in_progress`, and must include a reason in message/activity.

**Invariant W1:** Status transitions must be validated server-side (Convex mutation).  
**Invariant W2:** A task cannot be `assigned` with zero assignees unless explicitly allowed by product rules (default: not allowed).

### 4.5 Mentions + subscriptions
**Invariant N1:** Mentions generate notifications for recipients.  
**Invariant N2:** Thread subscriptions generate notifications on new messages (excluding author).  
**Invariant N3:** Delivery is at-least-once; processing must be idempotent.

---

## 5) Runtime contract (how runtime must behave)

### 5.1 Runtime responsibilities (per account server)
- boot OpenClaw gateway and agent sessions
- deliver Convex notifications into sessions
- run heartbeats (scheduled) OR event-driven delivery
- expose a minimal health endpoint (local) + periodic check-in to Convex
- write runtime events to activities (online/degraded/offline)

### 5.2 Required runtime capabilities (v1)
- **Notification delivery**
  - Input: `notifications` where `recipientType="agent"` and `deliveredAt` is null
  - Output: message to OpenClaw session + `deliveredAt` set

- **Heartbeat execution**
  - Each agent wakes on schedule
  - Pulls: assigned tasks + unread thread updates + mentions
  - Does: one concrete action, or posts `HEARTBEAT_OK` (configurable)

- **Idempotency**
  - Each notification has stable ID
  - Delivery must tolerate retries (crash-safe)

### 5.3 Service-only Convex functions (recommended set)
These functions must reject user identities and accept only runtime/service identity.

- `service.notifications.listUndeliveredForAccount(accountId, limit)`
- `service.notifications.markDelivered(notificationId)`
- `service.agents.upsertHeartbeat(agentId, status, currentTaskId?)`
- `service.messages.createFromAgent(taskId, content, meta)`
- `service.docs.createOrUpdateFromAgent(taskId?, title, content, type, meta)`
- `service.tasks.updateStatusFromAgent(taskId, nextStatus, meta)`

All inputs must be validated (zod or equivalent) and all writes must log `activities`.

---

## 6) Cursor "Plan Mode" standard (how to write plans)

When the user asks for a feature plan, follow this format exactly.

### 6.1 Plan template (required headings)

#### 1. Context & goal
- What we're building, and why
- Constraints: stack, perf, security, backwards compatibility, UX

#### 2. Codebase research summary
- List exact files inspected with paths
- What existing patterns/components/hooks to reuse

#### 3. High-level design
- Architecture across frontend / convex / runtime
- Main data flows: "action → mutation → db → subscription → UI"
- Exact names of functions/components/types (if they exist)

#### 4. File & module changes
- Existing files to touch (paths)
- New files to create (paths)
- For each file: 1–3 bullets of concrete changes (types, params, new exports)

#### 5. Step-by-step tasks
- Numbered, atomic steps
- Each step = one focused commit
- Mention files/functions/components in each step

#### 6. Edge cases & risks
- Auth, permissions, empty states, race conditions, realtime conflicts
- Mitigation: flags, retries, idempotency, monitoring

#### 7. Testing strategy
- Unit tests (pure logic)
- Integration/E2E (critical flows)
- Manual QA checklist

#### 8. Rollout / migration (if relevant)
- Feature flags, gradual rollout, kill switch
- Data migration or lazy migration
- Observability (logs/metrics)

#### 9. TODO checklist
- Markdown checkboxes grouped by Backend/Frontend/Tests/Infra

### 6.2 Planning rules (non-negotiable)
- Planning mode means: **no code changes**, no big pasted implementations.
- You must be specific enough that 85%+ engineers implement similarly.
- If anything is unclear after research, ask up to 5 short questions **before** writing the plan.

---

## 7) Implementation quality bar (definition of "22/20")

### 7.1 Every feature must include
- server-side validation (Convex mutation/query)
- authorization checks (membership + role)
- audit logging (`activities`)
- proper loading + error + empty states in UI
- idempotency where retries are possible (runtime delivery, webhook-like flows)
- tests: at least unit tests for parsing/validation and one integration path

### 7.2 "No silent failures"
- If runtime can't deliver: record `delivery_failed` activity + keep notification queued
- If mutation rejects: return clear error code + message
- If user lacks permission: explicit forbidden error (not empty data)

### 7.3 Observability requirements
- Runtime must log:
  - delivery attempts + outcomes
  - OpenClaw session send failures
  - heartbeat durations
- Web app must expose:
  - runtime status for the account (online/degraded/offline)
  - last check-in timestamp
- Convex should track:
  - activity stream for runtime events

---

## 8) Detailed "core instructions" for agents (SOUL + AGENTS + HEARTBEAT)

This is the part you copy into your actual agent workspace.

### 8.1 AGENTS.md (operating manual — English, detailed)
Use this as your base — see `docs/runtime/AGENTS.md` in this repo.

### 8.2 HEARTBEAT.md (strict checklist — English, detailed)
See `docs/runtime/HEARTBEAT.md` in this repo.

### 8.3 SOUL template (English, detailed)
See `docs/runtime/SOUL_TEMPLATE.md` in this repo.

---

## 9) References (docs you must keep handy)

### Convex
- Next.js quickstart: https://docs.convex.dev/quickstart/nextjs
- Next.js App Router client patterns: https://docs.convex.dev/client/nextjs/app-router
- Functions (queries/mutations/actions): https://docs.convex.dev/functions
- Schema: https://docs.convex.dev/database/schemas
- Convex Auth (beta): https://docs.convex.dev/auth/convex-auth

### Next.js
- App Router: https://nextjs.org/docs/app
- Route handlers: https://nextjs.org/docs/app/building-your-application/routing/route-handlers

### shadcn/ui
- Next.js installation: https://ui.shadcn.com/docs/installation/next
- Components: https://ui.shadcn.com/docs/components

### OpenClaw
- Getting started: https://docs.openclaw.ai/start/getting-started

### DigitalOcean (Droplet per account)
- doctl droplet create: https://docs.digitalocean.com/reference/doctl/reference/compute/droplet/create/

### Fly.io (strong alternative for "1 app per customer")
- One app per user: https://fly.io/docs/machines/guides-examples/one-app-per-user-why/
- Machines: https://fly.io/docs/machines/

### Docker
- Dockerfile reference: https://docs.docker.com/reference/dockerfile/
- Compose spec: https://docs.docker.com/compose/compose-file/

---

## 10) TODO checklist (how to adopt these instructions)

### Repo adoption
- [ ] Add this file to `docs/concept/` (or `docs/CURSOR_CORE.md`)
- [ ] Use `docs/runtime/AGENTS.md`, `docs/runtime/HEARTBEAT.md`, and `docs/runtime/SOUL_TEMPLATE.md` (already in repo)
- [ ] Add a "Definition of Done" section to your CONTRIBUTING.md
- [ ] Add a `runtime/` README explaining service auth and delivery loop

### Convex invariants
- [ ] Add `accountId` to every table in schema
- [ ] Implement `requireAccountMember()` and use it everywhere
- [ ] Implement activity logging helper and enforce it in code review
- [ ] Add service-only auth enforcement for runtime functions

### Runtime invariants
- [ ] Implement at-least-once delivery + idempotent markDelivered
- [ ] Add check-in + runtime status tracking
- [ ] Add delivery failure activity + retry logic

### Testing + QA
- [ ] Add unit tests for mention parsing + status transitions
- [ ] Add integration test for "comment with mention → notification created → delivered"
- [ ] Add manual QA checklist — see `docs/quality/qa-checklist.md`
