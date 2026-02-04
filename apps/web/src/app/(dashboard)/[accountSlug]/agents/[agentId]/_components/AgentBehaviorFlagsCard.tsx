"use client";

import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import type { Doc } from "@packages/backend/convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/card";
import { Button } from "@packages/ui/components/button";
import { Label } from "@packages/ui/components/label";
import { Checkbox } from "@packages/ui/components/checkbox";
import { Save, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@packages/ui/lib/utils";
import { DEFAULT_OPENCLAW_CONFIG } from "@packages/shared";

type BehaviorFlags = {
  canCreateTasks: boolean;
  canModifyTaskStatus: boolean;
  canCreateDocuments: boolean;
  canMentionAgents: boolean;
};

/** Default behavior flags; single source from shared config. */
const DEFAULT_FLAGS: BehaviorFlags = {
  ...DEFAULT_OPENCLAW_CONFIG.behaviorFlags,
};

interface AgentBehaviorFlagsCardProps {
  agent: Doc<"agents">;
  /** Account-level default flags (partial ok); null when not set. */
  accountDefaults: Partial<BehaviorFlags> | null;
}

/**
 * Per-agent behavior flags card with "Use account defaults" toggle.
 * When using defaults, checkboxes are disabled and show account values; on save, behaviorFlags are omitted so backend uses account defaults.
 */
export function AgentBehaviorFlagsCard({
  agent,
  accountDefaults,
}: AgentBehaviorFlagsCardProps) {
  const updateOpenclawConfig = useMutation(api.agents.updateOpenclawConfig);
  const [useAccountDefaults, setUseAccountDefaults] = useState(true);
  const [flags, setFlags] = useState<BehaviorFlags>(DEFAULT_FLAGS);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const effectiveDefaults: BehaviorFlags = {
    ...DEFAULT_FLAGS,
    ...(accountDefaults ?? {}),
  };

  const agentFlags = agent.openclawConfig?.behaviorFlags as
    | Partial<BehaviorFlags>
    | undefined;
  const hasAgentOverride = agentFlags != null && typeof agentFlags === "object";

  useEffect(() => {
    setUseAccountDefaults(!hasAgentOverride);
    if (hasAgentOverride && agentFlags) {
      setFlags({ ...DEFAULT_FLAGS, ...accountDefaults, ...agentFlags });
    } else {
      setFlags({ ...DEFAULT_FLAGS, ...accountDefaults });
    }
  }, [hasAgentOverride, accountDefaults, agentFlags]);

  const displayFlags = useAccountDefaults ? effectiveDefaults : flags;

  const handleToggleDefaults = (checked: boolean) => {
    setUseAccountDefaults(checked);
    if (checked) {
      setFlags(effectiveDefaults);
    } else {
      setFlags({ ...effectiveDefaults, ...agentFlags });
    }
    setIsDirty(true);
  };

  const handleFlagChange = (key: keyof BehaviorFlags, value: boolean) => {
    setFlags((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!agent.openclawConfig) return;
    setIsSaving(true);
    try {
      const current = agent.openclawConfig;
      const base = {
        model: current.model,
        temperature: current.temperature,
        maxTokens: current.maxTokens,
        systemPromptPrefix: current.systemPromptPrefix,
        skillIds: current.skillIds ?? [],
        contextConfig: current.contextConfig,
        rateLimits: current.rateLimits,
      };
      const config = useAccountDefaults
        ? { ...base }
        : { ...base, behaviorFlags: flags };
      await updateOpenclawConfig({
        agentId: agent._id,
        config,
      });
      toast.success("Behavior flags saved");
      setIsDirty(false);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to save behavior flags",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          Behavior flags
        </CardTitle>
        <CardDescription className="text-xs">
          Override account defaults for this agent. When using account defaults,
          changes in admin OpenClaw settings apply automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Label
            htmlFor="use-account-defaults"
            className="text-sm font-medium cursor-pointer"
          >
            Use account defaults
          </Label>
          <Checkbox
            id="use-account-defaults"
            checked={useAccountDefaults}
            onCheckedChange={(c) => handleToggleDefaults(c === true)}
          />
        </div>

        <div
          className={cn(
            "grid gap-3 sm:grid-cols-2",
            useAccountDefaults && "opacity-70",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <Label
              htmlFor="bf-create-tasks"
              className="text-sm cursor-pointer shrink-0"
            >
              Create tasks
            </Label>
            <Checkbox
              id="bf-create-tasks"
              checked={displayFlags.canCreateTasks}
              disabled={useAccountDefaults}
              onCheckedChange={(c) =>
                handleFlagChange("canCreateTasks", c === true)
              }
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label
              htmlFor="bf-modify-status"
              className="text-sm cursor-pointer shrink-0"
            >
              Modify task status
            </Label>
            <Checkbox
              id="bf-modify-status"
              checked={displayFlags.canModifyTaskStatus}
              disabled={useAccountDefaults}
              onCheckedChange={(c) =>
                handleFlagChange("canModifyTaskStatus", c === true)
              }
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label
              htmlFor="bf-create-docs"
              className="text-sm cursor-pointer shrink-0"
            >
              Create documents
            </Label>
            <Checkbox
              id="bf-create-docs"
              checked={displayFlags.canCreateDocuments}
              disabled={useAccountDefaults}
              onCheckedChange={(c) =>
                handleFlagChange("canCreateDocuments", c === true)
              }
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label
              htmlFor="bf-mention-agents"
              className="text-sm cursor-pointer shrink-0"
            >
              Mention other agents
            </Label>
            <Checkbox
              id="bf-mention-agents"
              checked={displayFlags.canMentionAgents}
              disabled={useAccountDefaults}
              onCheckedChange={(c) =>
                handleFlagChange("canMentionAgents", c === true)
              }
            />
          </div>
        </div>

        {(isDirty || hasAgentOverride) && (
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="w-full sm:w-auto"
          >
            <Save className="mr-2 h-4 w-4" />
            {isSaving
              ? "Saving..."
              : useAccountDefaults
                ? "Save to use account defaults"
                : "Save overrides"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
