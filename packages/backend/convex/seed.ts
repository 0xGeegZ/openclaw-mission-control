import { mutation, internalMutation } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const DEMO_SLUG = "demo";
const DEMO_NAME = "Demo";

/** Seed skills: custom category, empty config, enabled. */
const seedSkills = [
  {
    name: "GitHub issue triage",
    slug: "github-issue-triage",
    description: "Issue triage and backlog hygiene.",
  },
  {
    name: "Sprint planning",
    slug: "sprint-planning",
    description: "Sprint planning, milestones, and priority setting.",
  },
  {
    name: "Release management",
    slug: "release-management",
    description: "Release checklists, changelogs, versioning.",
  },
  {
    name: "Repo architecture",
    slug: "repo-architecture",
    description: "Repo structure and architectural decisions.",
  },
  {
    name: "Frontend Next.js",
    slug: "frontend-nextjs",
    description: "Next.js App Router + React + shadcn/ui patterns.",
  },
  {
    name: "Backend Convex",
    slug: "backend-convex",
    description: "Convex schema, queries, mutations, auth.",
  },
  {
    name: "PR review",
    slug: "pr-review",
    description: "PR review for quality, security, regression risks.",
  },
  {
    name: "Test strategy",
    slug: "test-strategy",
    description: "Test planning, coverage strategy, edge cases.",
  },
  {
    name: "Test automation",
    slug: "test-automation",
    description: "Implement unit/integration/e2e tests.",
  },
] as const;

/** Seed agents: name, slug, role, agentRole (for SOUL), description, skill slugs, heartbeat interval. */
const seedAgents = [
  {
    name: "Squad Lead",
    slug: "squad-lead",
    role: "PM / Squad Lead",
    agentRole: "squad-lead" as const,
    description: "Owns issue triage, sprint planning, and repo health.",
    skillSlugs: [
      "github-issue-triage",
      "sprint-planning",
      "release-management",
    ] as const,
    heartbeatInterval: 15,
    canCreateTasks: true,
  },
  {
    name: "Engineer",
    slug: "engineer",
    role: "Full-stack Engineer",
    agentRole: "engineer" as const,
    description: "Maintains frontend/back-end and implements fixes.",
    skillSlugs: [
      "repo-architecture",
      "frontend-nextjs",
      "backend-convex",
    ] as const,
    heartbeatInterval: 15,
    canCreateTasks: false,
  },
  {
    name: "QA",
    slug: "qa",
    role: "QA / Reviewer",
    agentRole: "qa" as const,
    description: "Reviews PRs and maintains the test suite.",
    skillSlugs: ["pr-review", "test-strategy", "test-automation"] as const,
    heartbeatInterval: 15,
    canCreateTasks: false,
  },
] as const;

/** Content for AGENTS.md — Operating Manual (from docs/runtime/AGENTS.md). */
const DOC_AGENTS_CONTENT = `# AGENTS.md — OpenClaw Mission Control Operating Manual

## What you are

You are one specialist in a team of AI agents. You collaborate through OpenClaw Mission Control (tasks, threads, docs). Your job is to move work forward and leave a clear trail.

## Non-negotiable rules

1. Everything must be traceable to a task or a doc.
2. If it matters tomorrow, write it down today:
   - update WORKING.md
   - create/update an OpenClaw Mission Control document
   - or post a message in the task thread
3. Never assume permissions. If you cannot access something, report it and mark the task BLOCKED.
4. Always include evidence when you claim facts (sources, logs, repro steps).
5. Prefer small, finished increments over large vague progress.

## Where to store memory

- memory/WORKING.md: "what I'm doing right now", updated every time you act
- memory/YYYY-MM-DD.md: a chronological log of actions and decisions
- MEMORY.md: stable decisions, conventions, key learnings

## Required output format for task thread updates

Post updates using this exact structure:

**Summary**

- What changed in OpenClaw Mission Control (status/message/doc)

**Work done**

- Bullet list of concrete actions

**Artifacts**

- Links/IDs: docs created, files changed, screenshots, logs

**Risks / blockers**

- What could break
- What you need from others (explicit)

**Next step (one)**

- The single most important next action

**Sources**

- Links if you researched anything

## Task state rules

- If you start work: move task to IN_PROGRESS (unless already there)
- If you need human review: move to REVIEW and explain what to review
- If you are blocked: move to BLOCKED and explain the missing input
- If done: move to DONE, post final summary, and ensure doc links exist

## Communication rules

- Be short and concrete in threads.
- Ask questions only when you cannot proceed after checking:
  - the task description
  - the doc library
  - the activity feed
  - your WORKING.md and recent daily notes

## Document rules

When creating a doc, always include:

- Context (why this doc exists)
- The decision or deliverable
- Open questions (if any)
- "How to verify" (when relevant)
- Last updated timestamp

## Safety / secrets

- Never paste secrets (keys, tokens) in threads or docs.
- If you need credentials, request them via the official secrets path.
`;

