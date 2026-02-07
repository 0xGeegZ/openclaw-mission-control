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
        status: "done",
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
      <div className="px-6 py-3 space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <Button variant="ghost" size="sm" className="h-8 px-2" asChild>
            <Link href={getTaskDetailSheetHref(accountSlug, task._id)}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Tasks
            </Link>
          </Button>
        </div>

        <div className="flex items-start justify-between gap-4">
          {isEditingTitle ? (
            <div className="flex-1 flex items-center gap-2">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-2xl font-bold h-auto py-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTitleSave();
                  if (e.key === "Escape") {
                    setTitle(task.title);
                    setIsEditingTitle(false);
                  }
                }}
                autoFocus
              />
              <Button variant="ghost" size="icon" onClick={handleTitleSave}>
                <Check className="h-4 w-4" />
                <span className="sr-only">Save</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setTitle(task.title);
                  setIsEditingTitle(false);
                }}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Cancel</span>
              </Button>
            </div>
          ) : (
            <div className="flex-1 flex items-center gap-2 group">
              <h1 className="text-2xl font-bold tracking-tight">
                {task.title}
              </h1>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => setIsEditingTitle(true)}
              >
                <Edit2 className="h-4 w-4" />
                <span className="sr-only">Edit title</span>
              </Button>
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* Follow/Unfollow button */}
            <TaskSubscription taskId={task._id} />

            {task.status === "review" && (
              <Button size="sm" onClick={handleMarkAsDone} className="gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                Mark as done
              </Button>
            )}

            <TaskStatusSelect task={task} />

            {/* Actions dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Task actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                  <Settings2 className="mr-2 h-4 w-4" />
                  Edit Details
                </DropdownMenuItem>
                {task.status !== "archived" && (
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
          <div className="max-h-32 overflow-y-auto pr-3 text-sm leading-relaxed text-muted-foreground">
            <MarkdownRenderer content={task.description} compact />
          </div>
        )}

        {/* Blocked reason banner */}
        {task.status === "blocked" && task.blockedReason && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
            <Flag className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Blocked</p>
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

        {/* Metadata row: priority, due date, assignees, labels */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {/* Priority */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${priorityInfo.color}`} />
            <span className="text-sm text-muted-foreground">
              {priorityInfo.label}
            </span>
          </div>

          {/* Due date */}
          {task.dueDate && (
            <>
              <Separator orientation="vertical" className="h-4" />
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span>Due {format(new Date(task.dueDate), "MMM d, yyyy")}</span>
              </div>
            </>
          )}

          <Separator orientation="vertical" className="h-4" />

          {/* Assignees */}
          <TaskAssignees task={task} />

          {task.labels.length > 0 && (
            <>
              <Separator orientation="vertical" className="h-4" />
              <div className="flex gap-1.5 flex-wrap">
                {task.labels.map((label) => (
                  <Badge key={label} variant="secondary" className="text-xs">
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
