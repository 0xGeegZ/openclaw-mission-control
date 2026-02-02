"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Doc } from "@packages/backend/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@packages/ui/components/dialog";
import { Button } from "@packages/ui/components/button";
import { Label } from "@packages/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cn } from "@packages/ui/lib/utils";

interface AgentStatusDialogProps {
  agent: Doc<"agents">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type AgentStatus = "online" | "busy" | "idle" | "offline" | "error";

const STATUS_OPTIONS: { value: AgentStatus; label: string; description: string; color: string }[] = [
  { value: "online", label: "Online", description: "Agent is active and ready", color: "bg-emerald-500" },
  { value: "busy", label: "Busy", description: "Agent is currently working on a task", color: "bg-amber-500" },
  { value: "idle", label: "Idle", description: "Agent is available but not active", color: "bg-blue-400" },
  { value: "offline", label: "Offline", description: "Agent is not running", color: "bg-muted-foreground/40" },
  { value: "error", label: "Error", description: "Agent has encountered an error", color: "bg-destructive" },
];

/**
 * Dialog for manually updating agent status.
 */
export function AgentStatusDialog({ agent, open, onOpenChange }: AgentStatusDialogProps) {
  const [status, setStatus] = useState<AgentStatus>(agent.status as AgentStatus);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateStatus = useMutation(api.agents.updateStatus);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === agent.status) {
      onOpenChange(false);
      return;
    }

    setIsSubmitting(true);
    try {
      await updateStatus({
        agentId: agent._id,
        status,
      });
      toast.success("Agent status updated");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to update status", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update Agent Status</DialogTitle>
          <DialogDescription>
            Manually override the status for <span className="font-medium">{agent.name}</span>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="agent-status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as AgentStatus)}>
              <SelectTrigger id="agent-status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full", opt.color)} />
                      <span>{opt.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {STATUS_OPTIONS.find((o) => o.value === status)?.description}
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? "Updating..." : "Update Status"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