/** Content for HEARTBEAT.md — Wake Checklist (from docs/runtime/HEARTBEAT.md). */
const DOC_HEARTBEAT_CONTENT = `# HEARTBEAT.md — Wake Checklist (Strict)

## 1) Load context (always)

- Read memory/WORKING.md
- Read today's note (memory/YYYY-MM-DD.md)
- Fetch:
  - unread notifications (mentions + thread updates)
  - tasks assigned to me where status != done
  - last 20 activities for the account

## 2) Decide what to do (priority order)

1. A direct @mention to me
2. A task assigned to me and in REVIEW (needs response)
3. A task assigned to me and in IN_PROGRESS / ASSIGNED
4. A thread I'm subscribed to with new messages
5. Otherwise: scan the activity feed for something I can improve

## 3) Execute one atomic action

Pick one action that can be completed quickly:

- post a clarifying question (only if truly blocked)
- write a doc section
- test a repro step and attach logs
- update a task status with explanation
- refactor a small component (developer agent)
- produce a small deliverable chunk

## 4) Report + persist memory (always)

- Post a thread update using the required format
- Update WORKING.md:
  - Current task
  - Status
  - Next step (single)
- Append a short entry to today's log with timestamp

## 5) Stand down rules

If you did not act:

- Post \`HEARTBEAT_OK\` only if your team wants that signal
- Otherwise stay silent to avoid noise
`;

/** Content for Tech Stack — Frontend. */
const DOC_TECH_FRONTEND_CONTENT = `# Tech Stack — Frontend

- **Next.js 16** (App Router), **React 19**
- **shadcn/ui** + **Tailwind CSS v4** (Radix primitives, lucide-react icons)
- UI code: \`apps/web\`
- Shared UI: \`packages/ui\`
- Shared types/constants: \`packages/shared\`
`;

/** Content for Tech Stack — Backend. */
const DOC_TECH_BACKEND_CONTENT = `# Tech Stack — Backend

- **Convex**: schema + functions in \`packages/backend/convex\`
- **Clerk** for auth
- Runtime service: \`apps/runtime\` (OpenClaw gateway, notification delivery, heartbeat)
- OpenClaw sessions: one per agent, session key \`agent:{slug}:{accountId}\`
- Multi-tenancy: \`accountId\` on every table; all queries filter by account.
`;

/** Seed documents: title, type reference, content. */
const seedDocs = [
  { title: "AGENTS.md — Operating Manual", content: DOC_AGENTS_CONTENT },
  { title: "HEARTBEAT.md — Wake Checklist", content: DOC_HEARTBEAT_CONTENT },
  { title: "Tech Stack — Frontend", content: DOC_TECH_FRONTEND_CONTENT },
  { title: "Tech Stack — Backend", content: DOC_TECH_BACKEND_CONTENT },
] as const;

/** Minimal OpenClaw config for seed agents (matches schema). */
function defaultOpenclawConfig(
  skillIds: Id<"skills">[],
  behaviorFlags: { canCreateTasks: boolean },
) {
  return {
    model: "claude-sonnet-4-20250514",
    temperature: 0.7,
    maxTokens: 4096,
    skillIds,
    contextConfig: {
      maxHistoryMessages: 50,
      includeTaskContext: true,
      includeTeamContext: true,
    },
    behaviorFlags: {
      canCreateTasks: behaviorFlags.canCreateTasks,
      canModifyTaskStatus: true,
      canCreateDocuments: true,
      canMentionAgents: true,
    },
  };
}

