"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id } from "@packages/backend/convex/_generated/dataModel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@packages/ui/components/alert-dialog";
import { toast } from "sonner";
import { Loader2, Archive } from "lucide-react";

interface ArchiveTaskDialogProps {
  taskId: Id<"tasks">;
  taskTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after task is archived (e.g. redirect or close sheet). */
  onArchived?: () => void;
}

/**
 * Confirmation dialog for archiving a task (soft delete).
 * Sets status to "archived"; task is hidden from the main board but preserved for audit.
 */
export function ArchiveTaskDialog({
  taskId,
  taskTitle,
  open,
  onOpenChange,
  onArchived,
}: ArchiveTaskDialogProps) {
  const [isArchiving, setIsArchiving] = useState(false);
  const updateStatus = useMutation(api.tasks.updateStatus);

  const handleArchive = async () => {
    setIsArchiving(true);
    try {
      await updateStatus({
        taskId,
        status: "archived",
      });
      toast.success("Task archived");
      onOpenChange(false);
      onArchived?.();
    } catch (error) {
      toast.error("Failed to archive task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted">
              <Archive className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <AlertDialogTitle className="text-lg">
                Archive Task
              </AlertDialogTitle>
              <AlertDialogDescription className="mt-1">
                The task will be hidden from the board but kept for history.
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <div className="py-4 px-1">
          <p className="text-sm text-muted-foreground">
            Archive{" "}
            <span className="font-semibold text-foreground">
              &quot;{taskTitle}&quot;
            </span>
            ? You can still find it in activity and audit logs.
          </p>
        </div>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel disabled={isArchiving} className="rounded-lg">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleArchive}
            disabled={isArchiving}
            className="rounded-lg gap-2"
          >
            {isArchiving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
            {isArchiving ? "Archiving..." : "Archive Task"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
