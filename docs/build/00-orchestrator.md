# Mission Control — Build Orchestrator

> **Master orchestration guide for building Mission Control SaaS using parallel Cursor agents.**
> 
> **THIS IS THE SINGLE SOURCE OF TRUTH FOR BUILD COORDINATION.**

---

## CRITICAL: Context for All Agents

**Before starting ANY module, every agent MUST read these documents:**

1. **`docs/mission-control-initial-article.md`** — Original concept from Bhanu Teja P's article
2. **`docs/mission-control-cursor-core-instructions.md`** — Core engineering instructions and invariants
3. **`.cursor/rules/`** — Project coding standards (ALL rules apply)

**The vision:** AI agents that behave like a **real team** — with roles, persistent context, tracked tasks, and observable collaboration. OpenClaw (Clawdbot) is the **core runtime** for everything we're building.

---

## Overview

Mission Control is a multi-agent coordination dashboard built on top of **OpenClaw (Clawdbot)**. The core premise:

- **OpenClaw** provides the agent runtime (sessions, gateway, cron/heartbeat)
- **Mission Control** provides the shared brain (tasks, threads, docs, activity feed)
- **Per-account runtime servers** run OpenClaw instances for each customer

This document orchestrates **13 implementation modules** across **4 phases**, designed for **4-5 parallel agents** at any time.

**Each phase ends with a reviewer agent that validates completion before proceeding.**

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Mission Control SaaS                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐    │
│   │   Web App   │    │   Convex    │    │  Per-Account        │    │
│   │  (Next.js)  │◄──►│  (Backend)  │◄──►│  Runtime Server     │    │
│   │             │    │             │    │  (OpenClaw/Docker)  │    │
│   └─────────────┘    └─────────────┘    └─────────────────────┘    │
│         │                  │                      │                 │
│         │                  │                      │                 │
│   - Dashboard UI     - Schema/DB            - OpenClaw Gateway      │
│   - Kanban Board     - Auth/Tenancy         - Agent Sessions        │
│   - Task Threads     - Business Logic       - Notification Delivery │
│   - Agent Roster     - Real-time Subs       - Heartbeat Scheduler   │
│   - Activity Feed    - Service APIs         - Memory/Workspace      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack (Locked In)

| Layer | Technology | Notes |
|-------|------------|-------|
| Node.js | **Node 24** (via nvm) | Required for all development |
| Package Manager | **npm** | npm ci for CI, npm install locally |
| Frontend | Next.js 16 + React 19 | App Router, TypeScript strict |
| UI Components | shadcn/ui + Tailwind CSS v4 | Radix primitives, lucide-react icons |
| Backend | Convex | Real-time DB, server functions, auth |
| Authentication | Clerk | Via @clerk/nextjs |
| Agent Runtime | OpenClaw (Clawdbot) | Sessions, gateway, cron jobs |
| Runtime Servers | DigitalOcean Droplets | One per customer account |
| Monorepo | Turborepo | Shared packages between web/native |

---

## Prerequisites for All Agents

**Before running ANY module, ensure:**

```bash
# 1. Install/use nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc  # or ~/.zshrc

# 2. Install and use Node 24
nvm install 24
nvm use 24

# 3. Verify versions
node -v  # Should be v24.x.x
npm -v   # Should be v10.x.x

# 4. Use .nvmrc if present
# (Module 01 will create this)
nvm use
```

**Agent requirement**: Every agent must run `nvm use 24` at the start of their session.

---

## Phase Overview & Dependencies

```
Phase 1: Foundation (Sequential)
├── 01-project-setup ──────────────────────┐
└── 02-convex-schema ──────────────────────┼──► Phase 1 Review
                                           │
Phase 2: Core Backend (4 Parallel Agents) ─┘
├── 03-auth-tenancy ───────────────────────┐
├── 04-tasks-module ───────────────────────┤
├── 05-agents-module ──────────────────────┼──► Phase 2 Review
└── 06-documents-module ───────────────────┘
                                           │
Phase 3: Communication + UI Shell ─────────┘
├── 07-messages-mentions ──────────────────┐
├── 08-activities-notifications ───────────┼──► Phase 3 Review
└── 09-ui-layout-navigation ───────────────┘
                                           │
Phase 4: Feature UI + Runtime ─────────────┘
├── 10-ui-kanban-board ────────────────────┐
├── 11-ui-task-detail ─────────────────────┤
├── 12-ui-agents-activity ─────────────────┼──► Phase 4 Review
└── 13-runtime-service ────────────────────┘
```

