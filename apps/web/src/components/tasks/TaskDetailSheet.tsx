"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id } from "@packages/backend/convex/_generated/dataModel";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@packages/ui/components/sheet";
import { Badge } from "@packages/ui/components/badge";
import { Button } from "@packages/ui/components/button";
import { Skeleton } from "@packages/ui/components/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@packages/ui/components/tabs";
import { ScrollArea } from "@packages/ui/components/scroll-area";
import { formatDistanceToNow, format } from "date-fns";
import {
  Maximize2,
  Trash2,
  Archive,
  CheckCircle2,
  Calendar,
  MessageSquare,
  FileText,
  Clock,
  Flag,
  Tag,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { TaskThread } from "./TaskThread";
import { TaskDocuments } from "./TaskDocuments";
import { TaskStatusSelect } from "./TaskStatusSelect";
import { TaskAssignees } from "./TaskAssignees";
import { cn } from "@packages/ui/lib/utils";
import { DeleteTaskDialog } from "./DeleteTaskDialog";
import { ArchiveTaskDialog } from "./ArchiveTaskDialog";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";

interface TaskDetailSheetProps {
  taskId: Id<"tasks"> | null;
  accountSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after task is deleted (e.g. to close sheet and clear URL). */
  onDeleted?: () => void;
}

const PRIORITY_CONFIG: Record<
  number,
  { label: string; color: string; bgColor: string }
> = {
  1: {
    label: "Critical",
    color: "bg-red-500",
    bgColor: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  },
  2: {
    label: "High",
    color: "bg-orange-500",
    bgColor:
      "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  },
  3: {
    label: "Medium",
    color: "bg-amber-500",
    bgColor:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  4: {
    label: "Low",
    color: "bg-blue-500",
    bgColor:
      "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  },
  5: {
    label: "Lowest",
    color: "bg-slate-400",
    bgColor:
      "bg-slate-400/10 text-slate-600 dark:text-slate-400 border-slate-400/20",
  },
};

const STATUS_CONFIG: Record<string, { color: string; bgColor: string }> = {
  inbox: {
    color: "bg-slate-400",
    bgColor:
      "bg-slate-400/10 text-slate-600 dark:text-slate-400 border-slate-400/20",
  },
  assigned: {
    color: "bg-primary",
    bgColor: "bg-primary/10 text-primary border-primary/20",
  },
  in_progress: {
    color: "bg-amber-500",
    bgColor:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  review: {
    color: "bg-violet-500",
    bgColor:
      "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  },
  done: {
    color: "bg-emerald-500",
    bgColor:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  blocked: {
    color: "bg-destructive",
    bgColor: "bg-destructive/10 text-destructive border-destructive/20",
  },
};

/**
 * Task detail sheet component.
 * Opens as a slide-over panel showing full task details.
 */
const headerActionClass =
  "ring-offset-background focus:ring-ring rounded-md p-1.5 opacity-70 transition-all hover:opacity-100 hover:bg-muted focus:ring-2 focus:ring-offset-2 focus:outline-hidden";

export function TaskDetailSheet({
  taskId,
  accountSlug,
  open,
  onOpenChange,
  onDeleted,
}: TaskDetailSheetProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const task = useQuery(api.tasks.get, taskId ? { taskId } : "skip");
  const updateStatus = useMutation(api.tasks.updateStatus);

  const handleMarkAsDone = async () => {
    if (!task) return;
    try {
      await updateStatus({ taskId: task._id, status: "done" });
      toast.success("Status updated");
    } catch (error) {
      toast.error("Failed to update status", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleDeleted = () => {
    onOpenChange(false);
    onDeleted?.();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:w-[65vw] sm:max-w-none p-0 flex flex-col"
        showCloseButton={true}
        headerActions={
          task && (
            <div className="flex items-center gap-1">
              <Link
                href={`/${accountSlug}/tasks/${task._id}`}
                className={headerActionClass}
                title="Open full page"
              >
                <Maximize2 className="size-4" />
                <span className="sr-only">Open full page</span>
              </Link>
              {task.status !== "archived" && (
                <button
                  type="button"
                  onClick={() => setArchiveDialogOpen(true)}
                  className={headerActionClass}
                  title="Archive task"
                  aria-label="Archive task"
                >
                  <Archive className="size-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setDeleteDialogOpen(true)}
                className={cn(headerActionClass, "hover:text-destructive")}
                title="Delete task"
                aria-label="Delete task"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          )
        }
      >
        {task === undefined ? (
          <TaskDetailSkeleton />
        ) : task === null ? (
          <div className="flex flex-col items-center justify-center h-full p-6">
            <p className="text-muted-foreground">Task not found</p>
          </div>
        ) : (
          <>
            <SheetHeader className="p-4 pb-3 shrink-0 bg-gradient-to-b from-muted/30 to-transparent">
              <div className="flex items-center gap-2 text-xs text-muted-foreground/70 mb-2">
                <div
                  className={`w-2 h-2 rounded-full ${STATUS_CONFIG[task.status]?.color}`}
                />
                <span className="uppercase tracking-widest font-medium text-[10px]">
                  Task Detail
                </span>
              </div>

              <SheetTitle className="text-xl font-bold leading-tight text-balance pr-16">
                {task.title}
              </SheetTitle>
            </SheetHeader>

            <div className="p-4 space-y-3 shrink-0 border-b border-border/50">
              {/* Status and priority */}
              <div
                className="flex items-center gap-2 flex-wrap"
                role="group"
                aria-label="Task status and priority"
              >
                <TaskStatusSelect task={task} variant="compact" />

                {task.status === "review" && (
                  <Button
                    size="sm"
                    onClick={handleMarkAsDone}
                    className="gap-1.5"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Mark as done
                  </Button>
                )}

                {task.priority && (
                  <Badge
                    variant="outline"
                    className={`gap-1.5 border ${PRIORITY_CONFIG[task.priority]?.bgColor || PRIORITY_CONFIG[3].bgColor}`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${PRIORITY_CONFIG[task.priority]?.color || PRIORITY_CONFIG[3].color}`}
                    />
                    {PRIORITY_CONFIG[task.priority]?.label || "Medium"}
                  </Badge>
                )}
              </div>

              {/* Description */}
              {task.description && (
                <div className="max-h-32 overflow-y-auto pr-3 text-sm leading-relaxed">
                  <MarkdownRenderer content={task.description} compact />
                </div>
              )}

              {/* Blocked reason */}
              {task.status === "blocked" && task.blockedReason && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
                  <Flag className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Blocked Reason</p>
                    <div className="text-sm opacity-90">
                      <MarkdownRenderer
                        content={task.blockedReason}
                        compact
                        className="prose-p:my-1"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Metadata grid - 4 cards in one row */}
              <div className="grid grid-cols-4 gap-3 text-sm">
                {/* Assignees */}
                <div
                  className="space-y-2 p-2.5 rounded-xl bg-muted/30 min-w-0"
                  role="group"
                  aria-label="Task assignees"
                >
                  <span className="text-[10px] text-muted-foreground/70 uppercase tracking-widest font-medium">
                    Assignees
                  </span>
                  <div className="flex items-center gap-2">
                    <TaskAssignees task={task} showLabel={false} />
                  </div>
                </div>

                {/* Due date */}
                <div className="space-y-2 p-2.5 rounded-xl bg-muted/30 min-w-0">
                  <span className="text-[10px] text-muted-foreground/70 uppercase tracking-widest font-medium">
                    Due Date
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground/60" />
                    <span className="text-sm">
                      {task.dueDate ? (
                        format(new Date(task.dueDate), "MMM d, yyyy")
                      ) : (
                        <span className="text-muted-foreground/60 italic">
                          No due date
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Created */}
                <div className="space-y-2 p-2.5 rounded-xl bg-muted/30 min-w-0">
                  <span className="text-[10px] text-muted-foreground/70 uppercase tracking-widest font-medium">
                    Created
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
                    <span className="text-sm tabular-nums">
                      {formatDistanceToNow(task.createdAt, { addSuffix: true })}
                    </span>
                  </div>
                </div>

                {/* Updated */}
                <div className="space-y-2 p-2.5 rounded-xl bg-muted/30 min-w-0">
                  <span className="text-[10px] text-muted-foreground/70 uppercase tracking-widest font-medium">
                    Updated
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
                    <span className="text-sm tabular-nums">
                      {formatDistanceToNow(task.updatedAt, { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Labels */}
              {task.labels.length > 0 && (
                <div className="space-y-2 p-2.5 rounded-xl bg-muted/30">
                  <span className="text-[10px] text-muted-foreground/70 uppercase tracking-widest font-medium flex items-center gap-1.5">
                    <Tag className="h-3 w-3" />
                    Labels
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {task.labels.map((label) => (
                      <Badge
                        key={label}
                        variant="secondary"
                        className="text-xs bg-background/50 border border-border/30"
                      >
                        {label}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Tabs for Thread / Documents */}
            <Tabs
              defaultValue="thread"
              className="flex-1 flex flex-col min-h-0"
            >
              <div className="shrink-0 border-b px-4">
                <TabsList variant="line" className="h-9">
                  <TabsTrigger value="thread" className="px-4 gap-2 text-sm">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Thread
                  </TabsTrigger>
                  <TabsTrigger value="documents" className="px-4 gap-2 text-sm">
                    <FileText className="h-3.5 w-3.5" />
                    Documents
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent
                value="thread"
                className="relative flex-1 min-h-0 mt-0 data-[state=inactive]:hidden"
              >
                <TaskThread
                  taskId={task._id}
                  accountSlug={accountSlug}
                  accountId={task.accountId}
                  useReadByFallback
                />
              </TabsContent>

              <TabsContent
                value="documents"
                className="relative flex-1 min-h-0 mt-0 data-[state=inactive]:hidden"
              >
                <ScrollArea className="h-full">
                  <div className="p-4">
                    <TaskDocuments
                      taskId={task._id}
                      accountSlug={accountSlug}
                    />
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
      {task && (
        <>
          <DeleteTaskDialog
            taskId={task._id}
            taskTitle={task.title}
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            onDeleted={handleDeleted}
          />
          <ArchiveTaskDialog
            taskId={task._id}
            taskTitle={task.title}
            open={archiveDialogOpen}
            onOpenChange={setArchiveDialogOpen}
            onArchived={handleDeleted}
          />
        </>
      )}
    </Sheet>
  );
}

function TaskDetailSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-6 w-3/4" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-16" />
      </div>
      <Skeleton className="h-16 w-full" />
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}
