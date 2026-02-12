"use client";

import { useState, useEffect } from "react";
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
import { Input } from "@packages/ui/components/input";
import { Label } from "@packages/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/select";
import { Textarea } from "@packages/ui/components/textarea";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { AGENT_ICON_NAMES, getAgentIconComponent } from "@/lib/agentIcons";

interface AgentEditDialogProps {
  agent: Doc<"agents">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog for editing agent details: name, role, description.
 */
export function AgentEditDialog({ agent, open, onOpenChange }: AgentEditDialogProps) {
  const [name, setName] = useState(agent.name);
  const [role, setRole] = useState(agent.role);
  const [description, setDescription] = useState(agent.description ?? "");
  const [heartbeatInterval, setHeartbeatInterval] = useState(
    String(agent.heartbeatInterval ?? 15),
  );
  const [icon, setIcon] = useState(agent.icon ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateAgent = useMutation(api.agents.update);

  // Sync state when agent changes
  useEffect(() => {
    setName(agent.name);
    setRole(agent.role);
    setDescription(agent.description ?? "");
    setHeartbeatInterval(String(agent.heartbeatInterval ?? 15));
    setIcon(agent.icon ?? "");
  }, [agent]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !role.trim()) return;

    setIsSubmitting(true);
    try {
      await updateAgent({
        agentId: agent._id,
        name: name.trim(),
        role: role.trim(),
        description: description.trim() || undefined,
        heartbeatInterval: parseInt(heartbeatInterval, 10) || 15,
        icon: icon.trim() || undefined,
      });
      toast.success("Agent updated");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to update agent", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Agent</DialogTitle>
          <DialogDescription>
            Update agent settings and configuration.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="agent-name">Name</Label>
              <Input
                id="agent-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Agent name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-role">Role</Label>
              <Input
                id="agent-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g., Research Assistant"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="agent-description">Description</Label>
            <Textarea
              id="agent-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the agent's purpose..."
              rows={3}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="agent-icon">Icon</Label>
            <Select
              value={icon || "__none__"}
              onValueChange={(v) => setIcon(v === "__none__" ? "" : v)}
            >
              <SelectTrigger id="agent-icon">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {AGENT_ICON_NAMES.map((iconName) => {
                  const IconComponent = getAgentIconComponent(iconName);
                  return (
                    <SelectItem key={iconName} value={iconName}>
                      <span className="flex items-center gap-2">
                        <IconComponent className="h-4 w-4" aria-hidden />
                        {iconName}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Icon shown when the agent has no avatar image.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="heartbeat-interval">Heartbeat Interval (minutes)</Label>
            <Input
              id="heartbeat-interval"
              type="number"
              min="1"
              max="60"
              value={heartbeatInterval}
              onChange={(e) => setHeartbeatInterval(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              How often the agent should check in. Lower values = more responsive.
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
            <Button type="submit" disabled={isSubmitting || !name.trim() || !role.trim()}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