---

## Dependency Graph (Detailed)

```
01-project-setup
      │
      ▼
02-convex-schema
      │
      ├──────────┬──────────┬──────────┐
      ▼          ▼          ▼          ▼
03-auth     04-tasks   05-agents  06-documents
      │          │          │          │
      │          │          └──────────┘
      │          │                │
      ▼          ▼                │
08-activities  07-messages        │
      │          │                │
      └────┬─────┴────────────────┘
           │
           ▼
     09-ui-layout
           │
      ┌────┴────┬─────────────┐
      ▼         ▼             ▼
10-kanban  11-task-detail  12-agents-activity
      │         │             │
      └─────────┴──────┬──────┘
                       │
                       ▼
              13-runtime-service
```

---

## Running Agents with Cursor CLI

### Prerequisites

1. **Cursor IDE** with agent mode enabled
2. **Terminal access** for parallel agent sessions
3. **Git** for version control between phases
4. **Convex CLI** running (`npx convex dev`)

### Agent Invocation Pattern

Each module has its own instruction file. To run an agent:

```bash
# Single agent (in Cursor terminal or external terminal)
cursor agent --file docs/build/phase-X-name/XX-module-name.md

# Or use Cursor's chat with @ reference
# In Cursor chat: @docs/build/phase-1-foundation/01-project-setup.md implement this
```

### Parallel Execution (Phase 2 Example)

Open 4 terminal tabs/windows:

```bash
# Terminal 1
cursor agent --file docs/build/phase-2-backend/03-auth-tenancy.md

# Terminal 2
cursor agent --file docs/build/phase-2-backend/04-tasks-module.md

# Terminal 3
cursor agent --file docs/build/phase-2-backend/05-agents-module.md

# Terminal 4
cursor agent --file docs/build/phase-2-backend/06-documents-module.md
```

### Using Cursor Chat for Orchestration

In Cursor, you can use the chat to coordinate:

```
@docs/build/phase-2-backend/03-auth-tenancy.md 
@docs/build/phase-2-backend/04-tasks-module.md
@docs/build/phase-2-backend/05-agents-module.md
@docs/build/phase-2-backend/06-documents-module.md

Run these 4 modules in parallel. Each module should work independently.
Commit after each module completes successfully.
```

---

## Phase Execution Protocol

### Before Each Phase

1. **Ensure previous phase is complete** (reviewer passed)
2. **Pull latest changes** if multiple developers
3. **Verify Convex is running** (`npx convex dev`)
4. **Check for lint errors** in affected areas

### During Each Phase

1. **Run parallel agents** according to dependency graph
2. **Each agent commits** after completing its module
3. **Monitor for conflicts** (especially in schema.ts, types)
4. **Resolve conflicts immediately** before continuing

### After Each Phase

1. **Run the phase reviewer agent**
2. **Fix any issues** identified by reviewer
3. **Run full type check**: `npm run typecheck`
4. **Run tests**: `npm test` (if applicable)
5. **Create git tag**: `git tag phase-X-complete`

---

## Reviewer Agent Protocol

Each phase has a reviewer module (e.g., `phase-1-review.md`). The reviewer:

### Responsibilities

1. **Type checking** - Run `tsc --noEmit` and fix errors
2. **Lint checking** - Run `npm run lint` and fix errors
3. **Integration testing** - Verify modules work together
4. **Schema validation** - Ensure Convex schema is consistent
5. **UI smoke test** - Verify pages render without errors
6. **Documentation check** - Ensure JSDoc is present on exports

### Reviewer Output

The reviewer must produce a report:

```markdown
## Phase X Review Report

### Type Check
- [ ] Pass / [ ] Fail (X errors)

### Lint Check  
- [ ] Pass / [ ] Fail (X warnings, Y errors)

### Integration Tests
- [ ] Module A + B integration: Pass/Fail
- [ ] Module C + D integration: Pass/Fail

### Manual Verification
- [ ] Page X renders correctly
- [ ] Feature Y works end-to-end

### Issues Found
1. Issue description + file + fix applied

### Ready for Next Phase
- [ ] YES / [ ] NO (requires: ...)
```

---

## File Naming Conventions

All module plans follow this structure:

