---
name: subagent-fast-ack-refactor
overview: Refactor runtime prompt/profile configuration so agents acknowledge quickly, delegate substantial work to subagents, and run with explicit subagent limits of 5 while preserving parent-agent skill context for spawned sessions.
todos:
  - id: isolate-worktree
    content: Create and switch to feature worktree/branch for isolated refactor.
    status: pending
  - id: prompt-policy
    content: Harden delivery prompt for fast acknowledgment and subagent-first substantive work.
    status: pending
  - id: skill-context-guard
    content: Add explicit sessions_spawn parent-skill-context rule (default no agentId).
    status: pending
  - id: config-limits-5
    content: Set and preserve subagent runtime limits at 5 in template/startup merge flow.
    status: pending
  - id: seed-doc-sync
    content: Sync AGENTS/HEARTBEAT guidance across docs, embedded defaults, and seed content.
    status: pending
  - id: tests-and-qa
    content: Update delivery/profile tests and run manual QA scenarios for reply speed + delegation.
    status: pending
isProject: false
---

# Subagent-First Fast Ack Refactor Plan

## 1. Context & goal

We will harden runtime behavior so each agent replies fast (acknowledgment/questions first), then delegates substantial execution to subagents running in the background before posting one combined substantive update. We will enforce subagent runtime limits at 5 (per your choice: config limits only), and ensure spawned subagents stay aligned with the parent agent’s skills/context model. Key constraints: preserve current single-reply-per-notification semantics, avoid cross-agent skill leakage, keep OpenClaw docs-compliant `sessions_spawn` usage, and avoid regressions in delivery/no-reply policy.

## 2. Codebase research summary

Main files inspected:

- [docs/runtime/AGENTS.md](/Users/guillaumedieudonne/Desktop/mission-control/docs/runtime/AGENTS.md)
- [docs/runtime/TOOLS_AUDIT.md](/Users/guillaumedieudonne/Desktop/mission-control/docs/runtime/TOOLS_AUDIT.md)
- [apps/runtime/src/delivery/prompt.ts](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/delivery/prompt.ts)
- [apps/runtime/src/delivery.ts](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/delivery.ts)
- [apps/runtime/src/openclaw-profiles.ts](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/openclaw-profiles.ts)
- [apps/runtime/openclaw/openclaw.json.template](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/openclaw/openclaw.json.template)
- [apps/runtime/openclaw/start-openclaw.sh](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/openclaw/start-openclaw.sh)
- [apps/runtime/src/openclaw-profiles.test.ts](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/openclaw-profiles.test.ts)
- [apps/runtime/src/delivery.test.ts](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/delivery.test.ts)
- [packages/backend/convex/seed.ts](/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/seed.ts)
- [packages/backend/convex/service/agents.ts](/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/service/agents.ts)

What is already in place:

- Delivery prompt already mandates short assignment acknowledgment and one-shot final response.
- Delivery prompt already encourages subagent parallelization via `sessions_spawn`.
- Runtime profile sync already materializes `TOOLS.md` + per-skill `skills/<slug>/SKILL.md` for each agent workspace.
- OpenClaw docs indicate `sessions_spawn` is non-blocking and defaults to same agent identity unless `agentId` is overridden.
- Current template sets `subagents.maxConcurrent` to `8`.

Gaps to close:

- Guidance is not strict enough about “ack fast, then delegate real work by default”.
- No explicit instruction to avoid `agentId` override (needed to keep parent skill context).
- Subagent limit target is not yet `5` in runtime config.
- No explicit tests asserting new delegation/skill-context guidance.

## 3. High-level design

Use a two-layer enforcement model:

- Runtime prompt contract: strongly bias behavior toward immediate acknowledgment + clarification, then delegated execution via subagents for heavy work.
- OpenClaw runtime config: enforce subagent safety/concurrency limits (`5`) without forcing exactly five spawns per task.

Data flow update:

```mermaid
flowchart LR
  notif[Convex Notification] --> promptBuild[buildDeliveryInstructions]
  promptBuild --> replyFast[FastAckOrQuestion]
  replyFast --> subSpawn[sessions_spawnByDefaultForHeavyWork]
  subSpawn --> aggregate[AggregateChildResults]
  aggregate --> oneReply[SingleSubstantiveReply]
  oneReply --> thread[TaskThreadMessage]
```



Skill-context guarantee approach:

