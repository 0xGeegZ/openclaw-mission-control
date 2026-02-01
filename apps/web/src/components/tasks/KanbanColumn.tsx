"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Doc } from "@packages/backend/convex/_generated/dataModel";
import { TaskCard } from "./TaskCard";
import { cn } from "@packages/ui/lib/utils";
import { TaskStatus } from "@packages/shared";
import { TASK_STATUS_LABELS } from "@packages/shared";
import { Plus, Inbox } from "lucide-react";
import { Button } from "@packages/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@packages/ui/components/tooltip";

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
        "flex flex-col w-72 shrink-0 rounded-xl bg-muted/30 border border-border/50 transition-all",
        isOver && "ring-2 ring-primary/50 bg-primary/5"
      )}
    >
      <div className="flex items-center justify-between px-3 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">{TASK_STATUS_LABELS[status]}</h3>
          <span className="text-xs font-medium text-muted-foreground bg-background rounded-md px-2 py-0.5 border">
            {tasks.length}
          </span>
        </div>
        {status === "inbox" && onAddTask && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onAddTask}>
                  <Plus className="h-4 w-4" />
                  <span className="sr-only">Add task</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Add new task</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      
      <div 
        ref={setNodeRef}
        className="flex-1 space-y-2 overflow-y-auto min-h-[200px] p-2"
      >
        <SortableContext items={tasks.map(t => t._id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task._id} task={task} accountSlug={accountSlug} />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-8">
            <Inbox className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">No tasks</p>
          </div>
        )}
      </div>
    </div>
  );
}
