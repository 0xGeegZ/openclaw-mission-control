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

## 9. Agent Detail Page (Admin Config)

Create an agent detail page with tabs. Only admins see the Configuration tab.

### Files to Create

| Path | Purpose |
|------|---------|
| `apps/web/app/(dashboard)/[accountSlug]/agents/[agentId]/page.tsx` | Agent detail page |
| `apps/web/components/agents/AgentDetailTabs.tsx` | Tab container |
| `apps/web/components/agents/AgentOverview.tsx` | Overview tab |
| `apps/web/components/agents/AgentConfigForm.tsx` | Config tab (admin only) |
| `apps/web/components/agents/SkillSelector.tsx` | Skill assignment UI |

### Agent Detail Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ← Back to Agents                                                            │
│                                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ 🟢 Jarvis                                              [Edit] [Delete]  │ │
│ │ Squad Lead                                                              │ │
│ │                                                                         │ │
│ │ Last heartbeat: 2 minutes ago                                           │ │
│ │ Session key: agent:jarvis:acc_123abc                                    │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ [Overview] [SOUL] [Configuration*] [Activity]                           │ │
│ │ *Admin only                                                             │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │                        TAB CONTENT HERE                                 │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Configuration Tab (Admin Only)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ OpenClaw Configuration                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ Model Settings                                                              │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ Model                    [claude-sonnet-4-20250514 ▾]                   │ │
│ │ Temperature              [0.7        ] (0.0 - 2.0)                      │ │
│ │ Max Tokens               [4096       ]                                  │ │
│ │ System Prompt Prefix     [_________________________]                    │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ Assigned Skills                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐                  │ │
│ │ │ 🔧 Web Search │ │ 📝 Code Exec  │ │ [+ Add Skill] │                  │ │
│ │ │      ✕        │ │      ✕        │ └───────────────┘                  │ │
│ │ └───────────────┘ └───────────────┘                                    │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ Context Settings                                                            │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ Max History Messages     [50         ]                                  │ │
│ │ ☑ Include Task Context                                                  │ │
│ │ ☑ Include Team Context                                                  │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ Behavior Permissions                                                        │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ ☐ Can Create Tasks                                                      │ │
│ │ ☑ Can Modify Task Status                                                │ │
│ │ ☑ Can Create Documents                                                  │ │
│ │ ☑ Can Mention Other Agents                                              │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ Rate Limits                                                                 │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ Requests/Minute          [60         ]                                  │ │
│ │ Tokens/Day               [100000     ] (optional)                       │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│                                                    [Cancel] [Save Config]   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Agent Config Form Component

