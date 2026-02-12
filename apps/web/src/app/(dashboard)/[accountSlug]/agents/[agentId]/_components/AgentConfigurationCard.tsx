"use client";

import type { Doc } from "@packages/backend/convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/card";
import { Badge } from "@packages/ui/components/badge";
import {
  Settings,
  Cpu,
  Zap,
  BookOpen,
  Tag,
} from "lucide-react";

interface AgentConfigurationCardProps {
  agent: Doc<"agents">;
}

/**
 * Display agent OpenClaw configuration: model, temperature, system prompt, skills.
 */
export function AgentConfigurationCard({
  agent,
}: AgentConfigurationCardProps) {
  const config = agent.openclawConfig;

  if (!config) {
    return null;
  }

  const skillIds = config.skillIds || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Configuration
        </CardTitle>
        <CardDescription className="text-xs">
          Agent model, temperature, and system prompt configuration
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Model */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Cpu className="h-4 w-4 text-muted-foreground" />
            Model
          </div>
          <p className="text-sm text-muted-foreground font-mono break-all">
            {config.model || "—"}
          </p>
        </div>

        {/* Temperature */}
        {config.temperature !== undefined && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Zap className="h-4 w-4 text-muted-foreground" />
              Temperature
            </div>
            <p className="text-sm text-muted-foreground">
              {config.temperature}
            </p>
          </div>
        )}

        {/* Max Tokens */}
        {config.maxTokens && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Tag className="h-4 w-4 text-muted-foreground" />
              Max Tokens
            </div>
            <p className="text-sm text-muted-foreground">
              {config.maxTokens.toLocaleString()}
            </p>
          </div>
        )}

        {/* System Prompt Prefix */}
        {config.systemPromptPrefix && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              System Prompt
            </div>
            <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md font-mono text-xs leading-relaxed max-h-40 overflow-auto whitespace-pre-wrap break-words">
              {config.systemPromptPrefix}
            </p>
          </div>
        )}

        {/* Skills */}
        {skillIds.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Tag className="h-4 w-4 text-muted-foreground" />
              Skills ({skillIds.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {skillIds.map((skillId) => (
                <Badge key={skillId} variant="outline" className="text-xs">
                  {skillId}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {!config.systemPromptPrefix && skillIds.length === 0 && !config.temperature && !config.maxTokens && (
          <p className="text-sm text-muted-foreground italic">
            No custom configuration set
          </p>
        )}
      </CardContent>
    </Card>
  );
}