- Keep subagent execution under the same parent agent identity by default.
- Explicitly instruct agents not to pass `agentId` to `sessions_spawn` unless orchestrator intent explicitly requires a different specialist.
- Keep skill loading model unchanged (`TOOLS.md` + `skills/*`) so child sessions inherit parent agent context as designed.

## 4. File & module changes

### Existing files to touch

- [apps/runtime/src/delivery/prompt.ts](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/delivery/prompt.ts)
  - Strengthen assignment and scope rules: fast acknowledge/question first, then parallelize substantive work through subagents when task is non-trivial.
  - Add explicit “parent-skill context” rule: default `sessions_spawn` without `agentId`; use `agentId` only for intentional cross-specialist delegation.
  - Keep single-reply and no-progress-update invariants intact.
- [docs/runtime/AGENTS.md](/Users/guillaumedieudonne/Desktop/mission-control/docs/runtime/AGENTS.md)
  - Add explicit operational guidance for fast first response and subagent-first execution for long/parallelizable tasks.
  - Add a rule clarifying how to preserve parent skills/context when spawning subagents.
- [apps/runtime/src/openclaw-profiles.ts](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/openclaw-profiles.ts)
  - Update embedded `DEFAULT_AGENTS_MD` content to mirror docs/runtime guidance, so Docker fallback behavior remains aligned.
  - Optionally add generated config defaults for subagent limits (`maxConcurrent: 5`, `maxChildrenPerAgent: 5`) if this file is the preferred single source for runtime profile sync.
- [apps/runtime/openclaw/openclaw.json.template](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/openclaw/openclaw.json.template)
  - Set subagent limit knobs to `5` (at minimum `subagents.maxConcurrent`; include `maxChildrenPerAgent` if supported in current OpenClaw version).
- [apps/runtime/openclaw/start-openclaw.sh](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/openclaw/start-openclaw.sh)
  - Ensure startup merge logic preserves/enforces the 5-limit settings and does not accidentally reset them to older defaults.
- [packages/backend/convex/seed.ts](/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/seed.ts)
  - Update seed-managed AGENTS/HEARTBEAT guidance blocks so newly seeded workspaces get the same fast-ack + subagent-first policy.
  - Keep ownership boundaries (seed/account/per-agent) intact from prompt-layering rules.
- [apps/runtime/src/delivery.test.ts](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/delivery.test.ts)
  - Add assertions for new instruction text: fast ack expectation, subagent-default execution for substantial tasks, and parent-skill-context spawning rule.
- [apps/runtime/src/openclaw-profiles.test.ts](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/openclaw-profiles.test.ts)
  - Add/adjust tests for default AGENTS content and generated config limit values (5) where applicable.
- [docs/runtime/TOOLS_AUDIT.md](/Users/guillaumedieudonne/Desktop/mission-control/docs/runtime/TOOLS_AUDIT.md)
  - Document policy update and rationale: fast response UX + delegated execution path.

### New files to create

- None expected unless adding a dedicated runtime policy constants module becomes necessary during implementation.

## 5. Step-by-step tasks

1. Workspace isolation setup (pre-implementation commit).

- Create a dedicated worktree/branch for this refactor per workspace rules.
- Confirm terminal and editor are pointed to that worktree before edits.

1. Codify fast-ack + subagent-first runtime instructions.

- Edit `buildDeliveryInstructions` in [apps/runtime/src/delivery/prompt.ts](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/delivery/prompt.ts).
- Add precise language hierarchy:
  - immediate short acknowledgment/questions,
  - delegate substantive work via subagents for non-trivial tasks,
  - wait/aggregate child outputs before single substantive reply.

1. Lock parent-skill-context spawn behavior.

- In same prompt layer, add an explicit `sessions_spawn` usage rule:
  - default call omits `agentId` to preserve parent skill context,
  - only use `agentId` for intentional specialist rerouting.

1. Update canonical AGENTS guidance.

- Edit [docs/runtime/AGENTS.md](/Users/guillaumedieudonne/Desktop/mission-control/docs/runtime/AGENTS.md) with matching policy language.
- Mirror equivalent text in embedded default inside [apps/runtime/src/openclaw-profiles.ts](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/openclaw-profiles.ts).

1. Enforce subagent limits at 5 in runtime config.