```
docs/build/
├── 00-orchestrator.md                    # This file
├── phase-1-foundation/
│   ├── 01-project-setup.md               # Module plan
│   ├── 02-convex-schema.md               # Module plan
│   └── phase-1-review.md                 # Reviewer instructions
├── phase-2-backend/
│   ├── 03-auth-tenancy.md
│   ├── 04-tasks-module.md
│   ├── 05-agents-module.md
│   ├── 06-documents-module.md
│   └── phase-2-review.md
├── phase-3-communication/
│   ├── 07-messages-mentions.md
│   ├── 08-activities-notifications.md
│   ├── 09-ui-layout-navigation.md
│   └── phase-3-review.md
├── phase-4-features/
│   ├── 10-ui-kanban-board.md
│   ├── 11-ui-task-detail.md
│   ├── 12-ui-agents-activity.md
│   ├── 13-runtime-service.md
│   └── phase-4-review.md
```

---

## Monorepo Structure (Target State)

After setup, the repo will look like:

```
mission-control/
├── apps/
│   ├── web/                      # Next.js web app
│   │   ├── app/
│   │   │   ├── (auth)/           # Auth pages (sign-in, sign-up)
│   │   │   ├── (dashboard)/      # Protected dashboard routes
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx      # Dashboard home
│   │   │   │   ├── tasks/        # Kanban board
│   │   │   │   ├── tasks/[id]/   # Task detail
│   │   │   │   ├── agents/       # Agent roster
│   │   │   │   ├── docs/         # Documents
│   │   │   │   └── settings/     # Account settings
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx          # Landing page
│   │   ├── components/           # App-specific components
│   │   ├── lib/                  # App-specific utilities
│   │   └── middleware.ts         # Clerk middleware
│   │
│   ├── native/                   # React Native app (v2, placeholder)
│   │
│   └── runtime/                  # Per-account runtime service
│       ├── src/
│       │   ├── gateway.ts        # OpenClaw gateway manager
│       │   ├── delivery.ts       # Notification delivery loop
│       │   ├── heartbeat.ts      # Agent heartbeat scheduler
│       │   └── health.ts         # Health check endpoint
│       ├── Dockerfile
│       └── package.json
│
├── packages/
│   ├── backend/                  # Convex backend
│   │   └── convex/
│   │       ├── schema.ts         # Database schema
│   │       ├── auth.ts           # Auth utilities
│   │       ├── accounts.ts       # Account management
│   │       ├── memberships.ts    # Membership management
│   │       ├── tasks.ts          # Task CRUD + workflow
│   │       ├── agents.ts         # Agent management
│   │       ├── messages.ts       # Messages + mentions
│   │       ├── documents.ts      # Document management
│   │       ├── activities.ts     # Activity logging
│   │       ├── notifications.ts  # Notification system
│   │       ├── subscriptions.ts  # Thread subscriptions
│   │       └── service/          # Service-only functions (runtime)
│   │           ├── notifications.ts
│   │           ├── agents.ts
│   │           └── tasks.ts
│   │
│   ├── ui/                       # Shared UI components (shadcn)
│   │   └── src/
│   │       ├── components/       # shadcn components
│   │       ├── hooks/            # Shared hooks
│   │       ├── lib/              # Utilities (cn, etc.)
│   │       └── styles/           # Global CSS
│   │
│   └── shared/                   # Shared types/constants
│       └── src/
│           ├── types/            # Shared TypeScript types
│           │   ├── task.ts
│           │   ├── agent.ts
│           │   ├── notification.ts
│           │   └── activity.ts
│           └── constants/        # Shared constants
│               ├── task-status.ts
│               └── agent-status.ts
│
├── docs/
│   ├── build/                    # Build plans (this folder)
│   ├── AGENTS.md                 # Agent operating manual
│   ├── HEARTBEAT.md              # Heartbeat protocol
│   └── SOUL_TEMPLATE.md          # Agent soul template
│
├── turbo.json
├── package.json
└── README.md
```

---

## Key Convex Schema Tables

Reference for all modules:

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `accounts` | Multi-tenant accounts | `name`, `slug`, `plan`, `runtimeStatus` |
| `memberships` | User-account relationships | `userId`, `accountId`, `role` |
| `agents` | AI agent definitions | `accountId`, `name`, `role`, `sessionKey`, `status` |
| `tasks` | Kanban tasks | `accountId`, `title`, `status`, `assignees` |
| `messages` | Task thread comments | `taskId`, `authorId`, `content`, `mentions` |
| `documents` | Markdown deliverables | `accountId`, `taskId?`, `title`, `content`, `type` |
| `activities` | Audit trail | `accountId`, `type`, `actorId`, `targetId`, `meta` |
| `notifications` | Delivery queue | `accountId`, `recipientId`, `recipientType`, `type` |
| `subscriptions` | Thread subscriptions | `taskId`, `subscriberId`, `subscriberType` |

