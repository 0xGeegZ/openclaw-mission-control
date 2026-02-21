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

## Enhancement Summary

**Deepened on:** 2026-02-20  
**Sections enhanced:** 9  
**Research agents used:** best-practices-researcher, architecture-strategist, performance-oracle, code-simplicity-reviewer, agent-native-reviewer, security-sentinel, pattern-recognition-specialist  
**External reference:** OpenClaw Sub-Agents docs (docs.openclaw.ai/tools/subagents)

### Key Improvements

1. **Pre-step: resolve merge conflicts** in `delivery/prompt.ts`, `delivery.test.ts`, `openclaw-profiles.test.ts`, and `TOOLS_AUDIT.md` before implementing; unify on backend-owned `DeliveryContext` and required `deliverySessionKey` (throw when missing).
2. **Canonical wording**: Draft one sentence for “default no agentId” and mirror it in `buildDeliveryInstructions`, docs/runtime/AGENTS.md, DEFAULT_AGENTS_MD, and seed DOC_AGENTS_CONTENT; consider storing in `prompt-fragments.ts` to avoid drift.
3. **Config limits**: Set `subagents.maxConcurrent: 5` in template; OpenClaw supports `maxChildrenPerAgent` (default 5). Optionally enforce in startup for upgrades (architecture/security) or keep template-only for simplicity (code-simplicity).
4. **Observability**: Define “ack latency” (e.g. readAt → first reply) and add at least one measurable signal before rollout; document that subagent spawn visibility depends on OpenClaw/gateway.
5. **Prompt sanitization**: Add `sanitizeForPrompt()` for user/agent-controlled content (task title, message body, thread) embedded in delivery instructions to mitigate prompt-injection risk.

### New Considerations Discovered

- **OpenClaw semantics**: `sessions_spawn` is non-blocking; subagents get AGENTS.md + TOOLS.md (no SOUL/IDENTITY/USER/HEARTBEAT). `agentId` allowlist is per-agent via `agents.list[].subagents.allowAgents` (default: requester only).
- **Stream timeout**: `DELIVERY_STREAM_TIMEOUT_MS` must be large enough for fast ack + (limit × worst-case child) + aggregation; recommend ≥ 5 min when subagents are used; document in runtime README.
- **Backend cost**: `getForDelivery` can do O(account) memberships/agents/reference-docs; consider resolving only thread author ids and batching context fetch for scale.
- **TOOLS_AUDIT**: Add a short pointer to docs/runtime/AGENTS.md for the behavioral contract instead of duplicating full rationale; state that parent-skill-context rule is guidance-only (no runtime enforcement).
- **SOUL alignment**: Confirm SOUL_TEMPLATE / SOUL content remains aligned with subagent-first and fast-ack (no change if already correct).

---

# Subagent-First Fast Ack Refactor Plan

## 1. Context & goal

We will harden runtime behavior so each agent replies fast (acknowledgment/questions first), then delegates substantial execution to subagents running in the background before posting one combined substantive update. We will enforce subagent runtime limits at 5 (per your choice: config limits only), and ensure spawned subagents stay aligned with the parent agent’s skills/context model. Key constraints: preserve current single-reply-per-notification semantics, avoid cross-agent skill leakage, keep OpenClaw docs-compliant `sessions_spawn` usage, and avoid regressions in delivery/no-reply policy.

### Research Insights

**Best practices (fast ack UX):** 0–3 s for instant feedback; require 1–2 sentence ack with optional clarifying questions; explicit “I’ll work on this and reply once with the full outcome” sets expectation for the final post. Put “reply first with short acknowledgment” before any “then do work” instruction to avoid perceived latency.

**Subagent orchestration:** Spawn for substantial/parallelizable work; do work inline for trivial tasks. Limit 5 is reasonable (community often suggests 2–4); parent must wait for child results and post one combined reply. Define aggregation upfront (how to combine results) and use clear, specific task descriptions per spawn.

**References:** OpenClaw Sub-Agents (docs.openclaw.ai/tools/subagents); Slavo Glinsky UX for AI Agents; Agentic Patterns (sub-agent spawning, subject hygiene).

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

### Research Insights

**Naming:** Plan “AGENTS/HEARTBEAT” refers to **docs/runtime/AGENTS.md** and seed/embedded AGENTS content — not repo root `AGENTS.md` (Cursor memory). Use “docs/runtime/AGENTS.md and seed/embedded AGENTS content” explicitly to avoid confusion.

