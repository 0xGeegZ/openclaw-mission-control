# Module 12: UI Agents & Activity Feed

> Implement agent roster and activity feed pages.

---

## ESSENTIAL CONTEXT — READ FIRST

**Before implementing this module, you MUST read:**

1. **`docs/mission-control-initial-article.md`** — Agent roster, SOUL concept (Sections 3, 8)
2. **`docs/mission-control-cursor-core-instructions.md`** — Agent schema (Section 4.4)
3. **`.cursor/rules/02-ui-components.mdc`** — Component patterns

**Key understanding:**
- Agent status = online, busy, idle, offline, error
- Heartbeat shows last check-in time
- Activity feed = real-time audit trail
- Each activity links to target (task, document, etc.)

---

## 1. Context & Goal

Implement two key views:
1. **Agent Roster**: List of all agents with status, current task
2. **Activity Feed**: Real-time stream of all account activity

---

## 2. Files to Create

| Path | Purpose |
|------|---------|
| `apps/web/app/(dashboard)/[accountSlug]/agents/page.tsx` | Agents page |
| `apps/web/components/agents/AgentRoster.tsx` | Agent list |
| `apps/web/components/agents/AgentCard.tsx` | Single agent card |
| `apps/web/components/agents/CreateAgentDialog.tsx` | Create agent modal |
| `apps/web/app/(dashboard)/[accountSlug]/feed/page.tsx` | Activity feed page |
| `apps/web/components/feed/ActivityFeed.tsx` | Activity list |
| `apps/web/components/feed/ActivityItem.tsx` | Single activity |

---

## 3. Agent Roster Design

```
┌─────────────────────────────────────────────────────────────────┐
│ Agents                                           [+ Add Agent]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ 🟢 Jarvis    │  │ 🟡 Vision    │  │ ⚫ Shuri     │          │
│  │ Squad Lead   │  │ SEO Analyst  │  │ Product Ana. │          │
│  │              │  │              │  │              │          │
│  │ Working on:  │  │ Working on:  │  │ Offline      │          │
│  │ "Homepage.." │  │ "SEO Audit"  │  │              │          │
│  │              │  │              │  │              │          │
│  │ Last: 2m ago │  │ Last: 5m ago │  │ Last: 1h ago │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Agent Card Component

```typescript
// apps/web/components/agents/AgentCard.tsx
"use client";

import { Doc } from "@packages/backend/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@packages/ui/components/card";
import { Avatar, AvatarFallback, AvatarImage } from "@packages/ui/components/avatar";
import { Badge } from "@packages/ui/components/badge";
import { cn } from "@packages/ui/lib/utils";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

interface AgentCardProps {
  agent: Doc<"agents"> & { 
    currentTask: { _id: string; title: string; status: string } | null 
  };
  accountSlug: string;
}

const statusColors = {
  online: "bg-green-500",
  busy: "bg-yellow-500",
  idle: "bg-blue-500",
  offline: "bg-gray-500",
  error: "bg-red-500",
};

