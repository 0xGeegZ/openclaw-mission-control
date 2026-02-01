# Module 01: Project Setup

> Clone the Convex monorepo template and configure it for Mission Control.

---

## ESSENTIAL CONTEXT — READ FIRST

**Before implementing this module, you MUST read:**

1. **`docs/mission-control-initial-article.md`** — Understand the vision: AI agents as a real team
2. **`docs/mission-control-cursor-core-instructions.md`** — Core invariants and architecture
3. **`.cursor/rules/`** — ALL coding rules apply (especially `01-project-overview.mdc`)

**Key understanding:**
- We're building Mission Control on top of **OpenClaw (Clawdbot)**
- OpenClaw provides agent runtime (sessions, gateway, heartbeat)
- Mission Control provides the shared brain (Convex) and UI (Next.js)
- One runtime server per customer account (DigitalOcean Droplet)

---

## 0. Prerequisites: Node.js Setup with nvm

**IMPORTANT**: Before starting, ensure you're using Node.js 24 with nvm.

### Install nvm (if not already installed)

```bash
# Check if nvm is installed
nvm --version

# If not installed, install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Restart terminal or source profile
source ~/.bashrc  # or ~/.zshrc on macOS
```

### Install and Use Node 24

```bash
# Install Node 24 (latest LTS)
nvm install 24

# Use Node 24 for this project
nvm use 24

# Verify version
node -v  # Should show v24.x.x
npm -v   # Should show v10.x.x

# Optional: Set Node 24 as default
nvm alias default 24
```

### Create `.nvmrc` file

This ensures all developers and CI/CD use the same Node version:

```bash
# In project root
echo "24" > .nvmrc

# Now anyone can run:
nvm use  # Automatically uses version from .nvmrc
```

**Agent Note**: As an agent, you should run `nvm use` at the start of your work to ensure you're on Node 24.

---

## 1. Context & Goal

We are setting up the foundational monorepo structure for Mission Control by cloning and adapting the `get-convex/turbo-expo-nextjs-clerk-convex-monorepo` template.

**What we're building:**
- Turborepo monorepo with `apps/web`, `apps/runtime`, `packages/ui`, `packages/backend`, `packages/shared`
- Next.js 16 web app with Clerk authentication
- Convex backend ready for our schema
- shadcn/ui component library
- Placeholder for runtime service (OpenClaw)

**Key constraints:**
- Keep Clerk for authentication (already in template)
- Keep mobile app placeholder (`apps/native`) for future v2
- Use Tailwind CSS v4 with shadcn/ui
- TypeScript strict mode everywhere
- **npm** as package manager (Node 24+)
- Use **nvm** for Node version management

---

## 2. Codebase Research Summary

### Template Structure (from GitHub)

```
turbo-expo-nextjs-clerk-convex-monorepo/
├── apps/
│   ├── web/              # Next.js app
│   └── native/           # Expo app (keep as placeholder)
├── packages/
│   └── backend/          # Convex backend
├── turbo.json
├── package.json
└── package-lock.json
```

### Key Files to Inspect After Clone

- `package.json` - Root workspace config
- `turbo.json` - Turborepo task definitions
- `apps/web/package.json` - Web app dependencies
- `apps/web/app/layout.tsx` - Root layout with Clerk
- `packages/backend/convex/schema.ts` - Current schema (to be replaced)

### Patterns to Follow

- Workspace references: `"@packages/backend": "*"`
- Import aliases: `@/` for app-local, `@packages/` for shared
- Clerk setup: Already configured with `ClerkProvider`

---

## 3. High-level Design

### Target Monorepo Structure

```
mission-control/
├── apps/
│   ├── web/                  # Next.js web app (main product)
│   ├── native/               # React Native (placeholder for v2)
│   └── runtime/              # Per-account runtime service (NEW)
├── packages/
│   ├── backend/              # Convex (from template)
│   ├── ui/                   # shadcn/ui components (NEW)
│   └── shared/               # Shared types/constants (NEW)
├── docs/                     # Documentation (exists)
├── turbo.json
├── package.json
└── README.md
```

