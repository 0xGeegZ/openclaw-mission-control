---
name: release-management
description: Plan releases, track readiness, and publish changelogs.
---

# Release Management

## Purpose

Coordinate the steps required to ship a release safely and predictably.

## When to Use

- Preparing a release candidate
- Coordinating release notes or changelogs
- Verifying release readiness across teams

## Checklist

1. **Scope confirmation**
   - List features/bug fixes included in this release.
2. **Readiness**
   - Ensure tests pass and critical checks are green.
   - Confirm migrations and rollout steps.
3. **Changelog**
   - Draft release notes with user-facing impact.
4. **Rollout plan**
   - Define deployment steps and rollback plan.
5. **Post-release**
   - Monitor alerts and confirm stability.

## Output Format

- **Scope:** bullet list of included items
- **Readiness:** status + blockers
- **Changelog draft:** short, user-facing summary
- **Rollout:** steps + rollback path
