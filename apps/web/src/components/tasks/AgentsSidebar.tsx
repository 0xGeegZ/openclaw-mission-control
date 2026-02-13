"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id, Doc } from "@packages/backend/convex/_generated/dataModel";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@packages/ui/components/avatar";
import { Badge } from "@packages/ui/components/badge";
import { Button } from "@packages/ui/components/button";
import { ScrollArea } from "@packages/ui/components/scroll-area";
import { Skeleton } from "@packages/ui/components/skeleton";
import { cn } from "@packages/ui/lib/utils";
import { Users, Crown } from "lucide-react";
import { AGENT_ICON_MAP } from "@/lib/agentIcons";
import { AGENT_STATUS } from "@packages/shared";

interface AgentsSidebarProps {
  accountId: Id<"accounts"> | null;
  selectedAgentId: Id<"agents"> | null;
  onSelectAgent: (agentId: Id<"agents"> | null) => void;
  className?: string;
}

function isLeadRole(role: string): boolean {
  const lowerRole = role.toLowerCase();
  return (
    lowerRole.includes("lead") ||
    lowerRole.includes("founder") ||
    lowerRole.includes("director")
  );
}

const STATUS_CONFIG: Record<
  string,
  { color: string; textColor: string; label: string }
> = {
  online: { color: "bg-primary", textColor: "text-primary", label: "ONLINE" },
  busy: { color: "bg-amber-500", textColor: "text-amber-500", label: "BUSY" },
  idle: { color: "bg-blue-400", textColor: "text-blue-400", label: "IDLE" },
  offline: {
    color: "bg-amber-500/80",
    textColor: "text-amber-500",
    label: "OFFLINE",
  },
  error: { color: "bg-destructive", textColor: "text-destructive", label: "ERROR" },
  typing: {
    color: "bg-cyan-500",
    textColor: "text-cyan-500",
    label: "TYPING",
  },
};

/**
 * Agents sidebar component for task view.
 * Shows all agents with their status and allows filtering tasks by agent.
 */
export function AgentsSidebar({
  accountId,
  selectedAgentId,
  onSelectAgent,
  className,
}: AgentsSidebarProps) {
  const agents = useQuery(
    api.agents.getRoster,
    accountId ? { accountId } : "skip",
  );
  const typingAgentIdsRaw = useQuery(
    api.notifications.listAgentIdsTypingByAccount,
    accountId ? { accountId } : "skip",
  );
  const typingAgentIds = useMemo(
    () => new Set(typingAgentIdsRaw ?? []),
    [typingAgentIdsRaw],
  );

  const isLoading = accountId && agents === undefined;
  const activeAgents =
    agents?.filter((a) => a.status === AGENT_STATUS.ONLINE || a.status === AGENT_STATUS.BUSY) ?? [];

  return (
    <div className={cn("flex flex-col h-full border-r bg-card", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary" />
          <h2 className="font-semibold text-sm uppercase tracking-wide">
            Agents
          </h2>
          <Badge variant="secondary" className="text-xs font-medium">
            {agents?.length ?? 0}
          </Badge>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {/* All Agents button */}
          <Button
            variant={selectedAgentId === null ? "secondary" : "ghost"}
            className={cn(
              "w-full justify-start gap-3 h-auto py-3 px-3 mb-1",
              selectedAgentId === null && "bg-accent",
            )}
            onClick={() => onSelectAgent(null)}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <div className="font-medium">All Agents</div>
              <div className="text-xs text-muted-foreground">
                {activeAgents.length > 0 && (
                  <span className="text-primary">
                    {activeAgents.length} active
                  </span>
                )}
                {activeAgents.length === 0 && (
                  <span>{agents?.length ?? 0} total</span>
                )}
              </div>
            </div>
          </Button>

          {/* Loading state */}
          {isLoading && (
            <div className="space-y-2 mt-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Agent list */}
          {agents && agents.length > 0 && (
            <div className="space-y-1 mt-2">
              {agents.map((agent) => (
                <AgentItem
                  key={agent._id}
                  agent={agent}
                  isSelected={selectedAgentId === agent._id}
                  isTyping={typingAgentIds.has(agent._id)}
                  onClick={() => onSelectAgent(agent._id)}
                />
              ))}
            </div>
          )}

          {/* Empty state */}
          {agents && agents.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center px-4">
              <Users className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">No agents yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create agents to get started
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

interface AgentItemProps {
  agent: Doc<"agents">;
  isSelected: boolean;
  isTyping: boolean;
  onClick: () => void;
}

/** Single agent row in the sidebar; shows status or TYPING when in receipt window. */
function AgentItem({ agent, isSelected, isTyping, onClick }: AgentItemProps) {
  const statusConfig = isTyping
    ? STATUS_CONFIG.typing
    : (STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.offline);
  const isLead = isLeadRole(agent.role);
  const FallbackIcon = agent.icon ? AGENT_ICON_MAP[agent.icon] : null;

  return (
    <Button
      variant={isSelected ? "secondary" : "ghost"}
      className={cn(
        "w-full justify-start gap-3 h-auto py-3 px-3",
        isSelected && "bg-accent",
      )}
      onClick={onClick}
    >
      <Avatar className="h-10 w-10 border-2 border-background">
        {agent.avatarUrl ? (
          <AvatarImage src={agent.avatarUrl} alt={agent.name} />
        ) : null}
        <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
          {FallbackIcon ? (
            <FallbackIcon
              className="h-5 w-5 text-primary"
              aria-hidden
            />
          ) : (
            agent.name.slice(0, 2).toUpperCase()
          )}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 text-left min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium truncate">{agent.name}</span>
          {isLead && (
            <Crown
              className="h-4 w-4 text-amber-500 shrink-0"
              aria-label="Lead"
            />
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full shrink-0",
              statusConfig.color,
            )}
          />
          <span
            className={cn(
              "text-xs font-medium uppercase tracking-wide",
              statusConfig.textColor,
            )}
          >
            {statusConfig.label}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {agent.role}
        </p>
      </div>
    </Button>
  );
}