### Setup Flow

1. Clone template into current directory (merge with existing)
2. Create new packages (`ui`, `shared`, `runtime`)
3. Install shadcn/ui in web app
4. Configure path aliases
5. Update Clerk configuration
6. Clean up template-specific code (notes app)
7. Verify build and dev server

---

## 4. File & Module Changes

### New Files to Create

| Path | Purpose |
|------|---------|
| `.nvmrc` | Node version specification (24) |
| `LICENSE` | MIT license file |
| `CONTRIBUTING.md` | Contribution guidelines |
| `.github/workflows/ci.yml` | CI pipeline (lint, typecheck, build) |
| `.github/workflows/deploy.yml` | CD pipeline (deploy to Vercel) |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR template |
| `.github/ISSUE_TEMPLATE/bug_report.md` | Bug report template |
| `.github/ISSUE_TEMPLATE/feature_request.md` | Feature request template |
| `apps/runtime/package.json` | Runtime service manifest |
| `apps/runtime/src/index.ts` | Entry point (placeholder) |
| `apps/runtime/tsconfig.json` | TypeScript config |
| `packages/ui/package.json` | UI package manifest |
| `packages/ui/src/lib/utils.ts` | cn() utility |
| `packages/ui/src/styles/globals.css` | Global styles + Tailwind |
| `packages/ui/components.json` | shadcn config |
| `packages/ui/tsconfig.json` | TypeScript config |
| `packages/shared/package.json` | Shared package manifest |
| `packages/shared/src/types/index.ts` | Type exports |
| `packages/shared/src/constants/index.ts` | Constant exports |
| `packages/shared/tsconfig.json` | TypeScript config |

### Existing Files to Modify

| Path | Changes |
|------|---------|
| `package.json` | Update name, add workspace paths |
| `turbo.json` | Add runtime to tasks |
| `apps/web/package.json` | Add ui/shared dependencies, shadcn deps |
| `apps/web/tsconfig.json` | Add path aliases |
| `apps/web/app/layout.tsx` | Clean up, prepare for dashboard |
| `apps/web/app/page.tsx` | Replace notes app with landing placeholder |
| `packages/backend/convex/schema.ts` | Will be replaced in Module 02 |

---

## 5. Step-by-Step Tasks

### Step 1: Clone and Merge Template

```bash
# In a temporary directory, clone the template
git clone https://github.com/get-convex/turbo-expo-nextjs-clerk-convex-monorepo.git temp-template

# Copy relevant files to mission-control (don't overwrite docs/)
# This step requires careful merging
```

**Files to copy from template:**
- `apps/` folder (entire)
- `packages/backend/` folder (entire)
- `turbo.json`
- `.prettierrc`
- `.gitignore` (merge with existing)

**Do NOT copy:**
- `README.md` (keep existing docs)
- `.git/` folder
- Any files that conflict with existing docs/

### Step 2: Update Root package.json

```json
{
  "name": "mission-control",
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "typecheck": "turbo run typecheck",
    "lint": "turbo run lint",
    "clean": "turbo run clean && rm -rf node_modules",
    "format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,md}\" --ignore-path .gitignore"
  },
  "devDependencies": {
    "prettier": "3.7.4",
    "turbo": "2.6.2"
  },
  "engines": {
    "node": ">=24.0.0"
  },
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "packageManager": "npm@10.9.2"
}
```

### Step 2.5: Create .nvmrc

Create `.nvmrc` in project root to enforce Node 24:

```
24
```

This allows developers to run `nvm use` and automatically switch to Node 24.

### Step 2.6: Create LICENSE (MIT)

Create `LICENSE` in project root:

```
MIT License

Copyright (c) 2026 Mission Control Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Step 2.7: Create CONTRIBUTING.md

Create `CONTRIBUTING.md` in project root:

```markdown
# Contributing to Mission Control

Thank you for your interest in contributing to Mission Control! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## Getting Started

### Prerequisites

- Node.js 24+ (use nvm: `nvm use`)
- npm 10+
- Git

