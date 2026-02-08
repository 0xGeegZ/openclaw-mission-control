"use client";

import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useAccount } from "@/lib/hooks/useAccount";
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
import { toast } from "sonner";
import { Loader2, Bot, Sparkles, AtSign, Briefcase } from "lucide-react";
import { AGENT_ICON_NAMES, getAgentIconComponent } from "@/lib/agentIcons";

interface CreateAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog for creating a new agent.
 */
export function CreateAgentDialog({ open, onOpenChange }: CreateAgentDialogProps) {
  const { accountId } = useAccount();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [role, setRole] = useState("");
  const [icon, setIcon] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const createAgent = useMutation(api.agents.create);

  // Auto-generate slug from name
  useEffect(() => {
    if (name) {
      setSlug(name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""));
    }
  }, [name]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId || !name.trim() || !slug.trim()) return;
    
    setIsSubmitting(true);
    try {
      await createAgent({
        accountId,
        name: name.trim(),
        slug: slug.trim(),
        role: role.trim() || "Agent",
        icon: icon.trim() || undefined,
      });

      toast.success("Agent created successfully");
      setName("");
      setSlug("");
      setRole("");
      setIcon("");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to create agent", {
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
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-violet-500/10">
              <Bot className="h-5 w-5 text-violet-500" />
            </div>
            <div>
              <DialogTitle className="text-lg">Create Agent</DialogTitle>
              <DialogDescription className="text-sm mt-0.5">
                Add a new AI agent to your team
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Research Assistant"
              required
              autoFocus
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug" className="text-sm font-medium flex items-center gap-2">
              <AtSign className="h-3.5 w-3.5 text-muted-foreground" />
              Mention Handle
              <span className="text-muted-foreground/60 font-normal text-xs">(auto-generated)</span>
            </Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s/g, "-"))}
              placeholder="agent-slug"
              required
              className="font-mono text-sm h-11"
            />
            <p className="text-[11px] text-muted-foreground/60">
              Mention this agent in messages with <code className="px-1 py-0.5 rounded bg-muted text-[10px]">@{slug || "agent-slug"}</code>
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="role" className="text-sm font-medium flex items-center gap-2">
              <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
              Role
              <span className="text-muted-foreground/60 font-normal text-xs">(optional)</span>
            </Label>
            <Input
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g., Squad Lead, SEO Analyst, Content Writer"
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-agent-icon" className="text-sm font-medium">
              Icon
              <span className="text-muted-foreground/60 font-normal text-xs ml-1">(optional)</span>
            </Label>
            <Select value={icon || "__none__"} onValueChange={(v) => setIcon(v === "__none__" ? "" : v)}>
              <SelectTrigger id="create-agent-icon" className="h-11">
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
          </div>
          <DialogFooter className="gap-2 sm:gap-2 pt-2">
            <Button 
              type="button" 
              variant="ghost" 
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting || !name.trim() || !slug.trim()}
              className="min-w-[130px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Create Agent
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
