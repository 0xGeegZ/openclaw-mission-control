# Phase 1 Review: Foundation

> Reviewer agent instructions for validating Phase 1 completion.

---

## 1. Context & Goal

This review validates that Phase 1 (Foundation) is complete and ready for Phase 2. The reviewer must verify:

1. Monorepo structure is correctly set up
2. All packages are properly configured
3. Convex schema is complete and types are generated
4. Build and dev server work correctly
5. No lint or type errors

**This review MUST pass before starting Phase 2.**

---

## 2. Review Checklist

### 2.1 Monorepo Structure

Verify the following directory structure exists:

```bash
# Run from project root
ls -la apps/
# Expected: web/ native/ runtime/

ls -la packages/
# Expected: backend/ ui/ shared/

ls -la .github/workflows/
# Expected: ci.yml deploy.yml
```

- [ ] `apps/web/` exists with Next.js app
- [ ] `apps/native/` exists (placeholder for v2)
- [ ] `apps/runtime/` exists with placeholder service
- [ ] `packages/backend/` exists with Convex
- [ ] `packages/ui/` exists with shadcn setup
- [ ] `packages/shared/` exists with types/constants

### 2.1.5 Documentation & Open Source Files

Verify open source files exist:

```bash
# Check README
head -10 README.md
# Expected: # Mission Control

# Check license
head -5 LICENSE
# Expected: MIT License

# Check contribution guide
head -10 CONTRIBUTING.md
# Expected: Contributing to Mission Control

# Check environment example
head -10 .env.example
# Expected: Mission Control Environment Variables

# Check .nvmrc
cat .nvmrc
# Expected: 24
```

- [ ] `README.md` exists with project overview
- [ ] `LICENSE` exists with MIT license
- [ ] `CONTRIBUTING.md` exists with setup instructions
- [ ] `.env.example` exists with all required variables
- [ ] `.nvmrc` exists with "24"

### 2.1.6 GitHub Actions (CI/CD)

Verify CI/CD pipelines are configured:

```bash
# Check CI workflow
cat .github/workflows/ci.yml | head -20

# Check deploy workflow
cat .github/workflows/deploy.yml | head -20

# Check PR template
cat .github/PULL_REQUEST_TEMPLATE.md | head -10

# Check issue templates
ls -la .github/ISSUE_TEMPLATE/
```

- [ ] `.github/workflows/ci.yml` exists and is valid YAML
- [ ] `.github/workflows/deploy.yml` exists and is valid YAML
- [ ] `.github/PULL_REQUEST_TEMPLATE.md` exists
- [ ] `.github/ISSUE_TEMPLATE/bug_report.md` exists
- [ ] `.github/ISSUE_TEMPLATE/feature_request.md` exists

### 2.2 Package Configuration

Verify package.json files are correct:

```bash
# Check root workspace
cat package.json | grep '"workspaces"'
# Expected: ["apps/*", "packages/*"]

# Check web app has dependencies
cat apps/web/package.json | grep '@packages/'
# Expected: @packages/backend, @packages/shared, @packages/ui
```

- [ ] Root `package.json` has correct workspaces
- [ ] Web app has `@packages/*` dependencies
- [ ] UI package has `cn()` utility
- [ ] Shared package has types and constants

### 2.3 TypeScript Configuration

Verify path aliases are configured:

```bash
# Check web app tsconfig
cat apps/web/tsconfig.json | grep -A5 '"paths"'
```

- [ ] `@/*` points to web app local files
- [ ] `@packages/ui/*` points to UI package
- [ ] `@packages/shared/*` points to shared package
- [ ] `@packages/backend` points to backend package

### 2.4 Convex Schema

Verify schema is complete:

```bash
# Check schema file exists and has all tables
grep "defineTable" packages/backend/convex/schema.ts | wc -l
# Expected: 9 (accounts, memberships, agents, tasks, messages, documents, activities, notifications, subscriptions)

# Check generated types exist
ls packages/backend/convex/_generated/
# Expected: api.d.ts, api.js, dataModel.d.ts, server.d.ts, server.js
```