### Local Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/mission-control.git
   cd mission-control
   ```

2. **Install dependencies**
   ```bash
   nvm use
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your Clerk and Convex keys
   ```

4. **Start development servers**
   ```bash
   # Terminal 1: Convex backend
   cd packages/backend && npx convex dev

   # Terminal 2: Web app
   npm run dev
   ```

5. **Verify setup**
   ```bash
   npm run typecheck
   npm run lint
   ```

## Development Workflow

### Branch Naming

Use descriptive branch names:
- `feat/feature-name` - New features
- `fix/bug-description` - Bug fixes
- `docs/what-changed` - Documentation updates
- `refactor/what-changed` - Code refactoring
- `test/what-tested` - Test additions

### Commit Messages

Follow conventional commits:
```
type(scope): description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:
- `feat(tasks): add drag-and-drop reordering`
- `fix(agents): resolve heartbeat timeout issue`
- `docs(readme): update installation instructions`

### Pull Request Process

1. **Create a feature branch**
   ```bash
   git checkout -b feat/your-feature
   ```

2. **Make your changes**
   - Write clean, documented code
   - Follow existing code patterns
   - Add tests for new functionality

3. **Run checks locally**
   ```bash
   npm run typecheck
   npm run lint
   npm run build
   ```

4. **Push and create PR**
   ```bash
   git push origin feat/your-feature
   ```
   Then open a Pull Request on GitHub.

5. **PR Review**
   - Fill out the PR template
   - Address reviewer feedback
   - Ensure CI passes

## Code Style

### TypeScript

- Use strict mode
- Prefer `interface` over `type` for objects
- Export functions, not arrow functions for components
- Use descriptive variable names with auxiliary verbs (`isLoading`, `hasError`)

### React/Next.js

- Use functional components
- Server components are default (no directive needed)
- Client components must have `"use client"` directive
- Colocate components with their routes when possible

### Convex

- Validate all inputs with `v` validators
- Always check authentication with `requireAuth`
- Scope all queries/mutations by `accountId`
- Log activities for important state changes

### Styling

- Use Tailwind CSS utility classes
- Follow mobile-first responsive design
- Use shadcn/ui components when available

## Testing

### Running Tests

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Build verification
npm run build
```

### Writing Tests

- Place unit tests next to the code they test
- Use descriptive test names
- Test edge cases and error conditions

## Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for exported functions
- Update API documentation for backend changes

## Getting Help

- Open an issue for bugs or feature requests
- Join discussions in existing issues
- Tag maintainers for urgent issues

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
```

### Step 2.8: Create GitHub Actions CI Pipeline

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint-and-typecheck:
    name: Lint & Typecheck
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint

      - name: Run typecheck
        run: npm run typecheck

  build:
    name: Build
    runs-on: ubuntu-latest
    needs: lint-and-typecheck

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Build all packages
        run: npm run build
        env:
          # Skip Convex type generation in CI (requires auth)
          SKIP_CONVEX_TYPEGEN: "true"

  # Optional: Add test job when tests are implemented
  # test:
  #   name: Test
  #   runs-on: ubuntu-latest
  #   needs: lint-and-typecheck
  #
  #   steps:
  #     - name: Checkout code
  #       uses: actions/checkout@v4
  #
  #     - name: Setup Node.js
  #       uses: actions/setup-node@v4
  #       with:
  #         node-version: "24"
  #         cache: "npm"
  #
  #     - name: Install dependencies
  #       run: npm ci
  #
  #     - name: Run tests
  #       run: npm test
```

### Step 2.9: Create GitHub Actions CD Pipeline

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false

jobs:
  deploy-convex:
    name: Deploy Convex Backend
    runs-on: ubuntu-latest
    environment: production

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Deploy Convex
        run: npx convex deploy --cmd 'npm run build'
        working-directory: packages/backend
        env:
          CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}

  deploy-web:
    name: Deploy Web App
    runs-on: ubuntu-latest
    needs: deploy-convex
    environment: production

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Build web app
        run: npm run build
        working-directory: apps/web
        env:
          NEXT_PUBLIC_CONVEX_URL: ${{ vars.NEXT_PUBLIC_CONVEX_URL }}
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${{ vars.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY }}

      # Option A: Deploy via Vercel CLI
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: "--prod"
          working-directory: apps/web

      # Option B: If using Vercel Git integration, this job can be simplified
      # to just trigger the deployment or skipped entirely (Vercel auto-deploys)
```

