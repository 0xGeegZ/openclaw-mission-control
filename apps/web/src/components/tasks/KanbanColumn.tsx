"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Doc } from "@packages/backend/convex/_generated/dataModel";
import { TaskCard } from "./TaskCard";
import { cn } from "@packages/ui/lib/utils";
import { TaskStatus } from "@packages/shared";
import { TASK_STATUS_LABELS } from "@packages/shared";
import { Plus } from "lucide-react";
import { Button } from "@packages/ui/components/button";

interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Doc<"tasks">[];
  accountSlug: string;
  onAddTask?: () => void;
}

/**
 * Kanban column component.
 * Displays tasks for a specific status with drag-and-drop support.
 */
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
        {tasks.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            No tasks
          </div>
        )}
      </div>
    </div>
  );
}
