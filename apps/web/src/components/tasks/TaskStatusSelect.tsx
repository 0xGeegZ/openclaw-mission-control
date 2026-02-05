"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Doc } from "@packages/backend/convex/_generated/dataModel";
import { Button } from "@packages/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/select";
import { TaskStatus, TASK_STATUS_LABELS } from "@packages/shared";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { cn } from "@packages/ui/lib/utils";
import { BlockedReasonDialog } from "./BlockedReasonDialog";

interface TaskStatusSelectProps {
  task: Doc<"tasks">;
  /** Smaller trigger for sheet/compact layouts. */
  variant?: "default" | "compact";
}

/**
 * Editable task status: Select plus BlockedReasonDialog when moving to blocked.
 * When task is done, shows a Reopen control. Used in TaskHeader and TaskDetailSheet.
 */
export function TaskStatusSelect({
  task,
  variant = "default",
}: TaskStatusSelectProps) {
  const [showBlockedDialog, setShowBlockedDialog] = useState(false);

  const updateStatus = useMutation(api.tasks.updateStatus);
  const reopenTask = useMutation(api.tasks.reopen);

  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (newStatus === "blocked") {
      setShowBlockedDialog(true);
      return;
    }

    try {
      await updateStatus({
        taskId: task._id,
        status: newStatus,
      });
      toast.success("Status updated");
    } catch (error) {
      toast.error("Failed to update status", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleBlockedConfirm = async (reason: string) => {
    try {
      await updateStatus({
        taskId: task._id,
        status: "blocked",
        blockedReason: reason,
      });
      toast.success("Task marked as blocked");
    } catch (error) {
      toast.error("Failed to update status", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  };

  const handleReopen = async () => {
    try {
      await reopenTask({ taskId: task._id });
      toast.success("Task reopened");
    } catch (error) {
      toast.error("Failed to reopen task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const triggerClass = cn(
    variant === "default" && "w-36",
    variant === "compact" && "h-8 w-[7.5rem] text-xs border rounded-md",
  );

  const isDone = task.status === "done";

  return (
    <>
      <div className="flex items-center gap-2">
        <Select
          value={task.status}
          onValueChange={(v) => handleStatusChange(v as TaskStatus)}
          disabled={isDone}
        >
          <SelectTrigger className={triggerClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isDone && (
          <Button
            variant="outline"
            size="sm"
            className={cn(variant === "compact" && "h-8 px-2 text-xs")}
            onClick={handleReopen}
          >
            <RotateCcw
              className={cn("h-3.5 w-3.5", variant === "default" && "mr-1.5")}
            />
            Reopen
          </Button>
        )}
      </div>
      <BlockedReasonDialog
        open={showBlockedDialog}
        onOpenChange={setShowBlockedDialog}
        onConfirm={handleBlockedConfirm}
        taskTitle={task.title}
      />
    </>
  );
}