### Step 2.10: Create PR Template

Create `.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## Summary

<!-- Brief description of what this PR does -->

## Changes

- 
- 
- 

## Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update
- [ ] Refactoring (no functional changes)

## Testing

<!-- How has this been tested? -->

- [ ] Type checking passes (`npm run typecheck`)
- [ ] Linting passes (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] Manual testing completed

## Checklist

- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my code
- [ ] I have commented my code where necessary
- [ ] I have updated documentation as needed
- [ ] My changes generate no new warnings
- [ ] Any dependent changes have been merged

## Screenshots (if applicable)

<!-- Add screenshots for UI changes -->

## Related Issues

<!-- Link any related issues: Fixes #123, Relates to #456 -->
```

### Step 2.11: Create Issue Templates

Create `.github/ISSUE_TEMPLATE/bug_report.md`:

```markdown
---
name: Bug Report
about: Report a bug to help us improve
title: "[BUG] "
labels: bug
assignees: ""
---

## Bug Description

<!-- A clear and concise description of the bug -->

## Steps to Reproduce

1. Go to '...'
2. Click on '...'
3. Scroll down to '...'
4. See error

## Expected Behavior

<!-- What you expected to happen -->

## Actual Behavior

<!-- What actually happened -->

## Screenshots

<!-- If applicable, add screenshots -->

## Environment

- OS: [e.g., macOS 14.0]
- Browser: [e.g., Chrome 120]
- Node version: [e.g., 24.0.0]
- npm version: [e.g., 10.9.0]

## Additional Context

<!-- Add any other context about the problem -->
```

Create `.github/ISSUE_TEMPLATE/feature_request.md`:

```markdown
---
name: Feature Request
about: Suggest an idea for Mission Control
title: "[FEATURE] "
labels: enhancement
assignees: ""
---

## Problem Statement

<!-- What problem does this feature solve? -->

## Proposed Solution

<!-- Describe the solution you'd like -->

## Alternative Solutions

<!-- Any alternative solutions or features you've considered -->

## Use Cases

<!-- Who would benefit from this feature and how? -->

1. 
2. 
3. 

## Additional Context

<!-- Add any other context, mockups, or screenshots -->
```

