---
date: 2026-02-22
topic: readme-local-setup-audit
---

# README and Local Setup Audit — Brainstorm

## What We're Building

Up-to-date README and docs so that a new contributor can run Convex + web locally (dashboard) and, when needed, Convex + web + runtime (full stack) with clear steps and no dead links.

## Why This Approach

Address gaps and errors first (Layer 1–2), then add runtime and single source of truth (Layers 3–4), then light verification/troubleshooting (Layer 5). Avoid rewriting everything; extend and correct.

## Key Decisions

- Document both one-command (`npm run dev` from repo root) and two-terminal option (with explicit `cd apps/web && npm run dev` for Terminal 2 so root `npm run dev` does not run both and duplicate Convex).
- Document runtime as an optional "full stack" path with env and token flow; keep Getting Started dashboard-only and add a "Run with runtime (optional)" subsection.
- Single canonical "run locally" flow in README with links to runtime and Convex details.
- Fix package-manager consistency: use npm everywhere (README, CONTRIBUTING, .cursor Quick Reference).
- README as canonical for "run locally"; add `docs/local-development.md` only if the setup section grows too large (e.g. >150 lines).

## Resolved Questions

- **Full stack in Getting Started?** Keep Getting Started dashboard-only (Convex + web). Add a short "Run with runtime (optional)" subsection with env vars and "Where to get SERVICE_TOKEN and ACCOUNT_ID"; link to `apps/runtime/README.md` and `docs/runtime/runtime-docker-compose.md`.
- **README vs docs/local-development.md?** Prefer README as canonical. Add `docs/local-development.md` only if README setup exceeds ~150 lines; cross-link from CONTRIBUTING and runtime docs to the README subsection.

## Next Steps

→ Implement README and docs changes per the plan layers (1–5). See `.cursor/plans/readme_and_local_setup_audit_f4ec71b1.plan.md`.