---

## OpenClaw Integration Points

### What OpenClaw Provides

- **Gateway**: Always-on daemon that routes messages to sessions
- **Sessions**: Persistent conversation contexts with unique keys
- **Cron/Heartbeat**: Scheduled wake-ups for agents
- **Workspace**: File-based persistence for agent memory

### Integration Flow

```
1. Customer signs up → Account created in Convex
2. Admin provisions runtime → DigitalOcean droplet created
3. Runtime boots → OpenClaw gateway starts
4. Agents defined → Sessions created with session keys
5. Heartbeats scheduled → Cron jobs registered
6. Agent wakes → Queries Convex for work → Acts → Posts results to Convex
```

### Session Key Convention

```
agent:{agent-slug}:{account-id}

Examples:
- agent:squad-lead:acc_123
- agent:product-analyst:acc_123
- agent:seo-specialist:acc_123
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Type errors in Convex | Schema not synced | Restart `npx convex dev` |
| Parallel agents conflict | Same file modified | Resolve conflict, re-run failed agent |
| Missing imports | Module not completed | Check dependency, run prerequisite |
| Auth errors | Clerk not configured | Check environment variables |
| UI not updating | Subscription not working | Verify `useQuery` hook usage |

### Debug Commands

```bash
# Check Convex status
npx convex dashboard

# Check types
npm run typecheck

# Check lints
npm run lint

# Restart Convex
npx convex dev --once && npx convex dev
```

---

## Success Criteria (Definition of Done)

### Phase Complete When

1. **All modules pass type check** (`tsc --noEmit`)
2. **All modules pass lint** (`npm run lint`)
3. **Reviewer agent approves** (all checks pass)
4. **Manual smoke test passes** (UI loads, features work)
5. **Git tagged** (e.g., `phase-2-complete`)

### Project Complete When

1. **All 4 phases complete**
2. **End-to-end flow works**:
   - User signs up → Account created
   - Admin defines agents → Agents appear in roster
   - Task created → Appears on Kanban
   - Comment with @mention → Notification created
   - Runtime running → Notification delivered to agent
   - Agent responds → Message appears in thread
3. **Documentation complete** (README, AGENTS.md, HEARTBEAT.md)
4. **Basic tests pass** (unit + integration)

---

## COMPLETE EXECUTION GUIDE (For Orchestrator Agent)

**This section provides step-by-step instructions for an orchestrator agent to manage the entire build process.**

### Prerequisites Checklist

Before starting, ensure:

```bash
# 1. Node.js 20+ installed
node -v  # Should be v24.x.x

# 2. npm installed (comes with Node)
npm -v  # Should be v10.x.x

# 3. Git configured
git status  # Should show clean or tracked changes

# 4. Convex CLI available
npx convex --version

# 5. Clerk account ready (for auth setup)
# Have CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY ready
```

---

### Phase 1: Foundation (Sequential)

**Duration estimate:** 1-2 hours  
**Agents:** 1 (sequential)

#### Step 1.1: Run Module 01 (Project Setup)

```bash
# Give this instruction file to an agent:
# docs/build/phase-1-foundation/01-project-setup.md

# The agent will:
# - Clone the Convex monorepo template
# - Configure packages/ui, packages/shared, apps/runtime
# - Set up path aliases and dependencies
# - Install shadcn/ui base components

# Verify completion:
npm install && npm run typecheck && npm run dev
```

#### Step 1.2: Run Module 02 (Convex Schema)

```bash
# Give this instruction file to an agent:
# docs/build/phase-1-foundation/02-convex-schema.md

# The agent will:
# - Create complete schema.ts with 9 tables
# - Add all indexes
# - Create validators.ts
# - Run convex dev to generate types

# Verify completion:
cd packages/backend && npx convex dev --once
npm run typecheck
```

#### Step 1.3: Run Phase 1 Review

```bash
# Give this instruction file to an agent:
# docs/build/phase-1-foundation/phase-1-review.md