### Step 3: Update turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "ui": "tui",
  "tasks": {
    "build": {
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"],
      "dependsOn": ["^build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

### Step 4: Create packages/ui Package

**packages/ui/package.json:**
```json
{
  "name": "@packages/ui",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    "./components/*": "./src/components/*.tsx",
    "./hooks/*": "./src/hooks/*.ts",
    "./lib/*": "./src/lib/*.ts",
    "./styles/*": "./src/styles/*.css"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/"
  },
  "dependencies": {
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^3.4.0"
  },
  "devDependencies": {
    "@types/react": "19.2.7",
    "@types/react-dom": "19.2.3",
    "typescript": "5.9.3"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

**packages/ui/src/lib/utils.ts:**
```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind CSS classes with proper precedence.
 * Combines clsx for conditional classes and tailwind-merge for deduplication.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**packages/ui/src/index.ts:**
```typescript
export { cn } from "./lib/utils";
```

**packages/ui/tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "declaration": true,
    "declarationMap": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

**packages/ui/components.json (for shadcn):**
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/globals.css",
    "baseColor": "zinc",
    "cssVariables": true
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@packages/ui/components",
    "utils": "@packages/ui/lib/utils",
    "hooks": "@packages/ui/hooks",
    "lib": "@packages/ui/lib",
    "ui": "@packages/ui/components"
  }
}
```

**packages/ui/src/styles/globals.css:**
```css
@import "tailwindcss";

@theme {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
}

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 3.9%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 240 5.9% 10%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;
    --popover: 240 10% 3.9%;
    --popover-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 240 4.9% 83.9%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

### Step 5: Create packages/shared Package

**packages/shared/package.json:**
```json
{
  "name": "@packages/shared",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./types/*": "./src/types/*.ts",
    "./constants/*": "./src/constants/*.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "5.9.3"
  }
}
```

**packages/shared/src/types/index.ts:**
```typescript
/**
 * Task status values for Kanban workflow.
 * Canonical states: inbox → assigned → in_progress → review → done
 * Special state: blocked (can be entered from assigned or in_progress)
 */
export type TaskStatus = 
  | "inbox"
  | "assigned"
  | "in_progress"
  | "review"
  | "done"
  | "blocked";

/**
 * Agent status indicating current operational state.
 */
export type AgentStatus = 
  | "online"
  | "busy"
  | "idle"
  | "offline"
  | "error";

/**
 * User roles within an account.
 */
export type MemberRole = 
  | "owner"
  | "admin"
  | "member";

/**
 * Recipient type for notifications.
 */
export type RecipientType = 
  | "user"
  | "agent";

/**
 * Activity types for audit trail.
 */
export type ActivityType =
  | "task_created"
  | "task_updated"
  | "task_status_changed"
  | "message_created"
  | "document_created"
  | "document_updated"
  | "agent_status_changed"
  | "runtime_status_changed"
  | "member_added"
  | "member_removed";

/**
 * Document types.
 */
export type DocumentType =
  | "deliverable"
  | "note"
  | "template"
  | "reference";

/**
 * Notification types.
 */
export type NotificationType =
  | "mention"
  | "assignment"
  | "thread_update"
  | "status_change";

/**
 * Skill category types.
 * Defines what kind of capability the skill provides.
 */
export type SkillCategory =
  | "mcp_server"    // External MCP server integration
  | "tool"          // Built-in tool capability
  | "integration"   // Third-party service integration
  | "custom";       // Custom skill definition

/**
 * Available LLM models for OpenClaw.
 */
export type LLMModel =
  | "claude-sonnet-4-20250514"
  | "claude-opus-4-20250514"
  | "gpt-4o"
  | "gpt-4o-mini";

/**
 * OpenClaw configuration for agents.
 */
export interface OpenClawConfig {
  model: LLMModel;
  temperature: number;
  maxTokens?: number;
  systemPromptPrefix?: string;
  skillIds: string[];
  contextConfig?: {
    maxHistoryMessages: number;
    includeTaskContext: boolean;
    includeTeamContext: boolean;
    customContextSources?: string[];
  };
  rateLimits?: {
    requestsPerMinute: number;
    tokensPerDay?: number;
  };
  behaviorFlags?: {
    canCreateTasks: boolean;
    canModifyTaskStatus: boolean;
    canCreateDocuments: boolean;
    canMentionAgents: boolean;
    requiresApprovalForActions?: string[];
  };
}
```

**packages/shared/src/constants/index.ts:**
```typescript
import type { TaskStatus } from "../types";

/**
 * Ordered list of task statuses for Kanban columns.
 */
export const TASK_STATUS_ORDER: TaskStatus[] = [
  "inbox",
  "assigned",
  "in_progress",
  "review",
  "done",
];

/**
 * Human-readable labels for task statuses.
 */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: "Inbox",
  assigned: "Assigned",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
  blocked: "Blocked",
};

/**
 * Valid status transitions.
 * Key = current status, Value = array of allowed next statuses.
 */
export const TASK_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  inbox: ["assigned"],
  assigned: ["in_progress", "blocked"],
  in_progress: ["review", "blocked"],
  review: ["done", "in_progress"],
  done: [],
  blocked: ["assigned", "in_progress"],
};

/**
 * Available LLM models for agent configuration.
 */
export const AVAILABLE_MODELS = [
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (Recommended)" },
  { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
] as const;

/**
 * Skill category labels for UI display.
 */
export const SKILL_CATEGORY_LABELS = {
  mcp_server: "MCP Server",
  tool: "Tool",
  integration: "Integration",
  custom: "Custom",
} as const;

/**
 * Default OpenClaw configuration for new agents.
 */
export const DEFAULT_OPENCLAW_CONFIG = {
  model: "claude-sonnet-4-20250514",
  temperature: 0.7,
  maxTokens: 4096,
  skillIds: [],
  contextConfig: {
    maxHistoryMessages: 50,
    includeTaskContext: true,
    includeTeamContext: true,
  },
  behaviorFlags: {
    canCreateTasks: false,
    canModifyTaskStatus: true,
    canCreateDocuments: true,
    canMentionAgents: true,
  },
} as const;
```

**packages/shared/src/index.ts:**
```typescript
export * from "./types";
export * from "./constants";
```

**packages/shared/tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "declaration": true,
    "declarationMap": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

### Step 6: Create apps/runtime Placeholder

**apps/runtime/package.json:**
```json
{
  "name": "runtime-service",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@packages/shared": "*",
    "convex": "^1.29.3"
  },
  "devDependencies": {
    "@types/node": "^24.10.1",
    "tsx": "^4.7.0",
    "typescript": "5.9.3"
  }
}
```

**apps/runtime/src/index.ts:**
```typescript
/**
 * Mission Control Runtime Service
 * 
 * This service runs per-account and manages:
 * - OpenClaw gateway and agent sessions
 * - Notification delivery to agents
 * - Agent heartbeat scheduling
 * - Health check endpoint
 * 
 * Implementation details in Module 13.
 */

console.log("Mission Control Runtime Service");
console.log("This is a placeholder. See Module 13 for full implementation.");

// Placeholder for health check
const PORT = process.env.PORT || 3001;

// TODO: Implement in Module 13
// - Gateway initialization
// - Delivery loop
// - Heartbeat scheduler
// - Health endpoint
```

**apps/runtime/tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "declaration": true,
    "baseUrl": ".",
    "paths": {
      "@packages/shared": ["../../packages/shared/src"],
      "@packages/backend": ["../../packages/backend"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**apps/runtime/Dockerfile:**
```dockerfile
FROM node:24-alpine

WORKDIR /app

# Copy workspace files
COPY package.json package-lock.json ./
COPY apps/runtime/package.json ./apps/runtime/
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/

# Install dependencies
RUN npm ci

# Copy source
COPY apps/runtime ./apps/runtime
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend

# Build
WORKDIR /app/apps/runtime
RUN npm run build

# Run
CMD ["node", "dist/index.js"]
```

### Step 7: Update apps/web Configuration

**Update apps/web/package.json dependencies:**
```json
{
  "dependencies": {
    "@packages/backend": "*",
    "@packages/shared": "*",
    "@packages/ui": "*",
    // ... existing deps
  }
}
```

**Update apps/web/tsconfig.json paths:**
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"],
      "@packages/ui/*": ["../../packages/ui/src/*"],
      "@packages/shared/*": ["../../packages/shared/src/*"],
      "@packages/backend": ["../../packages/backend"]
    }
  }
}
```

**Create apps/web/components.json (for shadcn):**
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "../../packages/ui/src/styles/globals.css",
    "baseColor": "zinc",
    "cssVariables": true
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "hooks": "@/hooks",
    "lib": "@/lib",
    "utils": "@packages/ui/lib/utils",
    "ui": "@packages/ui/components"
  }
}
```

