---
name: add-agent
description: Guides adding a new agent to LobsterControl with explicit SOUL/HEARTBEAT and skill content. Use when adding a new agent role, seed roster member, or when updating agent defaults and skills.
disable-model-invocation: true
---

# Add Agent

## Scope decision

- If the user wants a one-off agent in an existing account, use the Agents UI or `api.agents.create`. No code changes needed; set `soulContent` or rely on `generateDefaultSoul` in `packages/backend/convex/lib/agent_soul.ts`.
- If the user wants the agent in the default seeded roster, follow the update map below.

## Non-negotiables: agent instructions and heartbeat

- The SOUL, AGENTS, and HEARTBEAT instructions are the operating system for a new agent. If they are vague, the agent fails.
- For every new role, fully specify mission, personality constraints, domain strengths, default operating procedure (including heartbeat behavior), quality checks, and the never-do list. Base on `docs/runtime/SOUL_TEMPLATE.md`.
- Review `docs/runtime/AGENTS.md` and `docs/runtime/HEARTBEAT.md` and update them if the new agent introduces new tools, output formats, or heartbeat steps.
- Ensure `heartbeatInterval` and the SOUL "Default operating procedure" match the heartbeat checklist (what to read, how to prioritize, when to post `HEARTBEAT_OK`).

## Skill quality requirements

- Skills are the second operating system. Sloppy skill definitions lead to unreliable agents.
- For new skills, write precise scope, triggers, required inputs, step-by-step behavior, output expectations, and do-not-do rules.
- Keep skill content in sync across `.cursor/skills/<slug>/SKILL.md` and `packages/backend/convex/seed-skills/<slug>.md`, then regenerate `seed_skills_content.generated.ts`.

## Required inputs

- Name, slug (safe: letters/numbers/hyphen/underscore), role, description
- SOUL inputs: mission, personality constraints, domain strengths, default operating procedure, quality checks, never-do list
- Heartbeat interval (minutes), behavior flags, and whether this agent should be the orchestrator
- Skill slugs and definitions (new or existing)

## Update map (seeded agents)

1. `packages/backend/convex/seed.ts`
   - Add the agent in `seedAgents` with `name`, `slug`, `role`, `description`, `skillSlugs`, `heartbeatInterval`, `canCreateTasks`.
   - If this is a new role, extend `AgentRole` and add a `buildSoulContent` case using `docs/runtime/SOUL_TEMPLATE.md`.
   - If the agent needs new skills, add them to `seedSkills` (name/slug/description) and include the slug in `CURSOR_SKILL_SLUGS` if every seed agent should receive it.
   - If this agent should be the default orchestrator, update the `orchestratorAgentId` patch to point at the new slug.
2. Skills content (only when you add new skill slugs)
   - Local skills: create `.cursor/skills/<slug>/SKILL.md`, then from `packages/backend` run:
     - `npx tsx scripts/seed-skills-copy-cursor.ts`
     - `npm run seed-skills:generate`
   - External skills: update `packages/backend/convex/seed-skills-mapping.json`, then run:
     - `npm run seed-skills:download`
     - `npm run seed-skills:generate`
   - Do not edit `packages/backend/convex/seed_skills_content.generated.ts` by hand.
3. Documentation alignment
   - Review/update `docs/runtime/AGENTS.md` and `docs/runtime/HEARTBEAT.md` if the new agent changes tools, output formats, or heartbeat behavior.
   - Ensure the new SOUL content matches the heartbeat checklist and task-status rules.
4. Search for hard-coded slugs/roles
   - Run `rg "squad-lead|engineer|qa"` (or your new slug) and update any role-specific behavior or docs.
   - Most UI/runtime paths are data-driven; update only if you find hard-coded assumptions.

## Runtime + UI behavior

- Runtime picks up new agents via `service/agents.listForRuntime` and writes `SOUL.md`/`TOOLS.md` in `apps/runtime/src/openclaw-profiles.ts`. No code changes required.
- The Agents UI is data-driven; new agents appear automatically. Set an orchestrator via the Agent detail page or `accounts.update`.

## Verification

- Re-run seed (`packages/backend`): `npm run seed` (requires `CLERK_USER_ID` env set).
- Confirm in Convex: agent exists, `sessionKey` is `agent:{slug}:{accountId}`, `soulContent` is present, `openclawConfig.skillIds` match.
- Confirm in UI: roster shows new agent and status.

## Output expectation

- Provide a short checklist of edits made and exact files touched.
