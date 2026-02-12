"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Doc } from "@packages/backend/convex/_generated/dataModel";
import { Badge } from "@packages/ui/components/badge";
import { Button } from "@packages/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@packages/ui/components/dropdown-menu";
import { Input } from "@packages/ui/components/input";
import { Separator } from "@packages/ui/components/separator";
import { useAccount } from "@/lib/hooks/useAccount";
import { toast } from "sonner";
import {
  Edit2,
  Check,
  X,
  ArrowLeft,
  MoreHorizontal,
  Trash2,
  Archive,
  Settings2,
  Calendar,
  Flag,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { TaskAssignees } from "./TaskAssignees";
import { TaskStatusSelect } from "./TaskStatusSelect";
import { TaskEditDialog } from "./TaskEditDialog";
import { DeleteTaskDialog } from "./DeleteTaskDialog";
import { ArchiveTaskDialog } from "./ArchiveTaskDialog";
import { TaskSubscription } from "./TaskSubscription";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { getTaskDetailSheetHref } from "@/lib/utils";
import { TASK_STATUS } from "@packages/shared";

interface TaskHeaderProps {
  task: Doc<"tasks">;
  accountSlug: string;
}

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "Critical", color: "bg-red-500" },
  2: { label: "High", color: "bg-orange-500" },
  3: { label: "Medium", color: "bg-yellow-500" },
  4: { label: "Low", color: "bg-blue-500" },
  5: { label: "Lowest", color: "bg-slate-400" },
};

/**
 * Task header with title, status, and controls.
 */
export function TaskHeader({ task, accountSlug }: TaskHeaderProps) {
  useAccount();
  const router = useRouter();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);

  const updateTask = useMutation(api.tasks.update);
  const updateStatus = useMutation(api.tasks.updateStatus);

  const handleTitleSave = async () => {
    if (title.trim() === task.title) {
      setIsEditingTitle(false);
      return;
    }

    try {
      await updateTask({
        taskId: task._id,
        title: title.trim(),
      });
      setIsEditingTitle(false);
      toast.success("Task updated");
    } catch {
      toast.error("Failed to update task");
    }
  };

  const handleMarkAsDone = async () => {
    try {
      await updateStatus({
        taskId: task._id,
        status: TASK_STATUS.DONE,
      });
      toast.success("Status updated");
    } catch (error) {
      toast.error("Failed to update status", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleDeleted = () => {
    router.push(`/${accountSlug}/tasks`);
  };

  const priorityInfo = PRIORITY_LABELS[task.priority] ?? PRIORITY_LABELS[3];

  return (
    <div className="border-b bg-card">
      <div className="px-6 py-2 space-y-1.5">
        {/* Top bar: back button + title + actions all in one row */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 px-1.5 shrink-0" asChild>
            <Link href={getTaskDetailSheetHref(accountSlug, task._id)}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back to Tasks</span>
            </Link>
          </Button>

          {isEditingTitle ? (
            <div className="flex-1 flex items-center gap-1.5 min-w-0">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-lg font-bold h-8 py-0"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTitleSave();
                  if (e.key === "Escape") {
                    setTitle(task.title);
                    setIsEditingTitle(false);
                  }
                }}
                autoFocus
              />
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleTitleSave}>
                <Check className="h-3.5 w-3.5" />
                <span className="sr-only">Save</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => {
                  setTitle(task.title);
                  setIsEditingTitle(false);
                }}
              >
                <X className="h-3.5 w-3.5" />
                <span className="sr-only">Cancel</span>
              </Button>
            </div>
          ) : (
            <div className="flex-1 flex items-center gap-1.5 group min-w-0">
              <h1 className="text-lg font-bold tracking-tight truncate">
                {task.title}
              </h1>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                onClick={() => setIsEditingTitle(true)}
              >
                <Edit2 className="h-3.5 w-3.5" />
                <span className="sr-only">Edit title</span>
              </Button>
            </div>
          )}

          <div className="flex items-center gap-1.5 shrink-0">
            <TaskSubscription taskId={task._id} />

            {task.status === TASK_STATUS.REVIEW && (
              <Button size="sm" onClick={handleMarkAsDone} className="gap-1 h-7 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Done
              </Button>
            )}

            <TaskStatusSelect task={task} />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Task actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                  <Settings2 className="mr-2 h-4 w-4" />
                  Edit Details
                </DropdownMenuItem>
                {task.status !== TASK_STATUS.ARCHIVED && (
                  <DropdownMenuItem onClick={() => setShowArchiveDialog(true)}>
                    <Archive className="mr-2 h-4 w-4" />
                    Archive Task
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Task
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {task.description && (
          <div className="max-h-16 overflow-y-auto pr-3 text-sm leading-relaxed text-muted-foreground">
            <MarkdownRenderer content={task.description} compact />
          </div>
        )}

        {/* Blocked reason banner */}
        {task.status === TASK_STATUS.BLOCKED && task.blockedReason && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
            <Flag className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium">Blocked</p>
              <div className="text-xs opacity-90">
                <MarkdownRenderer
                  content={task.blockedReason}
                  compact
                  className="prose-p:my-0.5"
                />
              </div>
            </div>
          </div>
        )}

        {/* Compact metadata row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground pb-0.5">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${priorityInfo.color}`} />
            <span>{priorityInfo.label}</span>
          </div>

          {task.dueDate && (
            <>
              <Separator orientation="vertical" className="h-3" />
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>Due {format(new Date(task.dueDate), "MMM d, yyyy")}</span>
              </div>
            </>
          )}

          <Separator orientation="vertical" className="h-3" />
          <TaskAssignees task={task} />

          {task.labels.length > 0 && (
            <>
              <Separator orientation="vertical" className="h-3" />
              <div className="flex gap-1 flex-wrap">
                {task.labels.map((label) => (
                  <Badge key={label} variant="secondary" className="text-[10px] h-5">
                    {label}
                  </Badge>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <TaskEditDialog
        task={task}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
      />
      <DeleteTaskDialog
        taskId={task._id}
        taskTitle={task.title}
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onDeleted={handleDeleted}
      />
      <ArchiveTaskDialog
        taskId={task._id}
        taskTitle={task.title}
        open={showArchiveDialog}
        onOpenChange={setShowArchiveDialog}
        onArchived={handleDeleted}
      />
    </div>
  );
}
