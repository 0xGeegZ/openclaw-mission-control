---
name: README and local setup audit
overview: Audit the current README and local setup documentation (Convex + web + runtime), list concrete errors and gaps, and capture a brainstorm document that identifies improvement layers for making "run locally" complete and up to date.
todos: []
isProject: false
---

## Enhancement Summary

**Deepened on:** 2026-02-22  
**Sections enhanced:** 5 (Current state, Errors/gaps, Layers, Brainstorm doc, Next steps)  
**Research agents used:** best-practices-researcher, framework-docs-researcher, repo-research-analyst, code-reviewer. Web search: README/getting-started best practices, multi-service env documentation.

### Key improvements

1. **Critical fixes added:** CONTRIBUTING "Terminal 2: npm run dev" from root actually starts both Convex and web (duplicate Convex). Must use `cd apps/web && npm run dev` for two-terminal path, or document one-command from root explicitly. README Quick Start step 6 must state directory (repo root) and that `npm run dev` starts both.
2. **Clerk and order of operations:** Document Clerk (dashboard.clerk.com, redirect URLs, keys in `.env.local`) and a single recommended sequence: clone → install → copy .env.example → get CONVEX_URL (run convex dev once) → add Clerk keys → run `npm run dev` → verify.
3. **Roadmap link corrected:** `docs/roadmap/` exists (e.g. `missing-features.md`, `runtime-version-management-v2.md`). No 404 fix needed unless the README link path is wrong; verify on default branch.
4. **Concrete Getting Started patterns:** Research-backed Quick Start template (Convex CLI writes URL; Clerk keys; one-command vs two-terminal with explicit cwd); verification step and 2–3 troubleshooting bullets.
5. **Open questions resolved:** Keep Getting Started dashboard-only; add "Run with runtime (optional)" subsection. Prefer README as canonical; add `docs/local-development.md` only if the section grows too large (>150 lines).

### New considerations discovered

- Industry pattern: Prerequisites → Clone → Install → Env (with "where to get each value") → Run → Verify. One-command option when available; two-terminal with explicit `cd` per terminal.
- Convex: CLI writes deployment URL to `.env.local` on first `npx convex dev`; in monorepos copy into `apps/web/.env.local` for NEXT_PUBLIC_CONVEX_URL. Fallback: Convex Dashboard → deployment → Settings.
- Next.js: `.env.local` in app root; only `NEXT_PUBLIC`\_\* inlined in client; document "do not commit" and optional validation (@packages/env).
- Optional vs required: Label "Dashboard only" (Convex + web) vs "Full stack (with runtime)"; runtime subsection with env and token flow + links to apps/runtime and docs/runtime.

---

# README and Local Setup Audit — Brainstorm

## 1. Current state summary

### What the README covers today

- **Root [README.md](README.md):** High-level product description, tech stack, "Getting Started" with prerequisites (Node 24, npm, Convex, Clerk). Quick Start has 7 steps: clone, nvm, install, copy `.env.example` to `apps/web/.env.local`, start Convex from `packages/backend`, start web from repo root, open localhost:3000. Environment variables section documents web env only. "Working with Convex" and "Deploy Runtime Service" mention Convex CLI and Docker for runtime. No step-by-step for running the **runtime** locally.
- **CONTRIBUTING.md:** Two-terminal setup (Convex in one, `npm run dev` in the other). Does not mention root `npm run dev` (which runs both). No runtime.
- **apps/runtime/README.md:** Detailed runtime doc (env table, Docker, Docker Compose, health, agent endpoints). "Running locally" says `npm run dev` or `build` + `start` from `apps/runtime`, with `.env` required. Does not say how to obtain `ACCOUNT_ID` or `SERVICE_TOKEN`.
- **docs/runtime/runtime-docker-compose.md:** Docker Compose flow; states that `ACCOUNT_ID`, `CONVEX_URL`, `SERVICE_TOKEN` must be set; no instructions on where to get them.

### How things actually work

