# OpenClaw Mission Control (OpenClaw / Clawdbot) — Clean Reference Notes

> Clean, structured **paraphrase** of Bhanu Teja P's article on X about building "OpenClaw Mission Control" (a multi-agent squad orchestrated with OpenClaw/Clawdbot + a shared Convex app).  
> Source: https://x.com/pbteja1998/status/2017662163540971756

---

## 1) Why OpenClaw Mission Control exists

Many AI assistants behave like a "single chat box":
- no durable continuity
- context scattered across chat threads
- hard to track work over time

The goal of OpenClaw Mission Control is to make AI **behave like a team**:
- agents have roles and persistent context
- tasks are assigned and tracked
- collaboration happens in shared threads
- progress is visible via activity + status

---

## 2) The foundation: OpenClaw / Clawdbot concepts

### Gateway (the always-on core)
- Runs 24/7 as a background service (daemon)
- Routes messages to sessions
- Manages active sessions and scheduled jobs
- Exposes a control API (commonly WebSocket) for orchestration

Example (conceptual):
```bash
clawdbot gateway start
```

### Sessions (the key primitive)
A **session** is a persistent conversation identity:
- unique session key (e.g. `agent:seo-analyst:main`)
- separate history per session
- independent system prompt + tools + workspace

High-level flow:
```text
Message comes in → Gateway routes → Session loads history → Model responds → History persists
```

### Cron jobs (scheduled wake-ups)
Agents don't need to run "always-on". Instead:
- wake on a schedule
- check for work
- act or go back to sleep

Example (conceptual):
```bash
clawdbot cron add --name "agent-heartbeat" --cron "*/15 * * * *" --message "Check for work…"
```

### Workspace (file-based persistence)
Agents keep durable context by writing files inside a workspace folder:
- shared scripts/utilities
- memory files
- configs

Rule of thumb:
> If it must be remembered, write it to a file.

---

## 3) From one agent to many (a "squad")

Core insight:
- "10 agents" = "10 sessions", each with its own identity and context

Each agent/session gets:
- a role
- a personality prompt (SOUL file)
- tools + access
- its own heartbeat schedule (staggered to avoid spikes)

Example session naming (illustrative):
```text
agent:main:main                 → Squad lead (Jarvis)
agent:product-analyst:main      → Shuri
agent:customer-researcher:main  → Fury
agent:seo-analyst:main          → Vision
...
```

---

## 4) The shared brain: OpenClaw Mission Control app (Convex)

Multiple isolated sessions still need shared coordination.
OpenClaw Mission Control provides the "office":
- a shared task board (Kanban)
- threaded comments and history
- documents/deliverables in one place
- real-time activity feed
- @mentions + notifications

### Why Convex (as described)
- real-time updates
- TypeScript-first workflow
- serverless operations (less infra)
- fast iteration for dashboards

### Core tables (conceptual schema)
A minimal version of the shared state includes:

- **agents**: identity, role, status, session key, current task
- **tasks**: title/description/status/assignees
- **messages**: threaded task comments, attachments
- **activities**: events for the live feed
- **documents**: markdown deliverables and notes
- **notifications**: mention + subscription delivery queue

Example operations (conceptual):
```bash
# create a comment
npx convex run messages:create '{ "taskId": "...", "content": "..." }'

# update task status
npx convex run tasks:update '{ "id": "...", "status": "review" }'

# create a doc
npx convex run documents:create '{ "title": "...", "content": "...", "type": "deliverable" }'
```

---

## 5) UI: what OpenClaw Mission Control shows

A typical dashboard includes:
- **Kanban board**: Inbox → Assigned → In Progress → Review → Done
- **Agent roster**: who's online, status, current work
- **Live feed**: a real-time log of activity + comments
- **Task detail**: one place to see the whole thread + docs

Design principle:
- make it comfortable to stare at all day
- make progress visible without digging

---

## 6) SOUL system: giving agents identity

Each agent gets its own "SOUL" file:
- name + role
- personality constraints (how they think / write)
- what they're good at
- what they care about

Why it matters:
- "generalist agents" are often bland
- constraints produce sharper outputs (e.g., "skeptical tester" finds edge cases)

There's also an "AGENTS" operational manual:
- where memory files live
- how to use the task system
- when to speak vs. stay quiet
- conventions for writing results

---

## 7) Memory and persistence (multi-layer)

A practical memory stack:

1. **Session history** (the agent's own conversation log)
2. **Working memory** (current task state; updated often)
3. **Daily notes** (what happened today; chronological)
4. **Long-term memory** (stable facts + decisions; curated)

Golden rule (again):
> Durable memory is file-based, not "mental".

---

## 8) Heartbeat loop (keeping costs sane)

Instead of paying for idle agents, each agent:
- wakes periodically (e.g., every 15 minutes)
- checks mentions / assigned tasks / feed
- does work or reports "OK"
- sleeps again

Staggered schedules reduce concurrency spikes.

---

## 9) Mentions + notifications daemon (the "nervous system")

Mention model:
- `@Vision` notifies Vision
- `@all` notifies everyone

Delivery model:
- a background worker polls for undelivered notifications
- it tries to push the content to the relevant agent session
- if the agent is asleep, it stays queued until the next wake cycle

Thread subscriptions solve the "mention everyone" problem:
- interacting with a task subscribes you
- subscribers get future updates automatically

---

## 10) Daily standup summary

A scheduled job compiles:
- what completed today
- what's in progress
- what's blocked
- what needs review
- key decisions

Purpose:
- visibility without constant monitoring
- lightweight accountability

---

## 11) Task lifecycle (how work flows)

Canonical states:
- **Inbox** → **Assigned** → **In Progress** → **Review** → **Done**
- plus **Blocked** when stuck

Collaboration pattern:
- research agents contribute context
- specialists add evidence and constraints
- writers/designers turn it into deliverables
- lead reviews and closes

Everything happens inside a single task thread for traceability.

---

## 12) Lessons learned (practical takeaways)

- Start with 2–3 agents; scale later
- Use cheaper models for routine checks (heartbeats)
- Memory requires discipline; write decisions down
- Encourage agents to contribute beyond assignments (feed scanning can help)

---

## 13) Minimal replication checklist (condensed)

1. Install and start the gateway
2. Create 2 agents (lead + specialist)
3. Write SOUL files
4. Add staggered heartbeat crons
5. Build a shared task system (Convex/Notion/anything durable)
6. Add notifications + subscriptions when collaboration grows
7. Add daily standup when you need oversight

---

## 14) Roster (example roles)

- **Squad lead**: delegates, reviews, monitors
- **Product analyst**: skeptical testing + UX breakpoints
- **Researcher**: sources + evidence
- **SEO analyst**: keyword intent + structure
- **Writer**: crisp output and style control
- **Social**: hooks + threads
- **Designer**: visuals and layout
- **Email**: lifecycle campaigns
- **Developer**: implements and debugs
- **Documentation**: organizes knowledge

---

### Notes for your own build
If your product includes "one server per customer account", treat that as part of the core architecture:
- agents live with their account runtime
- the shared app remains the coordination brain
- notifications bridge the two worlds (Convex ↔ runtime)