export function AgentCard({ agent, accountSlug }: AgentCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={agent.avatarUrl} />
            <AvatarFallback>{agent.name[0]}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div 
                className={cn(
                  "w-2 h-2 rounded-full",
                  statusColors[agent.status]
                )}
              />
              <CardTitle className="text-base truncate">{agent.name}</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">{agent.role}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {agent.currentTask ? (
          <div className="text-sm">
            <span className="text-muted-foreground">Working on: </span>
            <Link 
              href={`/${accountSlug}/tasks/${agent.currentTask._id}`}
              className="hover:underline"
            >
              {agent.currentTask.title}
            </Link>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No active task</p>
        )}
        
        {agent.lastHeartbeat && (
          <p className="text-xs text-muted-foreground mt-2">
            Last seen: {formatDistanceToNow(agent.lastHeartbeat, { addSuffix: true })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

---

## 5. Activity Feed Design

```
┌─────────────────────────────────────────────────────────────────┐
│ Activity Feed                                     [Filter ▾]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ○ 2 minutes ago                                                │
│  │ 👤 John created task "Update homepage design"                │
│  │                                                              │
│  ○ 5 minutes ago                                                │
│  │ 🤖 Vision changed "SEO Audit" to In Progress                 │
│  │                                                              │
│  ○ 10 minutes ago                                               │
│  │ 👤 Sarah commented on "API Integration"                      │
│  │                                                              │
│  ○ 15 minutes ago                                               │
│  │ 🤖 Jarvis created document "Q4 Strategy Draft"               │
│                                                                 │
│  [Load more...]                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Activity Item Component

```typescript
// apps/web/components/feed/ActivityItem.tsx
"use client";

import { Doc } from "@packages/backend/convex/_generated/dataModel";
import { Avatar, AvatarFallback } from "@packages/ui/components/avatar";
import { getActivityDescription } from "@packages/backend/convex/lib/activity";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

interface ActivityItemProps {
  activity: Doc<"activities">;
  accountSlug: string;
}

const actorIcons = {
  user: "👤",
  agent: "🤖",
  system: "⚙️",
};

export function ActivityItem({ activity, accountSlug }: ActivityItemProps) {
  return (
    <div className="flex gap-3 py-3 border-b last:border-0">
      <div className="flex flex-col items-center">
        <span className="text-lg">{actorIcons[activity.actorType]}</span>
        <div className="flex-1 w-px bg-border mt-2" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{activity.actorName}</span>
          <span className="text-muted-foreground">
            {getActivityDescription(activity.type, activity.actorName, activity.targetName)}
          </span>
        </div>
        
        <p className="text-xs text-muted-foreground mt-1">
          {formatDistanceToNow(activity.createdAt, { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}
```

---

## 7. Agents Page

```typescript
// apps/web/app/(dashboard)/[accountSlug]/agents/page.tsx
"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useAccount } from "@/lib/hooks/useAccount";
import { AgentCard } from "@/components/agents/AgentCard";
import { CreateAgentDialog } from "@/components/agents/CreateAgentDialog";
import { Button } from "@packages/ui/components/button";
import { Plus } from "lucide-react";

export default function AgentsPage({ params }) {
  const { accountSlug } = use(params);
  const { accountId } = useAccount();
  const [showCreate, setShowCreate] = useState(false);
  
  const roster = useQuery(
    api.agents.getRoster,
    accountId ? { accountId } : "skip"
  );
  
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Agents</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Agent
        </Button>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {roster?.map((agent) => (
          <AgentCard key={agent._id} agent={agent} accountSlug={accountSlug} />
        ))}
      </div>
      
      <CreateAgentDialog open={showCreate} onOpenChange={setShowCreate} />
    </div>
  );
}
```

---

## 8. Activity Feed Page

```typescript
// apps/web/app/(dashboard)/[accountSlug]/feed/page.tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useAccount } from "@/lib/hooks/useAccount";
import { ActivityItem } from "@/components/feed/ActivityItem";

export default function FeedPage({ params }) {
  const { accountSlug } = use(params);
  const { accountId } = useAccount();
  
  const activities = useQuery(
    api.activities.list,
    accountId ? { accountId, limit: 50 } : "skip"
  );
  
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Activity Feed</h1>
      
      <div className="space-y-0">
        {activities?.map((activity) => (
          <ActivityItem 
            key={activity._id} 
            activity={activity} 
            accountSlug={accountSlug} 
          />
        ))}
      </div>
    </div>
  );
}
```

---

## 9. TODO Checklist

### Agents
- [ ] Create AgentCard component
- [ ] Create AgentRoster component
- [ ] Create CreateAgentDialog
- [ ] Update agents page
- [ ] Test agent list display
- [ ] Test create agent

### Activity Feed
- [ ] Create ActivityItem component
- [ ] Create ActivityFeed component
- [ ] Update feed page
- [ ] Test activity display
- [ ] Test real-time updates

### Commit
- [ ] Commit changes

---

## Completion Criteria

1. Agent roster displays all agents
2. Agent status shows correctly
3. Create agent works
4. Activity feed shows recent activities
5. Real-time updates work