- **Root scripts ([package.json](package.json)):** `npm run dev` runs **both** Convex and web in parallel: `(cd packages/backend && npm run dev) & (cd apps/web && npm run dev) & wait`. So one command can replace the two-terminal flow.
- **Convex URL:** Obtained by running `npx convex dev` in `packages/backend`; the CLI prints the deployment URL. The README says "get URL from packages/backend after npx convex dev" but does not clarify that you run it once to get the URL, then put it in `apps/web/.env.local`.
- **Service token and ACCOUNT_ID:** Implemented in [packages/backend/convex/service_auth.ts](packages/backend/convex/service_auth.ts) (format `mc_service_{accountId}_{secret}`). Provisioned via Convex action `provisionServiceToken`; the **web app** exposes this in **Settings > OpenClaw (admin)** at `[accountSlug]/admin/openclaw` ([apps/web/src/app/(dashboard)/[accountSlug]/admin/openclaw/page.tsx](<apps/web/src/app/(dashboard)/[accountSlug]/admin/openclaw/page.tsx>)). So the flow is: run Convex + web, sign in, create/select account, go to admin OpenClaw, generate token and copy it; ACCOUNT_ID is the current account’s Convex document ID (visible in app/dashboard context). This flow is **not** documented in the main README or in CONTRIBUTING.
- **Runtime from root:** Root has `dev:openclaw` and `dev:openclaw:light` that run runtime Docker Compose with OpenClaw profile from `apps/runtime`. Main README does not reference these.

---

## 2. Identified errors and gaps

### Factual / consistency

- **Quick Start steps 5–6:** README says "Start Convex backend (in a separate terminal)" and "Start the web app" as two steps. It does not mention that from repo root **one** command runs both: `npm run dev`. So the doc is not wrong but is more verbose than necessary and omits the simpler option.
- **Package manager:** [.cursor/rules/01-project-overview.mdc](.cursor/rules/01-project-overview.mdc) "Quick Reference" uses `yarn install` and `yarn dev`; root [package.json](package.json) and README use **npm**. Inconsistent; can confuse contributors.
- **Roadmap link:** README links to [docs/roadmap/](docs/roadmap/). The directory **exists** (e.g. `docs/roadmap/missing-features.md`, `docs/roadmap/runtime-version-management-v2.md`). Verify the link on the default branch; if it 404s in your context, fix the path or add a note.

### Missing content

- **Runtime in "run locally":** The main README never describes how to run the **full** stack (Convex + web + runtime) locally. Runtime appears only in Architecture (diagram) and Deployment (Docker build/push). So "each step to make it run locally (including runtime)" is not satisfied.
- **Obtaining CONVEX_URL:** README says "get URL from packages/backend after npx convex dev" but does not give a minimal sequence: e.g. "Run `npx convex dev` in `packages/backend` once; copy the deployment URL it prints into `NEXT_PUBLIC_CONVEX_URL` in `apps/web/.env.local`."
- **Obtaining SERVICE_TOKEN and ACCOUNT_ID:** Not explained in root README or CONTRIBUTING. Runtime README and runtime-docker-compose say they are required but not where to get them. In reality: sign in to web app, open account admin → OpenClaw, generate token (and copy account ID from dashboard/URL/API if needed). This should be stated in at least one place (README or a single "Local development" doc) and linked from runtime docs.
- **Order of operations:** README does not clarify that you typically need to run Convex dev once to get the URL before the web app can connect, or that for runtime you need a Convex deployment + web app + account + token first.
- **CONTRIBUTING:** Does not mention root `npm run dev` for backend+web; does not mention runtime or when it’s needed.

### Research insights (critical fixes from code review)

