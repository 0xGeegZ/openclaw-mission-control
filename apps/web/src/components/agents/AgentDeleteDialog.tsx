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
import { Loader2 } from "lucide-react";

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
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Agent</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">{agentName}</span>?
            This will remove the agent from all task assignments and delete
            associated data. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isDeleting ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
