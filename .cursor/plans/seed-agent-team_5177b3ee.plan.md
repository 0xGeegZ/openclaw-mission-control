---
name: seed-agent-team
overview: Extend the Convex seed to create a 3‑agent repo‑maintenance team (PM/Squad lead, Engineer, QA) with role‑specific SOUL content, skills, and in‑app docs for agent setup.
todos:
  - id: update-seed-roster
    content: Adjust seed roster to 3 agents (PM/Engineer/QA)
    status: pending
  - id: seed-skills
    content: Add skills seeding and assign to agents
    status: pending
  - id: seed-docs
    content: Seed AGENTS/HEARTBEAT + tech stack docs
    status: pending
  - id: idempotency-checks
    content: Ensure seed remains idempotent and reports counts
    status: pending
isProject: false
---

# Seed 3‑Agent Team

#### 1. Context & goal

- You are on the right track: the build “orchestrator” in `docs/build/00-orchestrator.md` is for coordinating _build modules_, while runtime teams use a **Squad Lead / PM** role to delegate and review work. The plan below seeds that runtime team into Convex.
- Goal: extend the existing demo seed so it creates a 3‑agent repo‑maintenance team (PM/Squad Lead, Engineer, QA), with role‑specific `soulContent`, assigned skills, and in‑app documents for AGENTS/HEARTBEAT + tech‑stack notes.
- Constraints: keep multi‑tenancy, idempotent seeding, no secrets, reuse existing schema and Convex patterns.

#### 2. Codebase research summary

- Inspected core docs and templates:
  - `[docs/concept/openclaw-mission-control-initial-article.md](docs/concept/openclaw-mission-control-initial-article.md)` — squad lead role + SOUL/AGENTS concepts.
  - `[docs/concept/openclaw-mission-control-cursor-core-instructions.md](docs/concept/openclaw-mission-control-cursor-core-instructions.md)` — runtime contracts + AGENTS/HEARTBEAT/SOUL references.
  - `[docs/build/00-orchestrator.md](docs/build/00-orchestrator.md)` — build orchestration (not runtime agent).
  - `[docs/runtime/AGENTS.md](docs/runtime/AGENTS.md)`, `[docs/runtime/HEARTBEAT.md](docs/runtime/HEARTBEAT.md)`, `[docs/runtime/SOUL_TEMPLATE.md](docs/runtime/SOUL_TEMPLATE.md)` — templates to seed as in‑app docs / SOUL content.
- Inspected Convex backend:
  - `[packages/backend/convex/schema.ts](packages/backend/convex/schema.ts)` — `agents.soulContent`, `skills`, and `documents` schema + indexes.
  - `[packages/backend/convex/seed.ts](packages/backend/convex/seed.ts)` — current demo seed (Jarvis/Vision + tasks/messages).
  - `[packages/backend/convex/agents.ts](packages/backend/convex/agents.ts)` — session key format + default SOUL + OpenClaw config.
  - `[packages/backend/convex/skills.ts](packages/backend/convex/skills.ts)` — skills model and uniqueness by slug.
  - `[packages/backend/convex/documents.ts](packages/backend/convex/documents.ts)` — document requirements and indexes.
- Existing patterns to reuse: `agent:{slug}:{accountId}` session keys, `openclawConfig` shape, and idempotent seeding using indexed queries.

#### 3. High-level design

- Seed flow (single mutation):
  1. Ensure demo account + membership (existing behavior).
  2. Seed skills by slug (idempotent).
  3. Seed documents by title + type (idempotent).
  4. Seed agents by slug (idempotent) with role‑specific SOUL + OpenClaw config.
- Data flow: Convex dashboard → `seed.run` mutation → insert skills/docs/agents → return counts.
- Agent roles:
  - **PM/Squad Lead**: task triage, sprint planning, issue management, approvals.
  - **Engineer**: code changes, architecture updates, doc updates (frontend + backend).
  - **QA**: PR review, test planning, regression checks, quality gates.

**Seed data specification (explicit)**