- **CONTRIBUTING two-terminal bug:** CONTRIBUTING says Terminal 1: `cd packages/backend && npx convex dev`, Terminal 2: `npm run dev`. If Terminal 2 is run from **repo root**, `npm run dev` starts **both** Convex and web (root script), so you get two Convex processes. **Fix:** Either document one-command from root as primary and two-terminal as "Terminal 2: `cd apps/web && npm run dev`", or make CONTRIBUTING explicitly use `cd apps/web && npm run dev` for Terminal 2.
- **README Quick Start step 6 ambiguity:** Step 6 says "Start the web app" with only `npm run dev` and no directory. From root that starts Convex + web; from elsewhere it can duplicate Convex. **Fix:** State explicitly: "From repo root, run `npm run dev` (starts both Convex and web)" as primary, or "Terminal 2: from repo root run `cd apps/web && npm run dev`" for two-terminal.
- **Clerk missing from plan:** Getting Started requires Clerk keys; without them, "open app, sign in" fails. **Add:** One line in Layer 2 or prerequisites: "Clerk: create an application at [dashboard.clerk.com](https://dashboard.clerk.com), add localhost redirect URLs, copy publishable and secret keys into `apps/web/.env.local`."
- **Explicit order of operations:** Add a single recommended sequence: (1) Clone, Node 24, `npm install` → (2) Copy `apps/web/.env.example` → `apps/web/.env.local` → (3) Get CONVEX_URL (run `npx convex dev` in `packages/backend` once; paste printed URL into `NEXT_PUBLIC_CONVEX_URL`; stop Convex if using root `npm run dev` next) → (4) Add Clerk keys to `apps/web/.env.local` → (5) From repo root: `npm run dev` (or two-terminal variant with `cd apps/web && npm run dev` for Terminal 2) → (6) Open [http://localhost:3000](http://localhost:3000) and sign in.

### Ambiguity / UX

- **"Run locally" scope:** Unclear whether "run locally" means (a) dashboard only (Convex + web), or (b) full stack including agents (Convex + web + runtime). The brainstorm should recommend defining "minimal" vs "full" local setup and documenting both.
- **Runtime optionality:** Runtime is optional for UI-only work; required for agent delivery/heartbeats. README does not state this.

---

## 3. Layers of improvement (for brainstorm doc)

**Layer 1 — Fix clear errors**

- **Roadmap:** Verify README link to `docs/roadmap/` on default branch (directory exists: `missing-features.md`, `runtime-version-management-v2.md`). Fix only if path is wrong.
- Align package manager in docs: use **npm** everywhere (README, CONTRIBUTING); in [.cursor/rules/01-project-overview.mdc](.cursor/rules/01-project-overview.mdc) "Quick Reference" replace `yarn install` / `yarn dev` / `yarn typecheck` / `yarn lint` with npm equivalents.
- **CONTRIBUTING:** Fix two-terminal instructions so Terminal 2 is `cd apps/web && npm run dev` (not `npm run dev` from root), or add one-command option: "From repo root, `npm run dev` (Convex + web)."

**Layer 2 — Complete "dashboard only" path**

- Document the one-command option: from root, `npm run dev` (Convex + web). Make README Quick Start step 6 explicit: "From repo root, run `npm run dev` (starts both Convex and web)."
- Add a minimal "Get CONVEX_URL" step: run `npx convex dev` in `packages/backend` once; CLI may write URL to `.env.local`; copy deployment URL into `NEXT_PUBLIC_CONVEX_URL` in `apps/web/.env.local` (or from Convex Dashboard → deployment → Settings).
- **Clerk:** One line in prerequisites or env section: "Clerk: create an application at [dashboard.clerk.com](https://dashboard.clerk.com), add localhost redirect URLs, copy publishable and secret keys into `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in `apps/web/.env.local`."
- Add explicit **order of operations** (recommended sequence): clone → install → copy .env.example → get CONVEX_URL → add Clerk keys → run `npm run dev` (or two terminals with `cd apps/web && npm run dev` for Terminal 2) → open [http://localhost:3000](http://localhost:3000) and sign in.
- Keep or refine the two-terminal variant with explicit cwd for Terminal 2: `cd apps/web && npm run dev`.

**Layer 3 — Document runtime in "run locally"**

- Add a "Run the runtime locally" subsection (or equivalent) that: (1) states runtime is for agent features, (2) points to `apps/runtime/README.md` and `docs/runtime/runtime-docker-compose.md`, (3) summarizes required env: `ACCOUNT_ID`, `CONVEX_URL`, `SERVICE_TOKEN`, (4) explains where to get them: same Convex URL as web; account ID from the app/dashboard; service token from Settings → OpenClaw (admin) → Generate service token, then copy into `apps/runtime/.env`.
- Optionally mention root scripts `npm run dev:openclaw` / `dev:openclaw:light` for Docker-based runtime+gateway.

**Layer 4 — Single source of truth and cross-links**

- **Canonical place:** README "Getting Started" is the single source of truth for "run locally"; link to CONTRIBUTING (workflow, PRs), `apps/runtime/README.md`, and `docs/runtime/runtime-docker-compose.md`. Add `docs/local-development.md` only if README setup exceeds ~150 lines.
- From runtime README and runtime-docker-compose, add a short "Where to get SERVICE_TOKEN and ACCOUNT_ID" that links to or repeats the web app admin flow (README "Run the runtime locally" subsection).
- CONTRIBUTING: add one line on "optional: runtime" and link to README "Run the runtime locally" or runtime-docker-compose.

**Layer 5 — Verification and troubleshooting**

- **Verify setup:** One sentence after Quick Start: "Verify: run `npm run typecheck` and `npm run lint` from repo root; open [http://localhost:3000](http://localhost:3000) and sign in (create account if needed). For full stack, `curl -s http://127.0.0.1:3000/health` from runtime returns OK."
- **Troubleshooting (2–3 bullets):**
  - "App shows Convex connection error" → ensure `NEXT_PUBLIC_CONVEX_URL` is set and matches the URL printed by `npx convex dev` in `packages/backend`.
  - "Runtime exits or health fails" → ensure `ACCOUNT_ID`, `CONVEX_URL`, `SERVICE_TOKEN` are set in `apps/runtime/.env`; get token from Settings → OpenClaw (admin) in the web app.
  - "Clerk sign-in redirect fails" → add `http://localhost:3000` (and callback paths) to Clerk dashboard redirect URLs.

---

## 4. Proposed brainstorm document

**Path:** `docs/brainstorms/2026-02-22-readme-local-setup-audit-brainstorm.md`

**Structure (per brainstorming skill):**

- **What we're building:** Up-to-date README and docs so that a new contributor can run Convex + web locally (dashboard) and, when needed, Convex + web + runtime (full stack) with clear steps and no dead links.
- **Why this approach:** Address gaps and errors first (layer 1–2), then add runtime and single source of truth (3–4), then light verification/troubleshooting (5). Avoid rewriting everything; extend and correct.
- **Key decisions:** (1) Document both one-command (`npm run dev`) and two-terminal option; (2) Document runtime as an optional "full stack" path with env and token flow; (3) Single canonical "run locally" flow in README with links to runtime and Convex; (4) Fix roadmap and package-manager consistency.
- **Open questions (resolved by research):**  
  (1) **Full stack in Getting Started?** Keep Getting Started **dashboard-only** (Convex + web). Add a short **"Run with runtime (optional)"** subsection: runtime is for agent delivery/heartbeats; list env vars and "Where to get SERVICE_TOKEN and ACCOUNT_ID" (admin OpenClaw + account ID); link to `apps/runtime/README.md` and `docs/runtime/runtime-docker-compose.md`. Do not add a long full-stack checklist in the main Quick Start.  
  (2) **README vs docs/local-development.md?** Prefer **README as canonical** for "run locally." Add `docs/local-development.md` only if the README setup section grows too large (e.g. >150 lines). Cross-link from CONTRIBUTING and runtime docs to the README subsection.

---

## 5. Next steps (after approval)

1. **Create the brainstorm file** at `docs/brainstorms/2026-02-22-readme-local-setup-audit-brainstorm.md` with the structure above (and optional "Resolved questions" if you answer the open questions).
2. **Implement README/docs changes** according to the chosen layers (and any decisions from the open questions). Suggested order: Layer 1 (fixes) → Layer 2 (dashboard path) → Layer 3 (runtime) → Layer 4 (cross-links) → Layer 5 (verify/troubleshoot).

No code or file changes have been made; this plan is for review and confirmation before writing the brainstorm document or editing the README.

---

## Appendix: Suggested Quick Start (research-backed template)

Use this as the basis for the README Quick Start section (align with Layer 2 and env table):

````markdown
### Quick Start

1. **Prerequisites:** Node.js 24+ (e.g. `nvm use 24`), npm, Git. Convex and Clerk accounts (free) for full setup.

2. **Clone and install**

```bash
   git clone https://github.com/YOUR_ORG/openclaw-mission-control.git
   cd openclaw-mission-control
   nvm use 24   # or ensure Node 24+
   npm install

```
````

1. **Environment variables**

- Copy `apps/web/.env.example` to `apps/web/.env.local`.
- **Convex URL:** Run `npx convex dev` once from `packages/backend`; sign in (or use anonymous dev). The CLI will create a Convex project and write the deployment URL. Copy that URL into `NEXT_PUBLIC_CONVEX_URL` in `apps/web/.env.local` (or from [Convex Dashboard](https://dashboard.convex.dev) → your deployment → Settings).
- **Clerk:** In [Clerk Dashboard](https://dashboard.clerk.com) → API Keys, copy the publishable and secret keys into `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in `apps/web/.env.local`. Add `http://localhost:3000` to redirect URLs.

2. **Run the app**

- From repo root: `npm run dev` (starts Convex backend and web app).
- Or two terminals: Terminal 1 — `cd packages/backend && npx convex dev`; Terminal 2 — `cd apps/web && npm run dev`.
- Open [http://localhost:3000](http://localhost:3000) and sign in.

3. **Verify:** Run `npm run typecheck` and `npm run lint` from repo root.

```

### References

- [Convex: Deployment URLs](https://docs.convex.dev/client/react/deployment-urls), [CLI create project](https://docs.convex.dev/cli#create-a-new-project), [Dev workflow](https://docs.convex.dev/understanding/workflow).
- [Next.js: Environment Variables](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables).
- [Turborepo: Running tasks](https://turbo.build/repo/docs/core-concepts/monorepos/running-tasks).
- GitHub Docs: "Developing your project locally"; opensource.guide: README as instruction manual for new contributors.
```