# The reviewer will:
# - Verify all files exist
# - Run type check
# - Run dev server
# - Create git tag: phase-1-complete
```

#### Phase 1 Success Gate

```bash
# All must pass before Phase 2:
git tag | grep phase-1-complete  # Tag exists
npm run typecheck                # No errors
npm run dev                      # Server starts
```

---

### Phase 2: Core Backend (4 Parallel Agents)

**Duration estimate:** 2-3 hours  
**Agents:** 4 (parallel)

#### Step 2.1: Launch 4 Agents Simultaneously

**Agent A — Auth & Tenancy:**
```
docs/build/phase-2-backend/03-auth-tenancy.md
```

**Agent B — Tasks Module:**
```
docs/build/phase-2-backend/04-tasks-module.md
```

**Agent C — Agents Module:**
```
docs/build/phase-2-backend/05-agents-module.md
```

**Agent D — Documents Module:**
```
docs/build/phase-2-backend/06-documents-module.md
```

#### Step 2.2: Monitor for Completion

Each agent should:
1. Create the specified files
2. Run `npx convex dev` to verify
3. Run `npm run typecheck`
4. Commit with descriptive message

#### Step 2.3: Resolve Conflicts (if any)

If agents modify the same file (unlikely in Phase 2):
```bash
git status                        # Check for conflicts
git diff                          # Review changes
# Manually merge if needed
```

#### Step 2.4: Run Phase 2 Review

```bash
# Give this instruction file to an agent:
# docs/build/phase-2-backend/phase-2-review.md

# The reviewer will:
# - Verify all backend modules work
# - Test auth guards
# - Test task workflow
# - Create git tag: phase-2-complete
```

#### Phase 2 Success Gate

```bash
git tag | grep phase-2-complete
npm run typecheck
# Test via Convex dashboard: create account, task, agent
```

---

### Phase 3: Communication + UI Shell (3 Parallel Agents)

**Duration estimate:** 2-3 hours  
**Agents:** 3 (parallel)

#### Step 3.1: Launch 3 Agents Simultaneously

**Agent A — Messages & Mentions:**
```
docs/build/phase-3-communication/07-messages-mentions.md
```

**Agent B — Activities & Notifications:**
```
docs/build/phase-3-communication/08-activities-notifications.md
```

**Agent C — UI Layout & Navigation:**
```
docs/build/phase-3-communication/09-ui-layout-navigation.md
```

#### Step 3.2: Run Phase 3 Review

```bash
# docs/build/phase-3-communication/phase-3-review.md
```

#### Phase 3 Success Gate

```bash
git tag | grep phase-3-complete
npm run typecheck
npm run dev  # UI should render with sidebar
```

---

### Phase 4: Feature UI + Runtime (4 Parallel Agents)

**Duration estimate:** 3-4 hours  
**Agents:** 4 (parallel)

#### Step 4.1: Launch 4 Agents Simultaneously

**Agent A — Kanban Board:**
```
docs/build/phase-4-features/10-ui-kanban-board.md
```

**Agent B — Task Detail:**
```
docs/build/phase-4-features/11-ui-task-detail.md
```

**Agent C — Agents & Activity:**
```
docs/build/phase-4-features/12-ui-agents-activity.md
```

**Agent D — Runtime Service:**
```
docs/build/phase-4-features/13-runtime-service.md
```

#### Step 4.2: Run Phase 4 Review (Final)

```bash
# docs/build/phase-4-features/phase-4-review.md
```

#### Phase 4 Success Gate (Project Complete)

```bash
git tag | grep phase-4-complete
git tag | grep v1.0.0
npm run typecheck
npm run build  # Full build succeeds
```

---

### Post-Build Validation

After all phases complete, run this E2E checklist:

```markdown
## E2E Validation Checklist

### Authentication
- [ ] Can sign up with Clerk
- [ ] Can sign in
- [ ] Can sign out

### Account Management
- [ ] Can create account
- [ ] Account appears in switcher
- [ ] Can switch accounts

### Tasks (Kanban)
- [ ] Kanban board renders
- [ ] Can create task (appears in inbox)
- [ ] Can drag task between columns
- [ ] Invalid transitions show error

### Task Detail
- [ ] Task detail page loads
- [ ] Can post message
- [ ] Mention autocomplete works
- [ ] Thread updates in real-time

### Agents
- [ ] Agent roster renders
- [ ] Can create agent
- [ ] Agent status displays

### Activity Feed
- [ ] Feed shows recent activities
- [ ] Updates in real-time

### Notifications
- [ ] Badge shows unread count
- [ ] Can mark as read
```

---

### Quick Reference Commands

```bash
# Install dependencies
npm install

# Start Convex
cd packages/backend && npx convex dev

# Start web app
npm run dev

# Type check all packages
npm run typecheck

# Build for production
npm run build

# Create git tag
git tag -a phase-X-complete -m "Phase X complete"