type AgentRole = "squad-lead" | "engineer" | "qa";

/**
 * Build SOUL content for an agent role (derived from docs/runtime/SOUL_TEMPLATE.md).
 */
function buildSoulContent(
  name: string,
  role: string,
  agentRole: AgentRole,
): string {
  switch (agentRole) {
    case "squad-lead":
      return `# SOUL — ${name}

Role: ${role}
Level: lead

## Mission

Keep the repo healthy and the team aligned. Own issue triage, sprint planning, and release visibility.

## Personality constraints

- Always triage new issues and keep backlog hygiene.
- Define clear next steps and owners.
- Flag blockers early and escalate when needed.
- Prefer short, actionable thread updates.
- Delegate to Engineer/QA with clear acceptance criteria.

## Domain strengths

- GitHub issues, milestones, labels.
- Sprint planning and priority setting.
- Release checklists and changelogs.

## Default operating procedure

- On heartbeat: check assigned tasks, triage inbox, post sprint updates.
- Create/assign tasks when work is unowned; move to REVIEW when ready.
- Write docs for decisions; link from task threads.

## Quality checks (must pass)

- Evidence attached when making claims.
- Clear next step.
- Task state is correct.

## What you never do

- Change stable decisions without updating MEMORY.md.
- Invent facts without sources.
- Leak secrets.
`;
    case "engineer":
      return `# SOUL — ${name}

Role: ${role}
Level: specialist

## Mission

Implement fixes and keep tech docs current. Maintain frontend and backend per repo standards.

## Personality constraints

- Cite files and PRs when describing changes.
- Prefer small PRs and incremental changes.
- Update docs when behavior or APIs change.
- Run or describe tests when changing behavior.

## Domain strengths

- Next.js App Router, React, shadcn/ui, Tailwind.
- Convex schema, queries, mutations, auth.
- Repo structure and architectural decisions.

## Default operating procedure

- On heartbeat: pick assigned task, make one atomic change, post update with artifacts.
- Create/update reference docs for frontend/backend when relevant.
- Move task to REVIEW when done and tag QA if needed.

## Quality checks (must pass)

- Evidence attached when making claims.
- Clear next step.
- Task state is correct.

## What you never do

- Change stable decisions without updating MEMORY.md.
- Invent facts without sources.
- Leak secrets.
`;
    case "qa":
      return `# SOUL — ${name}

Role: ${role}
Level: specialist

## Mission

Protect quality and scale readiness. Review PRs and maintain the test suite.

## Personality constraints

- Risk-first review: security, regressions, edge cases.
- Call out missing tests or unclear repro steps.
- Require repro steps for bug reports.
- Prefer automated checks where possible.

## Domain strengths

- PR review for quality, security, regression risks.
- Test planning, coverage strategy, edge cases.
- Unit, integration, and e2e test implementation.

## Default operating procedure

- On heartbeat: review open PRs, run or add tests, post QA notes.
- Write or request tests; update QA/release notes.
- Move task to DONE when verified; flag blockers clearly.

## Quality checks (must pass)

- Evidence attached when making claims.
- Clear next step.
- Task state is correct.

## What you never do

- Change stable decisions without updating MEMORY.md.
- Invent facts without sources.
- Leak secrets.
`;
    default:
      return `# SOUL — ${name}\n\nRole: ${role}\nLevel: specialist\n\n## Mission\nExecute assigned tasks with precision and provide clear, actionable updates.\n\n## Personality constraints\n- Be concise and focused\n- Provide evidence for claims\n- Ask questions only when blocked\n- Update task status promptly\n\n## What you never do\n- Invent facts without sources\n- Change decisions without documentation\n- Leak secrets.\n`;
  }
}

/**
 * Ensure skills exist by slug; return map of slug -> skillId (only enabled skills).
 * Inserts only missing skills; does not override isEnabled.
 * Disabled existing skills are excluded from slugToId so agents are not assigned them.
 */