```typescript
// apps/web/components/agents/AgentConfigForm.tsx
"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Doc, Id } from "@packages/backend/convex/_generated/dataModel";
import { Button } from "@packages/ui/components/button";
import { Input } from "@packages/ui/components/input";
import { Label } from "@packages/ui/components/label";
import { Checkbox } from "@packages/ui/components/checkbox";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@packages/ui/components/select";
import { Slider } from "@packages/ui/components/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@packages/ui/components/card";
import { SkillSelector } from "./SkillSelector";
import { toast } from "sonner";

interface AgentConfigFormProps {
  agent: Doc<"agents">;
  accountId: Id<"accounts">;
}

const AVAILABLE_MODELS = [
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (Recommended)" },
  { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
];

export function AgentConfigForm({ agent, accountId }: AgentConfigFormProps) {
  const updateConfig = useMutation(api.agents.updateOpenclawConfig);
  
  const [config, setConfig] = useState(() => agent.openclawConfig ?? {
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
    rateLimits: {
      requestsPerMinute: 60,
    },
  });
  
  const [isSaving, setIsSaving] = useState(false);
  
  async function handleSave() {
    setIsSaving(true);
    try {
      await updateConfig({
        agentId: agent._id,
        config,
      });
      toast.success("Configuration saved");
    } catch (error) {
      toast.error("Failed to save configuration");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  }
  
  return (
    <div className="space-y-6">
      {/* Model Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Model Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Model</Label>
            <Select 
              value={config.model} 
              onValueChange={(v) => setConfig(c => ({ ...c, model: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_MODELS.map(m => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid gap-2">
            <Label>Temperature: {config.temperature}</Label>
            <Slider
              value={[config.temperature]}
              onValueChange={([v]) => setConfig(c => ({ ...c, temperature: v }))}
              min={0}
              max={2}
              step={0.1}
            />
            <p className="text-xs text-muted-foreground">
              Lower = more focused, Higher = more creative
            </p>
          </div>
          
          <div className="grid gap-2">
            <Label>Max Tokens</Label>
            <Input
              type="number"
              value={config.maxTokens ?? 4096}
              onChange={(e) => setConfig(c => ({ 
                ...c, 
                maxTokens: parseInt(e.target.value) || 4096 
              }))}
            />
          </div>
        </CardContent>
      </Card>
      
      {/* Skills */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Assigned Skills</CardTitle>
        </CardHeader>
        <CardContent>
          <SkillSelector
            accountId={accountId}
            selectedSkillIds={config.skillIds}
            onChange={(skillIds) => setConfig(c => ({ ...c, skillIds }))}
          />
        </CardContent>
      </Card>
      
      {/* Context Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Context Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Max History Messages</Label>
            <Input
              type="number"
              value={config.contextConfig?.maxHistoryMessages ?? 50}
              onChange={(e) => setConfig(c => ({
                ...c,
                contextConfig: {
                  ...c.contextConfig,
                  maxHistoryMessages: parseInt(e.target.value) || 50,
                  includeTaskContext: c.contextConfig?.includeTaskContext ?? true,
                  includeTeamContext: c.contextConfig?.includeTeamContext ?? true,
                },
              }))}
            />
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="includeTaskContext"
              checked={config.contextConfig?.includeTaskContext ?? true}
              onCheckedChange={(checked) => setConfig(c => ({
                ...c,
                contextConfig: {
                  ...c.contextConfig!,
                  includeTaskContext: !!checked,
                },
              }))}
            />
            <Label htmlFor="includeTaskContext">Include Task Context</Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="includeTeamContext"
              checked={config.contextConfig?.includeTeamContext ?? true}
              onCheckedChange={(checked) => setConfig(c => ({
                ...c,
                contextConfig: {
                  ...c.contextConfig!,
                  includeTeamContext: !!checked,
                },
              }))}
            />
            <Label htmlFor="includeTeamContext">Include Team Context</Label>
          </div>
        </CardContent>
      </Card>
      
      {/* Behavior Permissions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Behavior Permissions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { key: "canCreateTasks", label: "Can Create Tasks" },
            { key: "canModifyTaskStatus", label: "Can Modify Task Status" },
            { key: "canCreateDocuments", label: "Can Create Documents" },
            { key: "canMentionAgents", label: "Can Mention Other Agents" },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center space-x-2">
              <Checkbox
                id={key}
                checked={config.behaviorFlags?.[key as keyof typeof config.behaviorFlags] ?? false}
                onCheckedChange={(checked) => setConfig(c => ({
                  ...c,
                  behaviorFlags: {
                    ...c.behaviorFlags!,
                    [key]: !!checked,
                  },
                }))}
              />
              <Label htmlFor={key}>{label}</Label>
            </div>
          ))}
        </CardContent>
      </Card>
      
      {/* Rate Limits */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Rate Limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Requests per Minute</Label>
            <Input
              type="number"
              value={config.rateLimits?.requestsPerMinute ?? 60}
              onChange={(e) => setConfig(c => ({
                ...c,
                rateLimits: {
                  ...c.rateLimits,
                  requestsPerMinute: parseInt(e.target.value) || 60,
                },
              }))}
            />
          </div>
          
          <div className="grid gap-2">
            <Label>Tokens per Day (optional)</Label>
            <Input
              type="number"
              value={config.rateLimits?.tokensPerDay ?? ""}
              onChange={(e) => setConfig(c => ({
                ...c,
                rateLimits: {
                  ...c.rateLimits!,
                  tokensPerDay: e.target.value ? parseInt(e.target.value) : undefined,
                },
              }))}
              placeholder="No limit"
            />
          </div>
        </CardContent>
      </Card>
      
      {/* Save Button */}
      <div className="flex justify-end gap-2">
        <Button variant="outline">Cancel</Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Configuration"}
        </Button>
      </div>
    </div>
  );
}
```

### Skill Selector Component