# Push tags
git push origin --tags
```

---

### Commit Convention

All commits should follow this format:

```bash
git commit -m "feat(module-name): brief description

- Specific change 1
- Specific change 2
"

# Examples:
git commit -m "feat(schema): define complete Mission Control database schema"
git commit -m "feat(auth): implement authentication guards and tenancy"
git commit -m "feat(tasks): add Kanban board with drag-drop"
```

---

### CI/CD Setup (GitHub Actions)

Module 01 creates the CI/CD pipelines. After setup, configure these GitHub secrets:

**Repository Secrets (Settings > Secrets and variables > Actions):**

| Secret | Description | Where to Get |
|--------|-------------|--------------|
| `CONVEX_DEPLOY_KEY` | Convex deployment key | Convex Dashboard > Settings > Deploy Key |
| `VERCEL_TOKEN` | Vercel API token | Vercel Dashboard > Settings > Tokens |
| `VERCEL_ORG_ID` | Vercel organization ID | Vercel Dashboard > Settings > General |
| `VERCEL_PROJECT_ID` | Vercel project ID | Vercel Project > Settings > General |

**Repository Variables (Settings > Secrets and variables > Actions > Variables):**

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_CONVEX_URL` | Your Convex deployment URL |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |

**CI Pipeline** (`.github/workflows/ci.yml`):
- Runs on every push and PR to `main` and `develop`
- Lint → Typecheck → Build
- Blocks merge if any step fails

**CD Pipeline** (`.github/workflows/deploy.yml`):
- Runs on push to `main` only
- Deploys Convex backend first
- Then deploys Next.js to Vercel
- Requires environment secrets configured

---

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Type errors after schema change | `npx convex dev --once` to regenerate |
| Module not found | Check `tsconfig.json` paths |
| Convex functions not working | Check `convex/` folder exists |
| Clerk auth failing | Verify environment variables |
| shadcn component missing | `npx shadcn@latest add [component]` |
| CI failing on build | Check SKIP_CONVEX_TYPEGEN is set |
| CD failing on deploy | Verify GitHub secrets are configured |

---

## Reference Documentation

- **Convex Docs**: https://docs.convex.dev
- **Clerk Docs**: https://clerk.com/docs
- **shadcn/ui Docs**: https://ui.shadcn.com
- **OpenClaw Docs**: https://docs.openclaw.ai
- **Next.js Docs**: https://nextjs.org/docs
- **Turborepo Docs**: https://turbo.build/repo/docs

---

## Summary: Orchestrator Checklist

```markdown
## Orchestrator Execution Checklist

### Phase 1: Foundation
- [ ] Run 01-project-setup.md
- [ ] Run 02-convex-schema.md
- [ ] Run phase-1-review.md
- [ ] Verify: phase-1-complete tag exists

### Phase 2: Core Backend (4 parallel)
- [ ] Launch 03-auth-tenancy.md
- [ ] Launch 04-tasks-module.md
- [ ] Launch 05-agents-module.md
- [ ] Launch 06-documents-module.md
- [ ] Wait for all to complete
- [ ] Run phase-2-review.md
- [ ] Verify: phase-2-complete tag exists

### Phase 3: Communication (3 parallel)
- [ ] Launch 07-messages-mentions.md
- [ ] Launch 08-activities-notifications.md
- [ ] Launch 09-ui-layout-navigation.md
- [ ] Wait for all to complete
- [ ] Run phase-3-review.md
- [ ] Verify: phase-3-complete tag exists

### Phase 4: Features + Runtime (4 parallel)
- [ ] Launch 10-ui-kanban-board.md
- [ ] Launch 11-ui-task-detail.md
- [ ] Launch 12-ui-agents-activity.md
- [ ] Launch 13-runtime-service.md
- [ ] Wait for all to complete
- [ ] Run phase-4-review.md
- [ ] Verify: phase-4-complete tag exists
- [ ] Verify: v1.0.0 tag exists

### Final
- [ ] Run E2E validation checklist
- [ ] All tests pass
- [ ] Ready for deployment
```

---

## v2 Roadmap Documents

After v1 is complete, these roadmap documents describe planned features:

| Document | Description |
|----------|-------------|
| `docs/roadmap/runtime-version-management-v2.md` | Automated fleet upgrades, canary deployments, admin UI |

These are **not part of v1** but provide context for future development.

---

*This orchestrator document is the single source of truth for build coordination. Give it to an orchestrator agent to manage the entire build process autonomously.*
