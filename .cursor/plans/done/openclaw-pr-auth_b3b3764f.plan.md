---
name: openclaw-pr-auth
overview: Enable OpenClaw agents to clone, sync, commit, push, and open PRs using only GH_TOKEN with no host-mounted repo by adding non-interactive git auth, per-task repo sync hooks, and aligned agent instructions.
todos: []
isProject: false
---

# OpenClaw GH_TOKEN PR Enablement Plan

## Context & goal

We need OpenClaw agents to reliably clone, commit, push, and create GitHub PRs using only `GH_TOKEN`, without relying on interactive login. The current setup creates a writable clone but lacks git credential wiring, so PR creation still fails at push time. We will add non-interactive git auth based on `GH_TOKEN`, ensure commit identity defaults are set, and align all agent instructions (including seeded docs) with the new workflow.

Key constraints:

- Use only `GH_TOKEN` for auth (no interactive login).
- Avoid leaking tokens in logs or URLs.
- No host-mounted repo; agents always use a writable clone in the gateway workspace.
- Repo must sync on each task start (per-task) without interactive auth.
- Respect repo conventions (imports at top, JSDoc on new code where applicable).

## Feature setup checklist

- Requirements and scope captured
- Key files identified
- Feature branch created (if you want this as a PR)
- Runtime environment restarted after change

## Codebase research summary

Files inspected:

- [apps/runtime/openclaw/start-openclaw.sh](apps/runtime/openclaw/start-openclaw.sh) — gateway startup, GH_TOKEN injected for `gh`, writable clone creation.
- [docs/runtime/AGENTS.md](docs/runtime/AGENTS.md) — agent instructions for repo usage (updated to writable clone).
- [apps/runtime/.env.example](apps/runtime/.env.example) — documents `GH_TOKEN`.
- [apps/runtime/docker-compose.runtime.yml](apps/runtime/docker-compose.runtime.yml) — host-mounted repo volume to remove.
- [apps/runtime/src/delivery.ts](apps/runtime/src/delivery.ts) — repository hints in notification payloads.
- [packages/backend/convex/seed.ts](packages/backend/convex/seed.ts) — seeded `AGENTS.md` content still references old repo path and only `gh` usage.

External references:

