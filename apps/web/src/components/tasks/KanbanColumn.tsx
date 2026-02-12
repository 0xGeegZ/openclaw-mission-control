"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Doc, Id } from "@packages/backend/convex/_generated/dataModel";
import { TaskCard } from "./TaskCard";
import { cn } from "@packages/ui/lib/utils";
import { TaskStatus, TASK_STATUS, TASK_STATUS_LABELS } from "@packages/shared";
import {
  Plus,
  Inbox,
  CheckCircle2,
  Clock,
  Eye,
  AlertTriangle,
  Users,
  Archive,
} from "lucide-react";
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
  onTaskClick?: (taskId: Id<"tasks">) => void;
  agents?: Doc<"agents">[];
}

// Status-specific configuration
const statusConfig: Record<
  TaskStatus,
  {
    icon: typeof Inbox;
    color: string;
    bgColor: string;
    borderColor: string;
    headerBg: string;
  }
> = {
  inbox: {
    icon: Inbox,
    color: "text-slate-500",
    bgColor: "bg-slate-500",
    borderColor: "border-slate-200 dark:border-slate-700/50",
    headerBg: "bg-slate-50 dark:bg-slate-900/30",
  },
  assigned: {
    icon: Users,
    color: "text-primary",
    bgColor: "bg-primary",
    borderColor: "border-primary/20",
    headerBg: "bg-primary/5",
  },
  in_progress: {
    icon: Clock,
    color: "text-amber-500",
    bgColor: "bg-amber-500",
    borderColor: "border-amber-200 dark:border-amber-700/50",
    headerBg: "bg-amber-50 dark:bg-amber-900/20",
  },
  review: {
    icon: Eye,
    color: "text-violet-500",
    bgColor: "bg-violet-500",
    borderColor: "border-violet-200 dark:border-violet-700/50",
    headerBg: "bg-violet-50 dark:bg-violet-900/20",
  },
  done: {
    icon: CheckCircle2,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500",
    borderColor: "border-emerald-200 dark:border-emerald-700/50",
    headerBg: "bg-emerald-50 dark:bg-emerald-900/20",
  },
  blocked: {
    icon: AlertTriangle,
    color: "text-destructive",
    bgColor: "bg-destructive",
    borderColor: "border-destructive/20",
    headerBg: "bg-destructive/5",
  },
  archived: {
    icon: Archive,
    color: "text-muted-foreground",
    bgColor: "bg-muted-foreground",
    borderColor: "border-muted/40",
    headerBg: "bg-muted/30",
  },
};

/**
 * Kanban column component.
 * Displays tasks for a specific status with drag-and-drop support.
 */
export function KanbanColumn({
  status,
  tasks,
  accountSlug,
  onAddTask,
  onTaskClick,
  agents,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const config = statusConfig[status];
  const StatusIcon = config.icon;

  // Helper to get assigned agents for a task
  const getAssignedAgents = (task: Doc<"tasks">) => {
    if (!agents) return [];
    return agents.filter((agent) => task.assignedAgentIds.includes(agent._id));
  };

  return (
    <div
      className={cn(
        "flex flex-col w-72 shrink-0 rounded-2xl border transition-all duration-300 h-full overflow-hidden",
        "bg-gradient-to-b from-background to-muted/20",
        config.borderColor,
        isOver && "ring-2 ring-primary/50 scale-[1.02] shadow-lg",
      )}
    >
      {/* Column header */}
      <div
        className={cn(
          "flex items-center justify-between px-3 py-3 border-b",
          config.headerBg,
          config.borderColor,
        )}
      >
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "flex items-center justify-center h-6 w-6 rounded-lg",
              config.bgColor + "/10",
            )}
          >
            <StatusIcon className={cn("h-3.5 w-3.5", config.color)} />
          </div>
          <h3 className="font-semibold text-sm">
            {TASK_STATUS_LABELS[status]}
          </h3>
          <span
            className={cn(
              "text-[10px] font-bold rounded-full px-2 py-0.5 tabular-nums",
              config.bgColor + "/10",
              config.color,
            )}
          >
            {tasks.length}
          </span>
        </div>
        {status === TASK_STATUS.INBOX && onAddTask && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-primary/10 hover:text-primary transition-colors"
                  onClick={onAddTask}
                >
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

      {/* Tasks container */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 space-y-2 overflow-y-auto min-h-[200px] p-2",
          isOver && "bg-primary/5",
        )}
      >
        <SortableContext
          items={tasks.map((t) => t._id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <TaskCard
              key={task._id}
              task={task}
              accountSlug={accountSlug}
              onClick={onTaskClick ? () => onTaskClick(task._id) : undefined}
              assignedAgents={getAssignedAgents(task)}
            />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-12">
            <div
              className={cn(
                "flex items-center justify-center h-12 w-12 rounded-2xl mb-3",
                config.bgColor + "/10",
              )}
            >
              <StatusIcon
                className={cn("h-6 w-6", config.color, "opacity-50")}
              />
            </div>
            <p className="text-sm font-medium text-muted-foreground/70">
              No tasks
            </p>
            <p className="text-xs text-muted-foreground/50 mt-0.5">
              Drag tasks here
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
