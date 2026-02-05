---
name: production-ready-refactor
description: Production-Ready Refactor
disable-model-invocation: true
---

# Production-Ready Refactor

You are refactoring an existing implementation to production-ready quality.

Follow this workflow:

## 1) Understand the current behavior

- Read the relevant code paths end-to-end.
- Identify integration points, config, and tests that touch this area.
- Summarize intended behavior and any gaps/risks.

## 2) Reuse before creating

- Search for existing utilities, hooks, types, and patterns in the codebase.
- Extend existing code where possible; avoid new files unless necessary.
- Keep imports at the top of the file.
- Follow DRY and KISS: remove duplication, keep functions focused and small.

## 3) Refactor to match project standards

- Match existing file organization, naming conventions, and style.
- Use `@` imports, established helpers, and shared types.
- Add JSDoc for exported functions/components/hooks.
- Add comments only when they explain non-obvious intent or constraints.

## 4) Production readiness checks

- Handle edge cases and error paths explicitly.
- Validate configuration/environment usage and update `.env.example` + `Env` when needed.
- Ensure logging and error messages are actionable.
- Avoid breaking public URLs or APIs; add redirects/rewrites if required.

## 5) Tests & verification

- Add or update tests for critical logic and regressions.
- Run `pnpm tsc --noEmit` and `pnpm lint`.
- Run `pnpm build` if the change impacts build-time behavior.

## 6) Final response

- Provide a concise change summary.
- List tests run and their results.
- Call out any remaining risks, manual QA steps, or follow-ups.