```typescript
// apps/web/components/agents/SkillSelector.tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id } from "@packages/backend/convex/_generated/dataModel";
import { Badge } from "@packages/ui/components/badge";
import { Button } from "@packages/ui/components/button";
import { 
  Command, 
  CommandEmpty, 
  CommandGroup, 
  CommandInput, 
  CommandItem 
} from "@packages/ui/components/command";
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@packages/ui/components/popover";
import { X, Plus, Wrench, Plug, Zap, Code } from "lucide-react";
import { useState } from "react";

interface SkillSelectorProps {
  accountId: Id<"accounts">;
  selectedSkillIds: Id<"skills">[];
  onChange: (skillIds: Id<"skills">[]) => void;
}

const categoryIcons = {
  mcp_server: Plug,
  tool: Wrench,
  integration: Zap,
  custom: Code,
};

export function SkillSelector({ 
  accountId, 
  selectedSkillIds, 
  onChange 
}: SkillSelectorProps) {
  const [open, setOpen] = useState(false);
  
  const skills = useQuery(api.skills.list, { accountId, enabledOnly: true });
  
  const selectedSkills = skills?.filter(s => selectedSkillIds.includes(s._id)) ?? [];
  const availableSkills = skills?.filter(s => !selectedSkillIds.includes(s._id)) ?? [];
  
  function addSkill(skillId: Id<"skills">) {
    onChange([...selectedSkillIds, skillId]);
    setOpen(false);
  }
  
  function removeSkill(skillId: Id<"skills">) {
    onChange(selectedSkillIds.filter(id => id !== skillId));
  }
  
  return (
    <div className="space-y-3">
      {/* Selected Skills */}
      <div className="flex flex-wrap gap-2">
        {selectedSkills.map(skill => {
          const Icon = categoryIcons[skill.category];
          return (
            <Badge 
              key={skill._id} 
              variant="secondary"
              className="flex items-center gap-1 px-3 py-1"
            >
              <Icon className="h-3 w-3" />
              {skill.name}
              <button 
                onClick={() => removeSkill(skill._id)}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}
        
        {/* Add Skill Button */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7">
              <Plus className="h-3 w-3 mr-1" />
              Add Skill
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search skills..." />
              <CommandEmpty>No skills found.</CommandEmpty>
              <CommandGroup>
                {availableSkills.map(skill => {
                  const Icon = categoryIcons[skill.category];
                  return (
                    <CommandItem
                      key={skill._id}
                      onSelect={() => addSkill(skill._id)}
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      <div>
                        <div>{skill.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {skill.category}
                        </div>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      
      {selectedSkillIds.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No skills assigned. Add skills to enable agent capabilities.
        </p>
      )}
    </div>
  );
}
```

---

## 10. Skills Management Page (Admin Only)

Create a dedicated skills management page for admins.

### Files to Create

| Path | Purpose |
|------|---------|
| `apps/web/app/(dashboard)/[accountSlug]/settings/skills/page.tsx` | Skills management |
| `apps/web/components/settings/SkillsList.tsx` | Skills list |
| `apps/web/components/settings/SkillCard.tsx` | Single skill card |
| `apps/web/components/settings/CreateSkillDialog.tsx` | Create skill modal |
| `apps/web/components/settings/EditSkillDialog.tsx` | Edit skill modal |

### Skills Management Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Settings > Skills                                           [+ Create Skill] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ MCP Servers                                                                 │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ 🔌 Web Search          │ 🔌 Browser Control    │ 🔌 GitHub API          │ │
│ │ Search the web         │ Control browser       │ Interact with GitHub   │ │
│ │ ✓ Enabled              │ ✓ Enabled             │ ✗ Disabled             │ │
│ │ [Edit] [Toggle]        │ [Edit] [Toggle]       │ [Edit] [Toggle]        │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ Tools                                                                       │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ 🔧 Code Execution      │ 🔧 File Operations    │                        │ │
│ │ Run code safely        │ Read/write files      │                        │ │
│ │ ✓ Enabled              │ ✓ Enabled             │                        │ │
│ │ [Edit] [Toggle]        │ [Edit] [Toggle]       │                        │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ Integrations                                                                │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ ⚡ Slack               │ ⚡ Linear             │                        │ │
│ │ Post to Slack          │ Create issues         │                        │ │
│ │ ✓ Enabled              │ ✗ Disabled            │                        │ │
│ │ [Edit] [Toggle]        │ [Edit] [Toggle]       │                        │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Create Skill Dialog

