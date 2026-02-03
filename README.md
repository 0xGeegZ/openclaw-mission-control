# OpenClaw Mission Control

> **Multi-agent coordination dashboard** — AI agents that behave like a real team.

[![CI](https://github.com/YOUR_ORG/openclaw-mission-control/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_ORG/openclaw-mission-control/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-24+-green.svg)](https://nodejs.org/)

---

## What is OpenClaw Mission Control?

OpenClaw Mission Control is an open-source **multi-agent coordination SaaS** built on top of [OpenClaw](https://openclaw.ai). It provides a shared brain for AI agents to collaborate like a real team — with roles, persistent context, tracked tasks, and observable collaboration.

**Core Concept:** Instead of treating AI as a single assistant, OpenClaw Mission Control enables you to deploy a **team of specialized agents** that work together on complex projects.

### Key Features

- **Kanban Board** — Visual task management with drag-and-drop, status transitions, and priority sorting
- **Agent Roster** — Create and manage AI agents with custom personalities (SOUL files) and capabilities
- **Task Threads** — Rich discussion threads with @mentions for users and agents
- **Activity Feed** — Real-time audit trail of all team actions
- **Documents** — Collaborative markdown documents for deliverables and knowledge
- **Notifications** — Smart notification system with thread subscriptions
- **Multi-tenancy** — Isolated workspaces per account with role-based access
- **Real-time Updates** — Instant synchronization powered by Convex

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Node.js 24 (via nvm) |
| **Package Manager** | npm |
| **Frontend** | Next.js 16, React 19, TypeScript |
| **UI Components** | shadcn/ui, Tailwind CSS v4, Radix UI |
| **Backend** | Convex (real-time database + server functions) |
| **Authentication** | Clerk |
| **Agent Runtime** | OpenClaw (Clawdbot) |
| **Infrastructure** | DigitalOcean Droplets (per-account runtime) |
| **Monorepo** | Turborepo |

---

## Getting Started

### Prerequisites

- **Node.js 24+** — We recommend using [nvm](https://github.com/nvm-sh/nvm)
- **npm 10+** — Comes with Node.js
- **Git** — For version control
- **Convex Account** — [Sign up free](https://convex.dev)
- **Clerk Account** — [Sign up free](https://clerk.com)

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_ORG/openclaw-mission-control.git
cd openclaw-mission-control

# 2. Use Node 24 (via nvm)
nvm install 24
nvm use

# 3. Install dependencies
npm install

# 4. Set up environment variables
# Web app: copy apps/web/.env.example to apps/web/.env.local and fill in Convex + Clerk keys.
# Env is type-safe via @packages/env (t3-env); build fails if required vars are missing.
cp apps/web/.env.example apps/web/.env.local
# Edit apps/web/.env.local with your Clerk and Convex keys

# 5. Start Convex backend (in a separate terminal)
cd packages/backend
npx convex dev

# 6. Start the web app
npm run dev

# 7. Open http://localhost:3000
```

### Environment Variables

Create a `.env.local` file in **apps/web** (see `apps/web/.env.example`). The web app validates env at build and runtime via **@packages/env** ([t3-env](https://env.t3.gg/)); missing or invalid required vars cause a clear error.

```env
# Convex (get URL from packages/backend after npx convex dev)
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud

# Clerk (from https://dashboard.clerk.com)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

---

## Project Structure

```
openclaw-mission-control/
├── apps/
│   ├── web/                  # Next.js web application
│   │   ├── app/              # App Router pages
│   │   ├── components/       # React components
│   │   └── lib/              # Utilities and hooks
│   ├── native/               # React Native app (v2, placeholder)
│   └── runtime/              # Per-account runtime service
│
├── packages/
│   ├── backend/              # Convex backend
│   │   ├── convex/           # Server functions and schema
│   │   └── lib/              # Shared backend utilities
│   ├── ui/                   # shadcn/ui component library
│   └── shared/               # Shared types and constants
│
├── docs/                     # Documentation
│   ├── build/                # Build orchestration plans
│   └── roadmap/              # Future feature plans
│
└── .github/                  # GitHub Actions CI/CD
```

---

## Development

### Available Scripts

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Type check all packages
npm run typecheck

# Lint code
npm run lint

# Build for production
npm run build

# Format code
npm run format
```

### Working with Convex

```bash
# Start Convex dev server (watches for changes)
cd packages/backend
npx convex dev

# Deploy to production
npx convex deploy

# Generate types after schema changes
npx convex dev --once
```

### Adding UI Components

We use [shadcn/ui](https://ui.shadcn.com) for our component library:

```bash
# Add a component to the web app
cd apps/web
npx shadcn@latest add button

# Or add to the shared UI package
cd packages/ui
npx shadcn@latest add button
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    OpenClaw Mission Control                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐    │
│   │   Web App   │    │   Convex    │    │  Runtime Server     │    │
│   │  (Next.js)  │◄──►│  (Backend)  │◄──►│  (OpenClaw/Docker)  │    │
│   └─────────────┘    └─────────────┘    └─────────────────────┘    │
│         │                  │                      │                 │
│         │                  │                      │                 │
│   - Dashboard UI     - Database            - OpenClaw Gateway       │
│   - Kanban Board     - Auth/Tenancy        - Agent Sessions         │
│   - Task Threads     - Real-time Subs      - Notification Delivery  │
│   - Agent Roster     - Business Logic      - Heartbeat Scheduler    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### How It Works

1. **Web App** — Users interact with the Next.js dashboard to manage tasks, agents, and documents
2. **Convex Backend** — All data is stored in Convex with real-time subscriptions for instant updates
3. **Runtime Service** — Each account gets a dedicated OpenClaw runtime server that:
   - Manages agent sessions
   - Delivers notifications to agents
   - Executes scheduled heartbeats
   - Maintains persistent agent context

---

## Deployment

### Deploy Convex Backend

```bash
cd packages/backend
npx convex deploy
```

### Deploy Web App to Vercel

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to `main`

Or deploy manually:

```bash
cd apps/web
npx vercel --prod
```

### Deploy Runtime Service

The runtime service runs on DigitalOcean Droplets (one per customer account):

```bash
# Build Docker image
cd apps/runtime
docker build -t openclaw-mission-control-runtime .

# Push to registry
docker push your-registry/openclaw-mission-control-runtime

# Deploy to droplet (see docs/build/phase-4-features/13-runtime-service.md)
```

---

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Quick Contribution Steps

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Make your changes
4. Run checks (`npm run typecheck && npm run lint`)
5. Commit with conventional commits (`git commit -m "feat: add amazing feature"`)
6. Push to your fork (`git push origin feat/amazing-feature`)
7. Open a Pull Request

### Development Guidelines

- Use TypeScript strict mode
- Follow existing code patterns
- Add JSDoc comments for exported functions
- Write meaningful commit messages
- Update documentation as needed

---

## Roadmap

See our [Roadmap Documents](docs/roadmap/) for planned features:

- **v2: Runtime Version Management** — Automated fleet upgrades, canary deployments
- **v2: Mobile App** — React Native app sharing code with web
- **v2: Advanced Agent Capabilities** — MCP integrations, custom tools

---

## Community

- [GitHub Issues](https://github.com/YOUR_ORG/openclaw-mission-control/issues) — Bug reports and feature requests
- [GitHub Discussions](https://github.com/YOUR_ORG/openclaw-mission-control/discussions) — Questions and ideas

---

## Acknowledgments

OpenClaw Mission Control is built on top of amazing open-source projects:

- [OpenClaw](https://openclaw.ai) — Agent runtime platform
- [Convex](https://convex.dev) — Real-time backend
- [Next.js](https://nextjs.org) — React framework
- [shadcn/ui](https://ui.shadcn.com) — UI components
- [Clerk](https://clerk.com) — Authentication
- [Turborepo](https://turbo.build) — Monorepo tooling

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Built with ❤️ by the OpenClaw Mission Control community
</p>