- Update [apps/runtime/openclaw/openclaw.json.template](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/openclaw/openclaw.json.template): set 5-limit values (`maxConcurrent`, and `maxChildrenPerAgent` if supported).
- Verify startup merge in [apps/runtime/openclaw/start-openclaw.sh](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/openclaw/start-openclaw.sh) does not regress these values.

1. Align seed-managed docs and defaults.

- Update AGENTS/HEARTBEAT seed content in [packages/backend/convex/seed.ts](/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/seed.ts) so new accounts inherit policy.
- Keep existing role-specific SOUL behavior unchanged unless explicitly required.

1. Expand automated coverage.

- Add delivery prompt tests in [apps/runtime/src/delivery.test.ts](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/delivery.test.ts).
- Add profile/config tests in [apps/runtime/src/openclaw-profiles.test.ts](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/openclaw-profiles.test.ts).

1. Documentation and operational notes.

- Update [docs/runtime/TOOLS_AUDIT.md](/Users/guillaumedieudonne/Desktop/mission-control/docs/runtime/TOOLS_AUDIT.md) with the new behavioral contract.
- Add rollout notes in runtime README if needed to highlight changed subagent defaults.

## 6. Edge cases & risks

- Ambiguous prompts could cause over-eager subagent spawning for trivial tasks.
  - Mitigation: explicitly scope “subagent-first” to substantial/parallelizable work.
- `sessions_spawn` non-blocking behavior can produce missing final output if agent replies too early.
  - Mitigation: retain strict “aggregate child results before substantive final reply” rule.
- Changing limits to 5 may reduce throughput for very large orchestrations.
  - Mitigation: keep values configurable and documented; monitor queue latency.
- If `agentId` is overused in spawn calls, child skill context may diverge from parent.
  - Mitigation: explicit prompt prohibition by default + test assertions.
- Seed/doc drift between repo docs and embedded defaults.
  - Mitigation: update both sources in same change set and add tests for embedded text invariants.

## 7. Testing strategy

Unit tests:

- `buildDeliveryInstructions` includes:
  - fast ack/clarification directive,
  - subagent-first substantive work guidance,
  - parent-skill-context spawning rule (default no `agentId`).
- `syncOpenClawProfiles` / config generation emits expected subagent limits (5) and keeps existing config shape stable.

Integration/runtime checks:

- Simulate assignment notification and verify first response remains short acknowledgment.
- Simulate substantial task and verify runtime prompt includes delegation guidance and single final-reply behavior.

Manual QA checklist:

- Assign task to an agent and confirm first reply is quick acknowledgment/questions.
- Trigger a heavier task and verify agent uses subagent workflow before final substantive reply.
- Confirm subagent run appears under same parent context/skills unless explicitly rerouted.
- Verify OpenClaw config reflects subagent limit 5 after startup merge.

## 8. Rollout / migration

- No schema/data migration required.
- Safe rollout as config/prompt policy update.
- Deploy runtime + gateway config together to avoid policy/config mismatch.
- Observe delivery logs for:
  - acknowledgment latency,
  - subagent spawn frequency,
  - no-reply or empty-reply regressions.

## 9. TODO checklist

### Setup

- Create feature worktree and branch for this refactor.
- Confirm runtime dev environment uses the worktree path.

### Runtime policy

- Update `buildDeliveryInstructions` in `apps/runtime/src/delivery/prompt.ts` for fast-ack + subagent-first behavior.
- Add explicit `sessions_spawn` rule to preserve parent skill context by default (no `agentId`).

### Docs and defaults

- Update `docs/runtime/AGENTS.md` with matching behavior rules.
- Update embedded `DEFAULT_AGENTS_MD` in `apps/runtime/src/openclaw-profiles.ts` to match docs.
- Update seed-owned AGENTS/HEARTBEAT guidance in `packages/backend/convex/seed.ts`.

### Config limits

- Set subagent limits to 5 in `apps/runtime/openclaw/openclaw.json.template`.
- Validate `apps/runtime/openclaw/start-openclaw.sh` keeps those values at runtime.

### Tests

- Add/adjust delivery prompt tests in `apps/runtime/src/delivery.test.ts`.
- Add/adjust profile/config tests in `apps/runtime/src/openclaw-profiles.test.ts`.

### Validation and rollout

- Run runtime test suite for modified modules.
- Manually verify fast acknowledgment and delegated execution behavior.
- Update `docs/runtime/TOOLS_AUDIT.md` with final policy notes.

