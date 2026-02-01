# Module 11: UI Task Detail

> Implement task detail view with thread and documents.

---

## ESSENTIAL CONTEXT — READ FIRST

**Before implementing this module, you MUST read:**

1. **`docs/mission-control-initial-article.md`** — Thread & mention concepts (Section 9)
2. **`docs/mission-control-cursor-core-instructions.md`** — UI requirements
3. **`.cursor/rules/02-ui-components.mdc`** — Component patterns

**Key understanding:**
- Task thread = messages with real-time updates
- Mention autocomplete (`@` trigger) for users and agents
- Auto-subscribe to thread on message post
- Status changes need validation (use mutation, not direct)

---

## 1. Context & Goal

Implement the task detail page showing:
- Task metadata (title, description, status, assignees)
- Message thread with real-time updates
- Linked documents
- Status controls
- Assignment management

---

## 2. Dependencies

```bash
npx shadcn@latest add tabs textarea avatar
```

---

## 3. Files to Create

| Path | Purpose |
|------|---------|
| `apps/web/app/(dashboard)/[accountSlug]/tasks/[taskId]/page.tsx` | Task detail page |
| `apps/web/components/tasks/TaskHeader.tsx` | Task title, status, controls |
| `apps/web/components/tasks/TaskThread.tsx` | Message thread |
| `apps/web/components/tasks/MessageInput.tsx` | Compose message |
| `apps/web/components/tasks/MessageItem.tsx` | Single message |
| `apps/web/components/tasks/TaskDocuments.tsx` | Linked documents |
| `apps/web/components/tasks/AssigneeSelector.tsx` | Assign users/agents |

---

## 4. Key Components

### TaskHeader

```typescript
// Shows task title, status badge, priority
// Edit title inline
// Status dropdown for quick change
// Assignee avatars with edit button
```

### TaskThread

```typescript
// Real-time message list
// useQuery(api.messages.listByTask)
// Auto-scroll to bottom on new messages
// Show author (user or agent) with avatar
// Timestamp and edit indicator
```

### MessageInput

```typescript
// Textarea with @mention autocomplete
// Send button
// Attachment upload (optional v2)
// useMutation(api.messages.create)
```

### MessageItem

```typescript
// Author avatar and name
// Message content (render markdown)
// Timestamp
// Edit/delete for own messages
// Highlight mentions
```

---

## 5. Task Detail Page Structure

```typescript
// apps/web/app/(dashboard)/[accountSlug]/tasks/[taskId]/page.tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id } from "@packages/backend/convex/_generated/dataModel";
import { TaskHeader } from "@/components/tasks/TaskHeader";
import { TaskThread } from "@/components/tasks/TaskThread";
import { TaskDocuments } from "@/components/tasks/TaskDocuments";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@packages/ui/components/tabs";

interface TaskDetailPageProps {
  params: Promise<{ accountSlug: string; taskId: string }>;
}

export default function TaskDetailPage({ params }: TaskDetailPageProps) {
  const { accountSlug, taskId } = use(params);
  
  const task = useQuery(api.tasks.get, { taskId: taskId as Id<"tasks"> });
  
  if (!task) {
    return <TaskDetailSkeleton />;
  }
  
  return (
    <div className="flex flex-col h-full">
      <TaskHeader task={task} accountSlug={accountSlug} />
      
      <Tabs defaultValue="thread" className="flex-1 flex flex-col">
        <TabsList className="mx-6">
          <TabsTrigger value="thread">Thread</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>
        
        <TabsContent value="thread" className="flex-1 overflow-hidden">
          <TaskThread taskId={task._id} accountSlug={accountSlug} />
        </TabsContent>
        
        <TabsContent value="documents">
          <TaskDocuments taskId={task._id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

---

## 6. Message Thread with Input

```typescript
// TaskThread.tsx
export function TaskThread({ taskId, accountSlug }) {
  const messages = useQuery(api.messages.listByTask, { taskId });
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages?.length]);
  
  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages?.map((message) => (
          <MessageItem key={message._id} message={message} />
        ))}
      </div>
      <MessageInput taskId={taskId} />
    </div>
  );
}
```

---

## 7. Mention Autocomplete

```typescript
// In MessageInput, implement @mention autocomplete
// 1. Detect "@" in textarea
// 2. Show dropdown with users/agents
// 3. On select, insert @name into textarea
// 4. Parse mentions on submit
```

---

## 8. TODO Checklist

- [ ] Create TaskHeader component
- [ ] Create TaskThread component
- [ ] Create MessageInput with mention autocomplete
- [ ] Create MessageItem component
- [ ] Create TaskDocuments component
- [ ] Create AssigneeSelector component
- [ ] Create task detail page
- [ ] Test message sending
- [ ] Test mention autocomplete
- [ ] Commit changes

---

## Completion Criteria

1. Task detail page renders
2. Message thread shows messages
3. Can send new messages
4. Mention autocomplete works
5. Documents tab shows linked docs
