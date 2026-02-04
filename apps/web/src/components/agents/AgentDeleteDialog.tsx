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
import { Loader2, Bot, AlertTriangle, Trash2 } from "lucide-react";

interface AgentDeleteDialogProps {
  agentId: Id<"agents">;
  agentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

/**
 * Confirmation dialog for deleting an agent.
 */
export function AgentDeleteDialog({
  agentId,
  agentName,
  open,
  onOpenChange,
  onDeleted,
}: AgentDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const removeAgent = useMutation(api.agents.remove);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await removeAgent({ agentId });
      toast.success("Agent deleted");
      onOpenChange(false);
      onDeleted?.();
    } catch (error) {
      toast.error("Failed to delete agent", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <AlertDialogTitle className="text-lg">Delete Agent</AlertDialogTitle>
              <AlertDialogDescription className="mt-1">
                This action cannot be undone.
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <div className="py-4 px-1">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/50 mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10">
              <Bot className="h-4 w-4 text-violet-500" />
            </div>
            <span className="font-medium">{agentName}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            This will remove the agent from all task assignments and permanently delete all associated data.
          </p>
        </div>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel disabled={isDeleting} className="rounded-lg">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-destructive text-white hover:bg-destructive/90 rounded-lg gap-2"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {isDeleting ? "Deleting..." : "Delete Agent"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
