# Setup & Plan a Feature (Cursor Plan Mode)

## Overview

Systematically set up a new feature from initial planning through to a detailed implementation plan. You are in **planning mode**: do not write or change any code, only plan. Do not paste full implementations; only short code snippets or signatures if absolutely needed to clarify the plan.

The plan must be detailed enough that:

- If we give it to **100 different engineers**, at least **85%** of the resulting code would be very similar.
- A **junior engineer** can implement the feature by following the plan step by step.

---

## Phase 0: Setup (before writing the plan)

1. **Define requirements**
   - Clarify feature scope and goals with the user (or from the description below).
   - Identify user stories and acceptance criteria.
   - Note any technical approach constraints.

2. **Scope the repo**
   - Identify which **apps/packages** in this repo are affected (e.g. `apps/web`, `packages/backend`, `packages/ui`).
   - Note any **key assumptions** and mark them clearly (e.g. “Assumption A: …”) so they can be confirmed later.

3. **Feature setup checklist** (confirm before proceeding)
   - [ ] Requirements / scope documented
   - [ ] User stories or acceptance criteria clear
   - [ ] Feature branch created (if applicable)
   - [ ] Development environment ready

---

## Phase 1: Understand the task

- Read the user’s description below this command carefully.
- Skim the relevant files in this repo:
  - Routes / pages
  - Components
  - Hooks / state management
  - API handlers / services (e.g. Convex queries, mutations, actions)
  - Schemas / models / types
  - Config files and environment usage
  - Existing tests related to this area
- Use **project-wide search** and **symbol navigation** to understand how similar features are implemented today.
- Before asking the user anything, **thoroughly analyze the codebase and existing documentation** to try to answer your own questions:
  - Reuse existing patterns, utilities, hooks, and types whenever possible.
  - Only ask clarifying questions that you **cannot reasonably resolve yourself** after checking the codebase and docs.
- If anything is still unclear after that, ask up to **5 short clarifying questions** before writing the final plan.

---

## Phase 2: Write a Markdown plan with these sections

### 1. Context & goal

- One short paragraph on what we are building and why.
- Key constraints (tech stack, performance, security, backwards compatibility, UX).

### 2. Codebase research summary

- List the **main files and modules you inspected**, with paths (e.g. `apps/web/src/app/(dashboard)/[accountSlug]/tasks/page.tsx`).
- Briefly summarize what you learned:
  - Existing patterns you will follow.
  - Existing APIs, components, hooks, or utilities to reuse.
  - Any important types or schemas that matter for this feature.

### 3. High-level design

- Architecture summary across layers (frontend, backend, shared libraries).
- Main data flows and where they start/end (e.g. “User action → React component → hook → Convex mutation → DB → response → UI update”).
- Mention important existing functions, components, hooks, and types by their **exact names** where relevant.
- Explain how the new feature fits into the existing architecture.

### 4. File & module changes

- List **existing files to touch** with their paths.
- List **new files to create** with their paths.
- For each file, write 1–3 bullets on what will change, with enough detail that another engineer can implement it without guessing, e.g.:
  - New props, fields, or params (with types).
  - New API endpoints or Convex functions (method/name, input/output shape).
  - New state, hooks, or context usage.
  - New utility functions or modules.

### 5. Step-by-step tasks

- Write a **numbered list** of small, atomic steps.
- Each step should be “doable in one focused commit”.
- Steps must mention concrete files, functions, and components to edit or create.
- Include any required:
  - Migrations
  - Feature flags
  - Configuration or environment variable changes
- Make the steps explicit enough that a **junior engineer** can follow them one by one without making design decisions on their own.

### 6. Edge cases & risks

- Edge cases to handle (validation, empty states, error handling, race conditions, permissions, auth, rate limits, etc.).
- Potential breaking changes or risky areas in the codebase:
  - Explain why they are risky.
  - Suggest mitigation (feature flags, extra tests, monitoring, fallbacks).

### 7. Testing strategy

- What to cover with **unit tests**: modules, pure logic, input validation, branching logic.
- What to cover with **integration/e2e tests**: critical flows, API + UI integration, cross-service behavior.
- Manual QA checklist: happy path and key edge cases as bullet points (e.g. “Create X…”, “Update Y…”, “Error when Z…”).

### 8. Rollout / migration (if relevant)

- How to deploy safely: feature flags, gradual rollout, kill switch, monitoring dashboards.
- How to migrate existing data or users: one-off scripts, background jobs, or lazy migration.
- Any observability or logging changes: new logs, metrics, or traces to add.

### 9. TODO checklist

- At the end of the plan, create a **detailed TODO list** using Markdown checkboxes (`- [ ]`).
- This TODO list should contain **all concrete steps** needed to complete the implementation, from first code change to final deployment and QA.
- Group TODOs when useful, e.g. **Backend**, **Frontend**, **Tests**, **Infra / DevOps**.
- Each TODO item should be clear, small, and directly actionable.

---

## Phase 3: Output rules

- Use clean Markdown headings and bullet points.
- Keep sentences short and concrete.
- Avoid vague statements like “update things as needed”; always be specific about **what**, **where**, and **how**.
- Stay in planning mode only; do not modify code or open pull requests in this step.