- **Skills** (all `category: "custom"`, `config: {}`, `isEnabled: true`):
  - `github-issue-triage` — Issue triage and backlog hygiene.
  - `sprint-planning` — Sprint planning, milestones, and priority setting.
  - `release-management` — Release checklists, changelogs, versioning.
  - `repo-architecture` — Repo structure and architectural decisions.
  - `frontend-nextjs` — Next.js App Router + React + shadcn/ui patterns.
  - `backend-convex` — Convex schema, queries, mutations, auth.
  - `pr-review` — PR review for quality, security, regression risks.
  - `test-strategy` — Test planning, coverage strategy, edge cases.
  - `test-automation` — Implement unit/integration/e2e tests.
- **Agents** (use `sessionKey: agent:{slug}:{accountId}`, `status: "offline"`, `heartbeatInterval: 15`):
  - **Squad Lead**
    - `name`: "Squad Lead"
    - `slug`: "squad-lead"
    - `role`: "PM / Squad Lead"
    - `description`: "Owns issue triage, sprint planning, and repo health."
    - `skills`: `github-issue-triage`, `sprint-planning`, `release-management`
    - `behaviorFlags` override: `canCreateTasks: true` (others same as default)
  - **Engineer**
    - `name`: "Engineer"
    - `slug`: "engineer"
    - `role`: "Full-stack Engineer"
    - `description`: "Maintains frontend/back‑end and implements fixes."
    - `skills`: `repo-architecture`, `frontend-nextjs`, `backend-convex`
  - **QA**
    - `name`: "QA"
    - `slug`: "qa"
    - `role`: "QA / Reviewer"
    - `description`: "Reviews PRs and maintains the test suite."
    - `skills`: `pr-review`, `test-strategy`, `test-automation`
- **SOUL content** (embed in `agents.soulContent`, derived from `[docs/runtime/SOUL_TEMPLATE.md](docs/runtime/SOUL_TEMPLATE.md)`):
  - **Squad Lead SOUL**: mission = "keep repo healthy and team aligned", constraints include "always triage issues", "define next steps", "flag blockers", operating procedure includes "create/assign tasks and post sprint updates".
  - **Engineer SOUL**: mission = "implement fixes and keep tech docs current", constraints include "cite files/PRs", "prefer small PRs", "update docs when behavior changes", operating procedure includes "run/describe tests when changing behavior".
  - **QA SOUL**: mission = "protect quality and scale readiness", constraints include "risk‑first review", "call out missing tests", "require repro steps", operating procedure includes "write or request tests and update QA notes".
- **Documents** (all `kind: "file"`, `type: "reference"`, root folder, `authorType: "user"`):
  - "AGENTS.md — Operating Manual" — content copied from `[docs/runtime/AGENTS.md](docs/runtime/AGENTS.md)`.
  - "HEARTBEAT.md — Wake Checklist" — content copied from `[docs/runtime/HEARTBEAT.md](docs/runtime/HEARTBEAT.md)`.
  - "Tech Stack — Frontend" — include: Next.js 16 (App Router), React 19, shadcn/ui, Tailwind v4, UI code location `apps/web`, shared UI `packages/ui`, shared types `packages/shared`.
  - "Tech Stack — Backend" — include: Convex (schema + functions in `packages/backend/convex`), Clerk auth, runtime service (`apps/runtime`), OpenClaw sessions, multi‑tenancy (`accountId` in every table).

#### 4. File & module changes

- **Existing files to touch**:
  - `[packages/backend/convex/seed.ts](packages/backend/convex/seed.ts)`
    - Replace the 2‑agent demo roster with the 3 agents listed above.
    - Add explicit seed arrays: `seedSkills`, `seedAgents`, `seedDocs`.
    - Add helpers to **ensure skills** and **ensure documents** (idempotent by slug/title + type).
    - Add role‑specific SOUL builders derived from `[docs/runtime/SOUL_TEMPLATE.md](docs/runtime/SOUL_TEMPLATE.md)` (one builder per role or a role switch).
    - Update `openclawConfig` per role (assign `skillIds`, set `behaviorFlags` overrides).
    - Update return payload to include counts for skills/docs/agents created and existing.
    - Remove demo task/message creation (seed focuses on team setup).