**Blocking:** Merge conflicts exist in `delivery/prompt.ts` (sessionKey, workspaceInstruction), `delivery.test.ts`, `openclaw-profiles.test.ts`, and `TOOLS_AUDIT.md`. Resolve before implementing this plan. Unify `DeliveryContext` on backend as single source; runtime should import from backend and thin or remove `apps/runtime/src/delivery/types.ts`.

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

### Research Insights

**Data flow:** Flow is correct: Convex notification → getNotificationForDelivery → DeliveryContext → buildDeliveryInstructions + buildNotificationInput → sendToOpenClaw → fast ack → optional sessions_spawn → aggregate → single substantive reply. Optionally label first step in diagram as “Convex notification / getNotificationForDelivery”.

**Config layer:** Today subagent limit is only in template; `buildOpenClawConfig` does not write `subagents`. For upgrades, either (a) set 5 in template and optionally in startup after merge when undefined, or (b) keep template-only (simpler). OpenClaw docs: `maxChildrenPerAgent` default 5, `maxConcurrent` default 8; both can be set in `agents.defaults.subagents`.

**Simplification (optional):** One bullet list may suffice; mermaid can be dropped or trimmed to one line to reduce duplication with text.

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
  - Optionally add generated config defaults for subagent limits (`maxConcurrent: 5`, `maxChildrenPerAgent: 5`) if this file is the preferred single source for runtime profile sync. _Simplification option:_ Keep template as single source; do not add limits in openclaw-profiles.ts to avoid two sources.
- [apps/runtime/openclaw/openclaw.json.template](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/openclaw/openclaw.json.template)
  - Set subagent limit knobs to `5` (at minimum `subagents.maxConcurrent`; include `maxChildrenPerAgent` if supported in current OpenClaw version). OpenClaw supports both; default `maxChildrenPerAgent` is 5 in docs.
- [apps/runtime/openclaw/start-openclaw.sh](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/openclaw/start-openclaw.sh)
  - Ensure startup merge logic preserves/enforces the 5-limit settings and does not accidentally reset them to older defaults. _Note:_ Script currently does not set `subagents`; only template does. Either document “no script change” or add explicit set/cap after merge for upgrades (architecture/security recommendation).
- [packages/backend/convex/seed.ts](/Users/guillaumedieudonne/Desktop/mission-control/packages/backend/convex/seed.ts)
  - Update seed-managed AGENTS/HEARTBEAT guidance blocks so newly seeded workspaces get the same fast-ack + subagent-first policy.
  - Keep ownership boundaries (seed/account/per-agent) intact from prompt-layering rules.
- [apps/runtime/src/delivery.test.ts](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/delivery.test.ts)
  - Add assertions for new instruction text: fast ack expectation, subagent-default execution for substantial tasks, and parent-skill-context spawning rule.
- [apps/runtime/src/openclaw-profiles.test.ts](/Users/guillaumedieudonne/Desktop/mission-control/apps/runtime/src/openclaw-profiles.test.ts)
  - Add/adjust tests for default AGENTS content and generated config limit values (5) where applicable.
- [docs/runtime/TOOLS_AUDIT.md](/Users/guillaumedieudonne/Desktop/mission-control/docs/runtime/TOOLS_AUDIT.md)
  - Document policy update and rationale: fast response UX + delegated execution path. _Simplify:_ Add short pointer to docs/runtime/AGENTS.md for the behavioral contract; avoid duplicating full rationale. State that parent-skill-context rule is guidance-only (no runtime enforcement).

### Research Insights

**Single source of truth:** Declare **docs/runtime/AGENTS.md** as canonical for policy wording; delivery prompt = short consistent subset (fast ack + subagent + parent-skill); DEFAULT_AGENTS_MD and seed = derived (same policy, possibly abridged). Add comment in each file pointing to canonical doc. Use **prompt-fragments.ts** for new canonical phrases (e.g. fast-ack sentence, parent-skill rule) and reference from delivery prompt and DEFAULT_AGENTS_MD to avoid wording drift.