- `gh auth setup-git` configures git to use GitHub CLI as credential helper: [https://cli.github.com/manual/gh_auth_setup-git](https://cli.github.com/manual/gh_auth_setup-git)
- `GH_TOKEN`/`GITHUB_TOKEN` environment variables for `gh`: [https://cli.github.com/manual/gh_help_environment](https://cli.github.com/manual/gh_help_environment)
- GitHub docs recommend CLI or credential manager for HTTPS git auth: [https://docs.github.com/en/get-started/git-basics/caching-your-github-credentials-in-git](https://docs.github.com/en/get-started/git-basics/caching-your-github-credentials-in-git)
- OpenClaw hooks (events, workspace hooks, boot/command events): [https://docs.clawd.bot/hooks](https://docs.clawd.bot/hooks)

## High-level design

We will make git operations non-interactive and token-based, using `GH_TOKEN` only, and enforce per-task repo sync via OpenClaw hooks:

1. **Auth helper**: Set up a non-interactive credential helper for git when `GH_TOKEN` is present.

- Preferred: use `gh auth setup-git` (credential helper) because it avoids token-in-URL risks and is GitHub’s recommended path for HTTPS.
- Fallback: create a minimal `GIT_ASKPASS` script that supplies `x-access-token`/`GH_TOKEN` if `gh auth setup-git` is unavailable or fails.

1. **Commit identity defaults**: Ensure git has `user.name`/`user.email` defaults in the runtime to avoid commit failures. Use non-sensitive defaults (e.g., `OpenClaw Agent` + `openclaw-agent@users.noreply.github.com`) and allow override via env vars.
2. **Per-task repo sync**: Add a custom OpenClaw hook that runs on `command:new` and `agent:bootstrap` to `fetch` + `reset` the writable clone (with a short cooldown to avoid repeated fetches). Install and enable the hook at startup.
3. **Instruction alignment**: Update `docs/runtime/AGENTS.md`, `apps/runtime/src/delivery.ts`, and the seeded `DOC_AGENTS_CONTENT` in [packages/backend/convex/seed.ts](packages/backend/convex/seed.ts) to reference the writable clone path and per-task sync behavior (no host mount).

Data flow:
`Notification → OpenClaw hook syncs repo → agent work in writable clone → token-based auth helper (GH_TOKEN) → git push → gh pr create`.

## File & module changes

### Existing files to change

- [apps/runtime/openclaw/start-openclaw.sh](apps/runtime/openclaw/start-openclaw.sh)
  - Add GH_TOKEN git auth setup (run `gh auth setup-git` non-interactively when GH_TOKEN is set).
  - Add fallback `GIT_ASKPASS` script if `gh auth setup-git` fails.
  - Export `GIT_TERMINAL_PROMPT=0` to ensure non-interactive behavior.
  - Set default git identity (`user.name`, `user.email`) if not already configured; allow `GIT_AUTHOR_NAME` and `GIT_AUTHOR_EMAIL` env overrides.
  - Ensure clone uses auth helper by setting env prior to `git clone` / `git push`.
  - Remove read-only mirror fallback; clone only from GitHub.
  - Install/enable the repo-sync hook in the workspace and ensure hooks are enabled in config.
- [apps/runtime/.env.example](apps/runtime/.env.example)
  - Document optional `GIT_AUTHOR_NAME` and `GIT_AUTHOR_EMAIL` overrides.
  - Clarify GH_TOKEN scopes needed for push/PR.
- [apps/runtime/docker-compose.runtime.yml](apps/runtime/docker-compose.runtime.yml)
  - Remove the host-mounted repo volume.
- [apps/runtime/src/delivery.ts](apps/runtime/src/delivery.ts)
  - Update repository hints to the writable clone path and remove read-only language.
- [docs/runtime/AGENTS.md](docs/runtime/AGENTS.md)
  - Add explicit instructions for using writable clone, and mention GH_TOKEN-based git auth (no `gh auth login`).
  - Add a short PR workflow snippet using `git` + `gh pr create`.
- [packages/backend/convex/seed.ts](packages/backend/convex/seed.ts)
  - Update `DOC_AGENTS_CONTENT` to match the latest `AGENTS.md` (writable repo path + GH_TOKEN git auth guidance).

### New files to create

- [apps/runtime/openclaw/hooks/repo-sync/HOOK.md](apps/runtime/openclaw/hooks/repo-sync/HOOK.md)
  - Hook metadata: events `command:new` and `agent:bootstrap`, requires `git`, documents the sync behavior.
- [apps/runtime/openclaw/hooks/repo-sync/handler.ts](apps/runtime/openclaw/hooks/repo-sync/handler.ts)
  - Handler to run `git fetch` + `git reset --hard origin/<default>` with cooldown and safe logging.

## Step-by-step tasks

1. **Remove host-mounted repo** in [apps/runtime/docker-compose.runtime.yml](apps/runtime/docker-compose.runtime.yml):

- Delete the `../..:/root/clawd/openclaw-mission-control:ro` volume entry.

1. **Add git auth helper wiring** in [apps/runtime/openclaw/start-openclaw.sh](apps/runtime/openclaw/start-openclaw.sh):

- If `GH_TOKEN` is set, run `gh auth setup-git` and handle failures without crashing startup.
- Create a temp `GIT_ASKPASS` fallback; set `GIT_TERMINAL_PROMPT=0`.
- Ensure helper env is set before `git clone` and available for subsequent agent commands.

1. **Set default git identity** in the same script:

- If no `user.name` / `user.email`, set defaults.
- Allow overrides via `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` env vars.

1. **Add repo-sync hook** in [apps/runtime/openclaw/hooks/repo-sync](apps/runtime/openclaw/hooks/repo-sync):

- Implement `handler.ts` to `fetch` + `reset --hard origin/<default>` with a cooldown stamp file.
- Add `HOOK.md` metadata for `command:new` and `agent:bootstrap` events.

1. **Enable hooks at startup** in [apps/runtime/openclaw/start-openclaw.sh](apps/runtime/openclaw/start-openclaw.sh):

- Copy the hook directory into `/root/clawd/hooks`.
- Ensure `hooks.internal.enabled=true` in config so hooks run.

1. **Update runtime env docs** in [apps/runtime/.env.example](apps/runtime/.env.example):

- Document optional git identity variables and required GH_TOKEN scopes.
- Add optional `OPENCLAW_REPO_DEFAULT_BRANCH` and sync cooldown config (if used).

1. **Align agent instructions** in [docs/runtime/AGENTS.md](docs/runtime/AGENTS.md):

- Use the writable clone path and note per-task sync behavior.
- Add explicit git/PR steps and GH_TOKEN expectations.

1. **Update notification hints** in [apps/runtime/src/delivery.ts](apps/runtime/src/delivery.ts):

- Replace read-only hints with the writable clone path.
- Mention that repo sync occurs automatically on task start.

1. **Sync seeded docs** in [packages/backend/convex/seed.ts](packages/backend/convex/seed.ts):

- Update `DOC_AGENTS_CONTENT` to match the latest AGENTS guidance.

1. **Manual verification** (non-code):

- Restart the gateway container.
- Confirm the repo sync hook is registered in gateway logs.
- From a test agent task, run `git status`, create a branch, commit, push, then `gh pr create`.

## Edge cases & risks

- **GH_TOKEN missing or insufficient scopes**: push/PR will fail. Mitigate by documenting required scopes (`contents: write`, `pull-requests: write`).
- **SSO-enforced orgs**: token must be approved for SSO.
- `**gh auth setup-git` fails: use the `GIT_ASKPASS` fallback.
- **Git identity not set**: commits fail; ensure defaults or require env overrides.
- **Sandbox execution**: ensure auth helper env is available where git runs; validate after deployment.
- **Hook event coverage**: per-task sync relies on `command:new` and `agent:bootstrap`; if tasks reuse long-lived sessions without `/new`, add a reminder in notifications to run `git fetch` when in doubt.

## Testing strategy

- **Manual QA**
  - Verify `/root/clawd/repos/openclaw-mission-control` exists.
  - Run `git -C /root/clawd/repos/openclaw-mission-control status`.
  - Create branch, commit, and push using GH_TOKEN.
  - Run `gh pr create` and confirm PR is created.
- **Edge case checks**
  - Remove GH_TOKEN and confirm error messages are clear.
  - Use an insufficient-scope token and confirm guidance surfaces in logs.

## Rollout / migration

- Restart the OpenClaw gateway container after changes.
- No data migration required.

## TODO checklist

**Runtime / Auth**

- Add GH_TOKEN-based git auth helper (gh helper + fallback askpass) in [apps/runtime/openclaw/start-openclaw.sh](apps/runtime/openclaw/start-openclaw.sh)
- Export non-interactive git env vars before clone/push
- Set default git `user.name`/`user.email` with env overrides
- Remove host-mounted repo volume in [apps/runtime/docker-compose.runtime.yml](apps/runtime/docker-compose.runtime.yml)
- Add repo-sync hook files under [apps/runtime/openclaw/hooks/repo-sync](apps/runtime/openclaw/hooks/repo-sync)
- Enable hooks + install hook in [apps/runtime/openclaw/start-openclaw.sh](apps/runtime/openclaw/start-openclaw.sh)

**Docs**

- Update [docs/runtime/AGENTS.md](docs/runtime/AGENTS.md) with writable clone + PR workflow
- Update [packages/backend/convex/seed.ts](packages/backend/convex/seed.ts) `DOC_AGENTS_CONTENT` to match
- Add git identity + GH_TOKEN scope notes in [apps/runtime/.env.example](apps/runtime/.env.example)
- Update repo hint text in [apps/runtime/src/delivery.ts](apps/runtime/src/delivery.ts)

**Verification**

- Restart gateway container and confirm writable clone exists
- Run a full PR creation flow (branch → commit → push → `gh pr create`) using GH_TOKEN
- Validate failure modes when GH_TOKEN is missing or under-scoped
