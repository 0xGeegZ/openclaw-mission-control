# OpenClaw Mission Control — Documentation

Documentation is grouped into subfolders:

## [concept/](concept/)

Foundational and vision docs:

- **openclaw-mission-control-initial-article.md** — Original concept and vision (OpenClaw/Clawdbot, squad model, Convex).
- **openclaw-mission-control-cursor-core-instructions.md** — Core engineering instructions for Cursor and engineers (architecture, invariants, runtime contract).

## [runtime/](runtime/)

Agent and runtime operating docs (used by agents and runtime service):

- **AGENTS.md** — Operating manual for AI agents (rules, memory, thread format, task state).
- **HEARTBEAT.md** — Wake checklist for heartbeat cycles.
- **SOUL_TEMPLATE.md** — Template for agent SOUL (identity, mission, constraints).

## [quality/](quality/)

QA and testing:

- **qa-checklist.md** — Manual QA checklist before release.
- **testing.md** — Testing strategy (unit, E2E, running tests).

## [build/](build/)

Build orchestration and phase modules:

- **00-orchestrator.md**, **01-orchestrator-v2.md** — Master orchestration.
- **phase-1-foundation/** … **phase-9-devex-quality/** — Phase-specific plans and reviews.

## [roadmap/](roadmap/)

Product and technical roadmap:

- **missing-features.md**
- **runtime-version-management-v2.md**
