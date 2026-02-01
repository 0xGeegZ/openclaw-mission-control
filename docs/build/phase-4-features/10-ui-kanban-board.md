# Module 10: UI Kanban Board

> Implement the Kanban board for task management.

---

## ESSENTIAL CONTEXT — READ FIRST

**Before implementing this module, you MUST read:**

1. **`docs/mission-control-initial-article.md`** — Task workflow: Inbox → Assigned → In Progress → Review → Done
2. **`docs/mission-control-cursor-core-instructions.md`** — Task state rules (Section 4.4)
3. **`.cursor/rules/02-ui-components.mdc`** — Component patterns, shadcn usage

**Key understanding:**
- Kanban is the primary task interface
- Drag-drop changes task status via `updateStatus` mutation
- Status transitions are validated server-side
- Real-time updates via Convex subscriptions (`useQuery`)

---

## 1. Context & Goal

We are implementing the Kanban board UI for Mission Control's task management. This is the primary interface for viewing and managing tasks.

**What we're building:**
- Kanban columns: Inbox, Assigned, In Progress, Review, Done (+ Blocked)
- Task cards with status, assignees, priority
- Drag-and-drop between columns
- Task creation modal
- Quick status update
- Real-time updates via Convex subscriptions

**Key constraints:**
- Use @dnd-kit for drag-and-drop (React 19 compatible)
- Real-time sync across clients
- Validate transitions on drop
- Mobile-friendly (scroll columns)

---

## 2. Dependencies to Install

```bash
cd apps/web
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
npx shadcn@latest add dialog card badge
```

---

## 3. High-level Design

### Component Hierarchy

```
TasksPage
├── KanbanBoard
│   ├── KanbanColumn (per status)
│   │   ├── ColumnHeader
│   │   └── TaskCard (draggable)
│   └── DragOverlay (preview while dragging)
├── CreateTaskDialog
└── TaskFilters (optional)
```

### Drag-and-Drop Flow

```
1. User starts drag → DragOverlay shows preview
2. User hovers column → Column highlights
3. User drops → Validate transition
4. If valid → Call updateStatus mutation
5. UI updates via subscription
```

---

## 4. Files to Create

| Path | Purpose |
|------|---------|
| `apps/web/app/(dashboard)/[accountSlug]/tasks/page.tsx` | Tasks page |
| `apps/web/components/tasks/KanbanBoard.tsx` | Board container |
| `apps/web/components/tasks/KanbanColumn.tsx` | Single column |
| `apps/web/components/tasks/TaskCard.tsx` | Task card |
| `apps/web/components/tasks/CreateTaskDialog.tsx` | Create modal |
| `apps/web/components/tasks/TaskFilters.tsx` | Filter bar |

---

## 5. Step-by-Step Tasks

### Step 1: Create TaskCard Component

```typescript
// apps/web/components/tasks/TaskCard.tsx
"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Doc } from "@packages/backend/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@packages/ui/components/card";
import { Badge } from "@packages/ui/components/badge";
import { Avatar, AvatarFallback } from "@packages/ui/components/avatar";
import { cn } from "@packages/ui/lib/utils";
import Link from "next/link";

interface TaskCardProps {
  task: Doc<"tasks">;
  accountSlug: string;
  isDragging?: boolean;
}

const priorityColors = {
  1: "bg-red-500",
  2: "bg-orange-500",
  3: "bg-yellow-500",
  4: "bg-blue-500",
  5: "bg-gray-500",
};

export function TaskCard({ task, accountSlug, isDragging }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: task._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50"
      )}
    >
      <CardHeader className="p-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <Link 
            href={`/${accountSlug}/tasks/${task._id}`}
            className="hover:underline"
          >
            <CardTitle className="text-sm font-medium line-clamp-2">
              {task.title}
            </CardTitle>
          </Link>
          <div 
            className={cn(
              "w-2 h-2 rounded-full shrink-0 mt-1",
              priorityColors[task.priority as keyof typeof priorityColors]
            )}
            title={`Priority ${task.priority}`}
          />
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1">
            {task.labels.slice(0, 2).map((label) => (
              <Badge key={label} variant="secondary" className="text-xs">
                {label}
              </Badge>
            ))}
          </div>
          <div className="flex -space-x-2">
            {task.assignedAgentIds.slice(0, 3).map((id) => (
              <Avatar key={id} className="h-6 w-6 border-2 border-background">
                <AvatarFallback className="text-xs">A</AvatarFallback>
              </Avatar>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

### Step 2: Create KanbanColumn Component

```typescript
// apps/web/components/tasks/KanbanColumn.tsx
"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Doc } from "@packages/backend/convex/_generated/dataModel";
import { TaskCard } from "./TaskCard";
import { cn } from "@packages/ui/lib/utils";
import { TaskStatus } from "@packages/shared/types";
import { TASK_STATUS_LABELS } from "@packages/shared/constants";
import { Plus } from "lucide-react";
import { Button } from "@packages/ui/components/button";

interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Doc<"tasks">[];
  accountSlug: string;
  onAddTask?: () => void;
}

export function KanbanColumn({ 
  status, 
  tasks, 
  accountSlug, 
  onAddTask 
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div 
      className={cn(
        "flex flex-col w-72 shrink-0 rounded-lg bg-muted/50 p-2",
        isOver && "ring-2 ring-primary"
      )}
    >
      <div className="flex items-center justify-between px-2 py-1 mb-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">{TASK_STATUS_LABELS[status]}</h3>
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
            {tasks.length}
          </span>
        </div>
        {status === "inbox" && onAddTask && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onAddTask}>
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>
      
      <div 
        ref={setNodeRef}
        className="flex-1 space-y-2 overflow-y-auto min-h-[200px]"
      >
        <SortableContext items={tasks.map(t => t._id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task._id} task={task} accountSlug={accountSlug} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
```

### Step 3: Create KanbanBoard Component

```typescript
// apps/web/components/tasks/KanbanBoard.tsx
"use client";

import { useState, useCallback } from "react";
import { 
  DndContext, 
  DragEndEvent, 
  DragOverlay,
  DragStartEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useQuery, useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id, Doc } from "@packages/backend/convex/_generated/dataModel";
import { KanbanColumn } from "./KanbanColumn";
import { TaskCard } from "./TaskCard";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { useAccount } from "@/lib/hooks/useAccount";
import { TaskStatus, TASK_STATUS_ORDER } from "@packages/shared";
import { toast } from "sonner";

interface KanbanBoardProps {
  accountSlug: string;
}

export function KanbanBoard({ accountSlug }: KanbanBoardProps) {
  const { accountId } = useAccount();
  const [activeTask, setActiveTask] = useState<Doc<"tasks"> | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  
  const tasksData = useQuery(
    api.tasks.listByStatus,
    accountId ? { accountId } : "skip"
  );
  
  const updateStatus = useMutation(api.tasks.updateStatus);
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const taskId = active.id as Id<"tasks">;
    
    // Find the task in any column
    if (tasksData?.tasks) {
      for (const tasks of Object.values(tasksData.tasks)) {
        const task = tasks.find(t => t._id === taskId);
        if (task) {
          setActiveTask(task);
          break;
        }
      }
    }
  }, [tasksData]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    
    if (!over || !accountId) return;
    
    const taskId = active.id as Id<"tasks">;
    const newStatus = over.id as TaskStatus;
    
    // Find current task
    let currentTask: Doc<"tasks"> | null = null;
    if (tasksData?.tasks) {
      for (const tasks of Object.values(tasksData.tasks)) {
        const task = tasks.find(t => t._id === taskId);
        if (task) {
          currentTask = task;
          break;
        }
      }
    }
    
    if (!currentTask || currentTask.status === newStatus) return;
    
    try {
      await updateStatus({ 
        taskId, 
        status: newStatus,
        // For blocked, would need a dialog to get reason
      });
    } catch (error) {
      toast.error("Failed to update status", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, [accountId, tasksData, updateStatus]);

  if (!tasksData) {
    return <KanbanSkeleton />;
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 px-6">
          {TASK_STATUS_ORDER.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={tasksData.tasks[status] || []}
              accountSlug={accountSlug}
              onAddTask={status === "inbox" ? () => setShowCreateDialog(true) : undefined}
            />
          ))}
          
          {/* Blocked column */}
          <KanbanColumn
            status="blocked"
            tasks={tasksData.tasks.blocked || []}
            accountSlug={accountSlug}
          />
        </div>
        
        <DragOverlay>
          {activeTask && (
            <TaskCard task={activeTask} accountSlug={accountSlug} isDragging />
          )}
        </DragOverlay>
      </DndContext>
      
      <CreateTaskDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />
    </>
  );
}

function KanbanSkeleton() {
  return (
    <div className="flex gap-4 px-6">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="w-72 h-96 rounded-lg bg-muted/50 animate-pulse" />
      ))}
    </div>
  );
}
```

### Step 4: Create CreateTaskDialog

```typescript
// apps/web/components/tasks/CreateTaskDialog.tsx
"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useAccount } from "@/lib/hooks/useAccount";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@packages/ui/components/dialog";
import { Button } from "@packages/ui/components/button";
import { Input } from "@packages/ui/components/input";
import { Label } from "@packages/ui/components/label";
import { Textarea } from "@packages/ui/components/textarea";
import { toast } from "sonner";

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateTaskDialog({ open, onOpenChange }: CreateTaskDialogProps) {
  const { accountId } = useAccount();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const createTask = useMutation(api.tasks.create);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId || !title.trim()) return;
    
    setIsSubmitting(true);
    try {
      await createTask({
        accountId,
        title: title.trim(),
        description: description.trim() || undefined,
      });
      
      toast.success("Task created");
      setTitle("");
      setDescription("");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to create task");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title..."
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !title.trim()}>
              {isSubmitting ? "Creating..." : "Create Task"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

### Step 5: Update Tasks Page

```typescript
// apps/web/app/(dashboard)/[accountSlug]/tasks/page.tsx
import { KanbanBoard } from "@/components/tasks/KanbanBoard";

interface TasksPageProps {
  params: Promise<{ accountSlug: string }>;
}

export default async function TasksPage({ params }: TasksPageProps) {
  const { accountSlug } = await params;
  
  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-6 py-4 border-b">
        <h1 className="text-2xl font-bold">Tasks</h1>
      </header>
      
      <div className="flex-1 overflow-hidden py-4">
        <KanbanBoard accountSlug={accountSlug} />
      </div>
    </div>
  );
}
```

### Step 6: Verify and Commit

```bash
yarn typecheck
yarn dev
# Test Kanban board functionality

git add .
git commit -m "feat(ui): implement Kanban board for task management

- Add drag-and-drop with @dnd-kit
- Add task cards with priority and assignees
- Add create task dialog
- Real-time updates via Convex
"
```

---

## 6. Edge Cases

| Case | Handling |
|------|----------|
| Invalid transition | Show toast error |
| Drop on blocked | Would need blocked reason dialog |
| Many tasks | Columns scroll independently |
| Empty column | Show "No tasks" placeholder |

---

## 9. TODO Checklist

- [ ] Install @dnd-kit packages
- [ ] Install shadcn dialog, textarea
- [ ] Create TaskCard component
- [ ] Create KanbanColumn component
- [ ] Create KanbanBoard component
- [ ] Create CreateTaskDialog
- [ ] Update tasks page
- [ ] Test drag-and-drop
- [ ] Test task creation
- [ ] Commit changes

---

## Completion Criteria

1. Kanban board renders with columns
2. Drag-and-drop changes status
3. Task creation works
4. Real-time updates work
5. Type check passes