### Step 8: Clean Up Template Code

**Remove template-specific files:**
- Delete or empty `packages/backend/convex/notes.ts` (template's notes app)
- Update `apps/web/app/page.tsx` to a simple landing placeholder
- Update `apps/web/app/layout.tsx` to import global styles from packages/ui

**apps/web/app/page.tsx (placeholder):**
```tsx
/**
 * Landing page for Mission Control.
 * Full implementation in Module 09.
 */
export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold">Mission Control</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Multi-agent coordination dashboard
      </p>
    </main>
  );
}
```

### Step 9: Install shadcn/ui Base Components

```bash
# From apps/web directory
cd apps/web
npx shadcn@latest add button card input label
```

### Step 10: Verify Setup

```bash
# Install all dependencies
npm install

# Run type check
npm run typecheck

# Start dev server
npm run dev
```

---

## 6. Edge Cases & Risks

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Path alias conflicts | Build failures | Verify all tsconfig.json paths match |
| Missing peer deps | Runtime errors | Check React version consistency |
| Tailwind v4 breaking | Styling issues | Follow shadcn v4 migration guide |
| Workspace resolution | Import failures | Use `"*"` for local package versions |

### Edge Cases

- **Package manager**: We use npm (not Yarn) for this project
- **Node version**: Requires Node 24+; use nvm to manage versions
- **Convex auth**: Keep Clerk setup from template; don't change auth provider

---

## 7. Testing Strategy

### Manual Verification

- [ ] `npm install` completes without errors
- [ ] `npm run typecheck` passes for all packages
- [ ] `npm run dev` starts Next.js on localhost:3000
- [ ] Landing page renders at http://localhost:3000
- [ ] No console errors in browser

### Smoke Tests

- [ ] Import from `@packages/ui` works in web app
- [ ] Import from `@packages/shared` works in web app
- [ ] Convex client connects (check Convex dashboard)

---

## 8. Rollout / Migration

Not applicable for initial setup.

---

## 9. TODO Checklist

### Setup

- [ ] Verify nvm is installed and Node 24 is active
- [ ] Clone template repository
- [ ] Copy relevant files to mission-control
- [ ] Create `.nvmrc` with "24"
- [ ] Update root `package.json`
- [ ] Update `turbo.json`

### License & Contribution

- [ ] Create `LICENSE` (MIT)
- [ ] Create `CONTRIBUTING.md`

### GitHub Actions (CI/CD)

- [ ] Create `.github/workflows/ci.yml`
- [ ] Create `.github/workflows/deploy.yml`
- [ ] Create `.github/PULL_REQUEST_TEMPLATE.md`
- [ ] Create `.github/ISSUE_TEMPLATE/bug_report.md`
- [ ] Create `.github/ISSUE_TEMPLATE/feature_request.md`

### Packages

- [ ] Create `packages/ui/package.json`
- [ ] Create `packages/ui/src/lib/utils.ts`
- [ ] Create `packages/ui/src/styles/globals.css`
- [ ] Create `packages/ui/components.json`
- [ ] Create `packages/ui/tsconfig.json`
- [ ] Create `packages/shared/package.json`
- [ ] Create `packages/shared/src/types/index.ts`
- [ ] Create `packages/shared/src/constants/index.ts`
- [ ] Create `packages/shared/tsconfig.json`

### Runtime

- [ ] Create `apps/runtime/package.json`
- [ ] Create `apps/runtime/src/index.ts`
- [ ] Create `apps/runtime/tsconfig.json`
- [ ] Create `apps/runtime/Dockerfile`

### Web App

- [ ] Update `apps/web/package.json` with new dependencies
- [ ] Update `apps/web/tsconfig.json` with path aliases
- [ ] Create `apps/web/components.json` for shadcn
- [ ] Clean up template code (remove notes app references)
- [ ] Update landing page placeholder

### Verification

- [ ] Run `npm install`
- [ ] Run `npm run typecheck`
- [ ] Run `npm run dev`
- [ ] Verify landing page renders
- [ ] Commit: `feat(setup): initialize mission control monorepo`

---

## Completion Criteria

This module is complete when:

1. All packages are created and configured
2. `LICENSE` (MIT) file exists in project root
3. `CONTRIBUTING.md` file exists with setup instructions
4. `.github/workflows/ci.yml` exists and is valid YAML
5. `.github/workflows/deploy.yml` exists and is valid YAML
6. `npm install` succeeds
7. `npm run typecheck` passes
8. `npm run dev` starts without errors
9. Landing page renders at localhost:3000
10. Git commit made with all changes