**Security:** Sanitize user/agent-controlled data (task title, message content, notification body) before embedding in instructions — add `sanitizeForPrompt()` and use for all free-form fields; restrict permissions on `openclaw.json` (e.g. chmod 600) if it holds API keys. Document that `sessions_spawn` agentId is not validated by runtime; mitigation is prompt + OpenClaw allowlist.

### New files to create

- None expected unless adding a dedicated runtime policy constants module becomes necessary during implementation.

## 5. Step-by-step tasks

1. **Pre-step: Resolve merge conflicts and unify DeliveryContext.** Resolve conflicts in `delivery/prompt.ts`, `delivery.ts`, `delivery.test.ts`, `openclaw-profiles.test.ts`, and `TOOLS_AUDIT.md`. Prefer: throw when `deliverySessionKey` missing; include `SKILLS_LOCATION_SENTENCE` in workspaceInstruction. Use backend as single source for `DeliveryContext`; runtime imports from backend.
2. Workspace isolation setup (pre-implementation commit).

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
- Confirm SOUL_TEMPLATE / SOUL content remains aligned with subagent-first and fast-ack (no change if already correct).

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
- Add rollout notes in runtime README if needed to highlight changed subagent defaults. Document that `DELIVERY_STREAM_TIMEOUT_MS` should be ≥ 5 min when subagents are used (aggregate-before-reply can approach timeout).

### Research Insights

**Step order:** Do conflict resolution and DeliveryContext unification first so all edits apply to a single codebase. Use one canonical sentence for “default no agentId” and add to (a) buildDeliveryInstructions, (b) docs/runtime/AGENTS.md, (c) DEFAULT_AGENTS_MD, (d) seed DOC_AGENTS_CONTENT. Consider bumping `DELIVERY_INSTRUCTION_PROFILE_VERSION` when changing the prompt contract for observability.

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

### Research Insights

**Stream timeout:** “Aggregate child results before substantive reply” can push session stream toward `DELIVERY_STREAM_TIMEOUT_MS`; if exceeded, notification is retried. Set minimum recommended ≥ 5 min; optionally log when stream runs >50% of timeout. **Limit 5 throughput:** Tasks that would use 6–8 parallel subagents may take longer (e.g. two waves); document and consider env override for high-orchestration accounts. **Prompt injection:** User/agent-controlled content in instructions (task title, message body) is not sanitized; add sanitization to close injection risk.

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

### Research Insights

**Delivery tests:** Assert (1) fast ack string (e.g. “acknowledgment” and “1–2 sentences”), (2) subagent/delegate string (“sessions_spawn” or “sub-agent” and “aggregate” or “reply once”), (3) parent-skill rule (“agentId” and “default” or “omit” or “do not pass”). For assignment context, assert both fast-ack and subagent/aggregate blocks present. Use shared constant or prompt-fragments phrasing so tests survive minor wording changes. **Profile tests:** Assert default AGENTS content includes new policy phrases; assert template on disk contains `subagents.maxConcurrent: 5` or, if added to buildOpenClawConfig, assert generated config has limit 5. **YAGNI:** Rely on unit tests + manual QA; skip new integration tests for “first response short” unless already cheap.

## 8. Rollout / migration

- No schema/data migration required.
- Safe rollout as config/prompt policy update.
- Deploy runtime + gateway config together to avoid policy/config mismatch.
- Observe delivery logs for:
  - acknowledgment latency,
  - subagent spawn frequency,
  - no-reply or empty-reply regressions.

### Research Insights

**Observability gap:** Runtime does not currently log “time to first reply” or subagent spawn counts (those would come from OpenClaw/gateway). Define ack latency as readAt → first reply (optionally creation → first reply). Either (a) add minimal metrics (e.g. duration per sendToOpenClaw or per-session stream, expose in health/logs) and document subagent visibility, or (b) add an explicit rollout task to implement these metrics before relying on them. **Metrics to add:** `time_from_read_to_first_reply_ms`; subagent spawn count per notification (from tool-call logs if available); stream timeout count; context fetch duration per cycle.

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

### Research Insights

**Consolidation:** §9 overlaps with frontmatter todos and §5. Consider keeping one canonical list (frontmatter + detailed §5) and folding §9 into §5 or removing to avoid duplicate maintenance. **Checklist additions:** Resolve merge conflicts and unify DeliveryContext/session key; confirm SOUL aligned with subagent-first; if enforcing limit in startup, add “Enforce subagent limit 5 in startup when missing (for upgrades).”