- **New files to create**: none.

#### 5. Step-by-step tasks

1. **Remove old demo data blocks** in `[packages/backend/convex/seed.ts](packages/backend/convex/seed.ts)`:

- Delete the current Jarvis/Vision creation block.
- Delete the demo tasks/messages creation block.

1. **Define explicit seed arrays** at top‑level in `seed.ts`:

- `seedSkills`: list the 9 skills above with `name`, `slug`, `category: "custom"`, `description`, `config: {}`.
- `seedDocs`: list the 4 documents above with `title`, `type: "reference"`, and `content` (multiline strings).
- `seedAgents`: list the 3 agents above with `name`, `slug`, `role`, `description`, `skillSlugs`, `heartbeatInterval`.

1. **Add role‑specific SOUL builders**:

- Implement `buildSoulContent(role)` (or per‑role functions) using the template from `[docs/runtime/SOUL_TEMPLATE.md](docs/runtime/SOUL_TEMPLATE.md)` and the explicit mission/constraints in Section 3.

1. **Implement `ensureSkill` helper**:

- Query by `by_account_slug` for each skill slug; insert if missing.
- Return a map of `{ [skillSlug]: skillId }`.

1. **Implement `ensureDocs` helper**:

- Query existing docs by `by_account_type` with `type: "reference"`.
- Build a title set; insert missing docs with `authorType: "user"`, `authorId: auth.userId`, `version: 1`, `createdAt/updatedAt`.

1. **Update `seed.run` flow**:

- After account creation, call `ensureSkill` and `ensureDocs`.
- For each agent slug, query by `by_account_slug`; if missing, insert:
  - `sessionKey: agent:{slug}:{accountId}`
  - `soulContent: buildSoulContent(role)`
  - `openclawConfig`: `defaultOpenclawConfig()` + `skillIds` + `behaviorFlags` override for PM.

1. **Update seed return payload**:

- Include counts and existing totals: `skillsCreated`, `skillsExisting`, `docsCreated`, `docsExisting`, `agentsCreated`, `agentsExisting`.

#### 6. Edge cases & risks

- **Idempotency**: create missing skills/docs/agents individually by slug/title, not “only if empty”. This allows partial reruns without duplication.
- **Slug collisions**: if an agent exists with the slug but different role, skip and count as existing (do not patch).
- **Document uniqueness**: match by `title + type`, so “Tech Stack — Frontend” doesn’t duplicate on rerun.
- **Skill assignment**: if a skill exists but `isEnabled` is false, keep it as‑is and report in return payload (do not override).

#### 7. Testing strategy

- Manual via Convex dashboard:
  - Run `seed.run` once → verify 3 agents, 9 skills, and 4 docs exist in the demo account.
  - Run again → verify no duplicates and counts return 0 for created, with existing counts populated.
  - Inspect each agent’s `soulContent` content and `openclawConfig.skillIds` mapping.
  - Verify docs render in Documents UI with expected titles and content.

#### 8. Rollout / migration (if relevant)

- No migrations required; this is a demo seed change only.
- Note in release notes that demo data now focuses on team setup instead of sample tasks/messages.

#### 9. TODO checklist

- **Backend**
  - Update `[packages/backend/convex/seed.ts](packages/backend/convex/seed.ts)` with explicit `seedSkills`, `seedAgents`, `seedDocs` constants.
  - Implement `ensureSkill` and `ensureDocs` helpers (idempotent by slug/title).
  - Implement role‑specific `buildSoulContent` for PM, Engineer, QA.
  - Replace old Jarvis/Vision + tasks/messages seed blocks.
  - Update seed return payload with created/existing counts.
- **QA**
  - Run `seed.run` twice and verify idempotency.
  - Verify seeded docs render in the Documents UI.
  - Verify agent roster shows 3 agents with roles and offline status.
