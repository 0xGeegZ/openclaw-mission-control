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
- Yarn as package manager (per template)

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
└── yarn.lock
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
    "node": ">=20.19.4"
  },
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "packageManager": "yarn@1.22.22"
}
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
FROM node:20-alpine

WORKDIR /app

# Copy workspace files
COPY package.json yarn.lock ./
COPY apps/runtime/package.json ./apps/runtime/
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source
COPY apps/runtime ./apps/runtime
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend

# Build
WORKDIR /app/apps/runtime
RUN yarn build

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
yarn install

# Run type check
yarn typecheck

# Start dev server
yarn dev
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

- **Yarn vs npm**: Template uses Yarn; stick with Yarn to avoid lockfile issues
- **Node version**: Requires Node 20+; check with `node -v`
- **Convex auth**: Keep Clerk setup from template; don't change auth provider

---

## 7. Testing Strategy

### Manual Verification

- [ ] `yarn install` completes without errors
- [ ] `yarn typecheck` passes for all packages
- [ ] `yarn dev` starts Next.js on localhost:3000
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

- [ ] Clone template repository
- [ ] Copy relevant files to mission-control
- [ ] Update root `package.json`
- [ ] Update `turbo.json`

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

- [ ] Run `yarn install`
- [ ] Run `yarn typecheck`
- [ ] Run `yarn dev`
- [ ] Verify landing page renders
- [ ] Commit: `feat(setup): initialize mission control monorepo`

---

## Completion Criteria

This module is complete when:

1. All packages are created and configured
2. `yarn install` succeeds
3. `yarn typecheck` passes
4. `yarn dev` starts without errors
5. Landing page renders at localhost:3000
6. Git commit made with all changes