```typescript
// apps/web/components/settings/CreateSkillDialog.tsx
"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id } from "@packages/backend/convex/_generated/dataModel";
import { Button } from "@packages/ui/components/button";
import { Input } from "@packages/ui/components/input";
import { Label } from "@packages/ui/components/label";
import { Textarea } from "@packages/ui/components/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@packages/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/select";
import { toast } from "sonner";

interface CreateSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: Id<"accounts">;
}

export function CreateSkillDialog({ 
  open, 
  onOpenChange, 
  accountId 
}: CreateSkillDialogProps) {
  const createSkill = useMutation(api.skills.create);
  
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [category, setCategory] = useState<string>("tool");
  const [description, setDescription] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  async function handleSubmit() {
    if (!name || !slug) {
      toast.error("Name and slug are required");
      return;
    }
    
    setIsSubmitting(true);
    try {
      await createSkill({
        accountId,
        name,
        slug,
        category: category as "mcp_server" | "tool" | "integration" | "custom",
        description: description || undefined,
        config: {
          serverUrl: serverUrl || undefined,
          authType: "none",
        },
      });
      
      toast.success("Skill created");
      onOpenChange(false);
      
      // Reset form
      setName("");
      setSlug("");
      setDescription("");
      setServerUrl("");
    } catch (error) {
      toast.error("Failed to create skill");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  }
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Skill</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Web Search"
            />
          </div>
          
          <div className="grid gap-2">
            <Label>Slug</Label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s/g, "-"))}
              placeholder="web-search"
            />
          </div>
          
          <div className="grid gap-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mcp_server">MCP Server</SelectItem>
                <SelectItem value="tool">Tool</SelectItem>
                <SelectItem value="integration">Integration</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid gap-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this skill do?"
              rows={3}
            />
          </div>
          
          {category === "mcp_server" && (
            <div className="grid gap-2">
              <Label>Server URL</Label>
              <Input
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://mcp.example.com"
              />
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create Skill"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 11. Admin Permission Check Hook

```typescript
// apps/web/lib/hooks/useIsAdmin.ts
"use client";

import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useAccount } from "./useAccount";

/**
 * Check if current user is admin or owner of the current account.
 * Used to conditionally show admin-only UI elements.
 */
export function useIsAdmin() {
  const { accountId } = useAccount();
  
  const membership = useQuery(
    api.memberships.getMyMembership,
    accountId ? { accountId } : "skip"
  );
  
  const isAdmin = membership?.role === "admin" || membership?.role === "owner";
  const isOwner = membership?.role === "owner";
  
  return { isAdmin, isOwner, isLoading: membership === undefined };
}
```

---

## 12. TODO Checklist

### Agents
- [ ] Create AgentCard component
- [ ] Create AgentRoster component
- [ ] Create CreateAgentDialog
- [ ] Update agents page
- [ ] Test agent list display
- [ ] Test create agent

### Agent Detail (Admin)
- [ ] Create agent detail page
- [ ] Create AgentDetailTabs component
- [ ] Create AgentOverview tab
- [ ] Create AgentConfigForm tab (admin only)
- [ ] Create SkillSelector component
- [ ] Test config update

### Skills Management (Admin)
- [ ] Create skills management page
- [ ] Create SkillsList component
- [ ] Create SkillCard component
- [ ] Create CreateSkillDialog
- [ ] Create EditSkillDialog
- [ ] Test skill CRUD

### Activity Feed
- [ ] Create ActivityItem component
- [ ] Create ActivityFeed component
- [ ] Update feed page
- [ ] Test activity display
- [ ] Test real-time updates

### Admin Hook
- [ ] Create useIsAdmin hook
- [ ] Apply admin checks to config tab
- [ ] Apply admin checks to skills page

### Commit
- [ ] Commit changes

---

## Completion Criteria

1. Agent roster displays all agents
2. Agent status shows correctly
3. Create agent works
4. **Agent detail page with tabs (Overview, SOUL, Configuration, Activity)**
5. **Configuration tab visible only to admins**
6. **OpenClaw config form works (model, temp, skills, context, permissions)**
7. **Skills management page works (admin only)**
8. **Skill selector allows adding/removing skills from agents**
9. Activity feed shows recent activities
10. Real-time updates work