async function ensureSkills(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
): Promise<{
  slugToId: Record<string, Id<"skills">>;
  created: number;
  existing: number;
  disabledSkipped: number;
}> {
  let created = 0;
  let existing = 0;
  let disabledSkipped = 0;
  const slugToId: Record<string, Id<"skills">> = {};

  for (const s of seedSkills) {
    const found = await ctx.db
      .query("skills")
      .withIndex("by_account_slug", (q) =>
        q.eq("accountId", accountId).eq("slug", s.slug),
      )
      .unique();
    if (found) {
      if (found.isEnabled) {
        slugToId[s.slug] = found._id;
        existing += 1;
      } else {
        disabledSkipped += 1;
      }
    } else {
      const now = Date.now();
      const id = await ctx.db.insert("skills", {
        accountId,
        name: s.name,
        slug: s.slug,
        category: "custom",
        description: s.description,
        config: {},
        isEnabled: true,
        createdAt: now,
        updatedAt: now,
      });
      slugToId[s.slug] = id;
      created += 1;
    }
  }
  return { slugToId, created, existing, disabledSkipped };
}

/**
 * Ensure reference docs exist by title; insert only missing.
 * Uses type "reference" and authorType "user" with given authorId.
 */
async function ensureDocs(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  authorId: string,
): Promise<{ created: number; existing: number }> {
  const existingRefs = await ctx.db
    .query("documents")
    .withIndex("by_account_type", (q) =>
      q.eq("accountId", accountId).eq("type", "reference"),
    )
    .collect();
  const existingTitles = new Set(
    existingRefs.map((d) => d.title ?? d.name ?? ""),
  );
  let created = 0;
  let existing = 0;

  for (const d of seedDocs) {
    if (existingTitles.has(d.title)) {
      existing += 1;
      continue;
    }
    const now = Date.now();
    await ctx.db.insert("documents", {
      accountId,
      kind: "file",
      title: d.title,
      content: d.content,
      type: "reference",
      authorType: "user",
      authorId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    existingTitles.add(d.title);
    created += 1;
  }
  return { created, existing };
}

/** Auth-like shape used by both run (Clerk) and runInternal (env). */
interface SeedOwner {
  userId: string;
  userName: string;
  userEmail: string;
  userAvatarUrl?: string;
}

/**
 * Resolve account to seed: prefer the owner's first account (by membership).
 * If none and createDemoIfNone, create the demo account and add owner; otherwise throw.
 */
async function resolveSeedAccount(
  ctx: MutationCtx,
  ownerUserId: string,
  owner: SeedOwner,
  createDemoIfNone: boolean,
): Promise<{
  account: { _id: Id<"accounts">; slug: string };
  accountId: Id<"accounts">;
}> {
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_user", (q) => q.eq("userId", ownerUserId))
    .collect();

  if (memberships.length > 0) {
    const first = memberships[0];
    const account = await ctx.db.get(first.accountId);
    if (account) {
      return {
        account: { _id: account._id, slug: account.slug },
        accountId: account._id,
      };
    }
  }

  if (!createDemoIfNone) {
    throw new Error(
      "User has no accounts. Create an account in the app first (e.g. from the dashboard), then run the seed.",
    );
  }

  const accountId = await ctx.db.insert("accounts", {
    name: DEMO_NAME,
    slug: DEMO_SLUG,
    plan: "free",
    runtimeStatus: "offline",
    createdAt: Date.now(),
  });
  await ctx.db.insert("memberships", {
    accountId,
    userId: owner.userId,
    userName: owner.userName,
    userEmail: owner.userEmail,
    userAvatarUrl: owner.userAvatarUrl,
    role: "owner",
    joinedAt: Date.now(),
  });
  const account = await ctx.db.get(accountId);
  if (!account) throw new Error("Failed to create account");
  return {
    account: { _id: account._id, slug: account.slug },
    accountId: account._id,
  };
}

/**
 * Core seed logic: ensure skills, docs, and agents for a given account.
 * Shared by run (user auth) and runInternal (env-based, for CLI).
 */
async function runSeedWithOwner(
  ctx: MutationCtx,
  owner: SeedOwner,
  options: { createDemoIfNone: boolean },
): Promise<{
  accountId: Id<"accounts">;
  slug: string;
  skillsCreated: number;
  skillsExisting: number;
  skillsDisabledSkipped: number;
  docsCreated: number;
  docsExisting: number;
  agentsCreated: number;
  agentsExisting: number;
}> {
  const { accountId, account } = await resolveSeedAccount(
    ctx,
    owner.userId,
    owner,
    options.createDemoIfNone,
  );

  const {
    slugToId,
    created: skillsCreated,
    existing: skillsExisting,
    disabledSkipped: skillsDisabledSkipped,
  } = await ensureSkills(ctx, accountId);
  const { created: docsCreated, existing: docsExisting } = await ensureDocs(
    ctx,
    accountId,
    owner.userId,
  );

  let agentsCreated = 0;
  let agentsExisting = 0;
  const now = Date.now();

  for (const a of seedAgents) {
    const existingAgent = await ctx.db
      .query("agents")
      .withIndex("by_account_slug", (q) =>
        q.eq("accountId", accountId).eq("slug", a.slug),
      )
      .unique();

    if (existingAgent) {
      agentsExisting += 1;
      continue;
    }

    const skillIds: Id<"skills">[] = a.skillSlugs
      .map((slug) => slugToId[slug])
      .filter((id): id is Id<"skills"> => id !== undefined);

    const soulContent = buildSoulContent(a.name, a.role, a.agentRole);
    const openclawConfig = defaultOpenclawConfig(skillIds, {
      canCreateTasks: a.canCreateTasks,
    });

    await ctx.db.insert("agents", {
      accountId,
      name: a.name,
      slug: a.slug,
      role: a.role,
      description: a.description,
      sessionKey: `agent:${a.slug}:${accountId}`,
      status: "offline",
      heartbeatInterval: a.heartbeatInterval,
      soulContent,
      openclawConfig,
      createdAt: now,
    });
    agentsCreated += 1;
  }

  return {
    accountId,
    slug: account.slug,
    skillsCreated,
    skillsExisting,
    skillsDisabledSkipped,
    docsCreated,
    docsExisting,
    agentsCreated,
    agentsExisting,
  };
}

/**
 * Idempotent seed: seeds the current user's first account (or creates demo account if they have none).
 * Call from the app or Convex dashboard (Run function) while signed in.
 * Safe to run multiple times: creates only missing skills/docs/agents by slug or title.
 *
 * Return payload:
 * - accountId, slug: account that was seeded.
 * - skillsCreated / skillsExisting, docsCreated / docsExisting, agentsCreated / agentsExisting.
 */
export const run = mutation({
  args: {},
  handler: async (ctx) => {
    const auth = await requireAuth(ctx);
    return runSeedWithOwner(
      ctx,
      {
        userId: auth.userId,
        userName: auth.userName,
        userEmail: auth.userEmail,
        userAvatarUrl: auth.userAvatarUrl,
      },
      { createDemoIfNone: true },
    );
  },
});

/**
 * Internal seed for CLI: no user token required.
 * Seeds the first account that CLERK_USER_ID is a member of (your account).
 * Uses Convex env var CLERK_USER_ID (required) = your Clerk user ID.
 * Run with: npx convex run seed:runInternal '{}'
 * Set env first: npx convex env set CLERK_USER_ID <your-clerk-user-id>
 * You must have at least one account in the app; the seed does not create an account.
 */
export const runInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const userId =
      (typeof process.env.CLERK_USER_ID === "string" &&
        process.env.CLERK_USER_ID.trim()) ||
      "";
    if (!userId) {
      throw new Error(
        "CLERK_USER_ID not set. Set it in Convex Dashboard (Deployment Settings > Environment Variables) or run: npx convex env set CLERK_USER_ID <your-clerk-user-id>",
      );
    }
    const owner: SeedOwner = {
      userId,
      userName:
        (typeof process.env.SEED_DEMO_OWNER_NAME === "string" &&
          process.env.SEED_DEMO_OWNER_NAME.trim()) ||
        "Demo Owner",
      userEmail:
        (typeof process.env.SEED_DEMO_OWNER_EMAIL === "string" &&
          process.env.SEED_DEMO_OWNER_EMAIL.trim()) ||
        "",
      userAvatarUrl:
        typeof process.env.SEED_DEMO_OWNER_AVATAR_URL === "string" &&
        process.env.SEED_DEMO_OWNER_AVATAR_URL.trim()
          ? process.env.SEED_DEMO_OWNER_AVATAR_URL.trim()
          : undefined,
    };
    return runSeedWithOwner(ctx, owner, { createDemoIfNone: false });
  },
});
