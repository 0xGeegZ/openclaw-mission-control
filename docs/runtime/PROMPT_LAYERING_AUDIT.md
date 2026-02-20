# Prompt layering audit

Inventory of prompt/guidance sources and ownership rules for the OpenClaw Mission Control runtime.

## Ownership model

| Layer | Owner | Content |
|-------|--------|--------|
| **Static runtime** | Code/repo | Task lifecycle semantics, tool contract, notification policy, heartbeat orchestration, multi-assignee rules. No repo-specific paths or role names. |
| **Seed / account** | Seed + Settings UI | Account-shared USER.md, repo/worktree workflow (Repository document), default behavior flags. |
| **Per-agent** | Seed + optional UI | SOUL.md, IDENTITY.md, behavior flags (canReviewTasks, canMarkDone). |

## Workspace files (materialized by profile sync)

| File | Source | Notes |
|------|--------|------|
| `USER.md` | `accounts.settings.userMd` or default | Account-shared; edit in Settings > Agent Profile. |
| `IDENTITY.md` | `agents.identityContent` or default | Per-agent; fallback from name/role. |
| `SOUL.md` | `agents.soulContent` or default | Per-agent personality/operating procedure. |
| `AGENTS.md` | Repo `docs/runtime/AGENTS.md` or embedded default | Platform-only contract; repo details come from Repository doc. |
| `HEARTBEAT.md` | Repo `docs/runtime/HEARTBEAT.md` or embedded default | Platform wake checklist. |
| `TOOLS.md` | Generated from resolved skills | Assigned skills list. |
| `skills/<slug>/SKILL.md` | Resolved skill `contentMarkdown` | Per-skill content. |

## Delivery prompt (notification → OpenClaw)

- **Static:** Status/tool semantics, capability labels, thread format, response_request usage.
- **From context:** Repository document (seed-owned) for repo paths and workflow; no hardcoded Mission Control paths in prompt builder.
- **Behavior:** Review/done gating uses explicit `canReviewTasks` and `canMarkDone` flags, not role/slug heuristics.

## Behavior flags

- `canCreateTasks`, `canModifyTaskStatus`, `canCreateDocuments`, `canMentionAgents` — existing.
- `canReviewTasks` — receive review notifications and act as reviewer.
- `canMarkDone` — allow marking tasks done (e.g. after QA).

Resolution order: agent override → account defaults → shared default.