- [ ] Schema has 9 tables defined
- [ ] All tables have `accountId` (except accounts)
- [ ] All tables have appropriate indexes
- [ ] Generated types exist in `_generated/`
- [ ] Validators file exists at `lib/validators.ts`

### 2.5 Build Verification

Run build commands:

```bash
# Ensure Node 24 is active
nvm use
node -v  # Should be v24.x.x

# Install dependencies
npm install

# Run type check
npm run typecheck

# Check for errors
echo $?
# Expected: 0 (no errors)
```

- [ ] Node 24 is active (via nvm)
- [ ] `npm install` completes without errors
- [ ] `npm run typecheck` passes (exit code 0)
- [ ] No TypeScript errors in any package

### 2.6 Dev Server Verification

Start the development server:

```bash
# Start Convex (in background or separate terminal)
cd packages/backend && npx convex dev &

# Start Next.js
npm run dev
```

- [ ] Convex dev server starts without errors
- [ ] Next.js dev server starts on localhost:3000
- [ ] Landing page renders without errors
- [ ] No console errors in browser

### 2.7 shadcn/ui Setup

Verify shadcn is configured:

```bash
# Check components.json exists
cat apps/web/components.json
cat packages/ui/components.json

# Check global styles
cat packages/ui/src/styles/globals.css | head -20
```

- [ ] `apps/web/components.json` exists with correct aliases
- [ ] `packages/ui/components.json` exists
- [ ] Global CSS has Tailwind imports
- [ ] CSS variables for theme are defined

---

## 3. Issues to Fix

If any check fails, document the issue and fix it:

### Issue Template

```markdown
### Issue: [Brief description]

**Check failed:** [Which check]
**File:** [Path to problematic file]
**Error:** [Error message or description]
**Fix applied:** [What was changed]
```

---

## 4. Review Report

Generate this report after completing all checks:

```markdown
# Phase 1 Review Report

**Date:** [YYYY-MM-DD]
**Reviewer:** [Agent or human name]

## Type Check
- [x] Pass / [ ] Fail

## Lint Check
- [x] Pass / [ ] Fail

## Build Check
- [x] Pass / [ ] Fail

## Dev Server Check
- [x] Pass / [ ] Fail

## Structure Verification
- [x] All packages exist
- [x] All configs correct
- [x] Schema complete

## Issues Found
[List any issues found and fixes applied, or "None"]

## Ready for Phase 2
- [x] YES / [ ] NO

## Notes
[Any additional observations]
```

---

## 5. Fix Common Issues

### Issue: Type errors in generated code

```bash
# Fix: Restart Convex to regenerate types
cd packages/backend
npx convex dev --once
npx convex dev
```

### Issue: Missing dependencies

```bash
# Fix: Reinstall dependencies
rm -rf node_modules
rm -rf apps/*/node_modules
rm -rf packages/*/node_modules
npm install
```

### Issue: Path alias not resolving

```bash
# Fix: Check tsconfig paths match package structure
# Ensure baseUrl is "." and paths are relative to baseUrl
```

### Issue: shadcn components missing

```bash
# Fix: Install base components
cd apps/web
npx shadcn@latest add button card input label
```

---

## 6. Sign-off

Once all checks pass and the review report shows "Ready for Phase 2: YES":

```bash
# Create git tag for phase completion
git tag -a phase-1-complete -m "Phase 1: Foundation complete"

# Push tag (optional, if pushing to remote)
git push origin phase-1-complete
```

---

## Completion Criteria

This review is complete when:

1. All 7 check sections pass
2. Review report generated with all boxes checked
3. Any issues found have been fixed and documented
4. Git tag `phase-1-complete` created
5. Phase 2 agents can safely start
