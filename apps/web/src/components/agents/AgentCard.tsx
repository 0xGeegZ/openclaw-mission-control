"use client";

import Link from "next/link";
import { Doc } from "@packages/backend/convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/card";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@packages/ui/components/avatar";
import { Badge } from "@packages/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@packages/ui/components/tooltip";
import { cn } from "@packages/ui/lib/utils";
import { Clock, Crown, ChevronRight, Zap } from "lucide-react";
import { useRelativeTime } from "@/lib/hooks/useRelativeTime";
import { AGENT_ICON_MAP } from "@/lib/agentIcons";
import { AGENT_STATUS } from "@packages/shared";

const ORCHESTRATOR_TOOLTIP =
  "Orchestrator: auto-subscribed to all task threads; receives agent thread updates for review.";

interface AgentCardProps {
  agent: Doc<"agents">;
  accountSlug: string;
  /** When true, show Orchestrator badge. */
  isOrchestrator?: boolean;
}

const statusConfig: Record<
  string,
  {
    color: string;
    pulseColor: string;
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  online: {
    color: "bg-emerald-500",
    pulseColor: "bg-emerald-400",
    label: "Online",
    variant: "default",
  },
  busy: {
    color: "bg-amber-500",
    pulseColor: "bg-amber-400",
    label: "Busy",
    variant: "secondary",
  },
  idle: {
    color: "bg-slate-400",
    pulseColor: "bg-slate-300",
    label: "Idle",
    variant: "outline",
  },
  offline: {
    color: "bg-muted-foreground/40",
    pulseColor: "bg-muted-foreground/30",
    label: "Offline",
    variant: "outline",
  },
  error: {
    color: "bg-destructive",
    pulseColor: "bg-destructive/70",
    label: "Error",
    variant: "destructive",
  },
};

/**
 * Agent card component for roster display.
 */
export function AgentCard({
  agent,
  accountSlug,
  isOrchestrator,
}: AgentCardProps) {
  const status = statusConfig[agent.status] || statusConfig.offline;
  const isActive =
    agent.status === AGENT_STATUS.ONLINE || agent.status === AGENT_STATUS.BUSY;
  const FallbackIcon = agent.icon ? AGENT_ICON_MAP[agent.icon] : null;
  const relativeTime = useRelativeTime(agent.lastHeartbeat, {
    addSuffix: true,
    fallback: "Never active",
  });

  return (
    <Link href={`/${accountSlug}/agents/${agent._id}`}>
      <Card
        className={cn(
          "relative overflow-hidden transition-all duration-300 group h-full",
          "hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30",
          "border-border/60",
          isOrchestrator && "ring-1 ring-amber-500/20",
        )}
      >
        {/* Subtle gradient accent at top */}
        <div
          className={cn(
            "absolute top-0 left-0 right-0 h-1 transition-all duration-300",
            isActive
              ? "bg-gradient-to-r from-emerald-500/80 to-emerald-400/40"
              : "bg-gradient-to-r from-muted-foreground/20 to-transparent",
          )}
        />

        <CardHeader className="pb-3 pt-5">
          <div className="flex items-start gap-3.5">
            {/* Avatar with status indicator */}
            <div className="relative">
              <Avatar
                className={cn(
                  "h-12 w-12 ring-2 ring-background shadow-md transition-transform duration-300 group-hover:scale-105",
                  isActive && "ring-emerald-500/20",
                )}
              >
                {agent.avatarUrl ? (
                  <AvatarImage src={agent.avatarUrl} alt={agent.name} />
                ) : null}
                <AvatarFallback className="bg-gradient-to-br from-primary/15 to-primary/5 text-primary font-semibold text-lg">
                  {FallbackIcon ? (
                    <FallbackIcon
                      className="h-6 w-6 text-primary"
                      aria-hidden
                    />
                  ) : (
                    agent.name[0].toUpperCase()
                  )}
                </AvatarFallback>
              </Avatar>
              {/* Status dot with pulse animation for active states */}
              <div className="absolute -bottom-0.5 -right-0.5">
                <span
                  className={cn(
                    "flex h-3.5 w-3.5 items-center justify-center rounded-full ring-2 ring-background",
                    status.color,
                  )}
                >
                  {isActive && (
                    <span
                      className={cn(
                        "absolute h-full w-full rounded-full animate-ping opacity-75",
                        status.pulseColor,
                      )}
                    />
                  )}
                </span>
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <CardTitle className="text-base font-semibold truncate group-hover:text-primary transition-colors">
                    {agent.name}
                  </CardTitle>
                  {isOrchestrator && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className="shrink-0 flex items-center justify-center h-5 w-5 rounded-full bg-amber-500/10"
                          aria-label="Orchestrator"
                        >
                          <Crown className="h-3 w-3 text-amber-500" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        {ORCHESTRATOR_TOOLTIP}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-0.5" />
              </div>
              <p className="text-sm text-muted-foreground mt-0.5 truncate">
                {agent.role}
              </p>
              {/* Status badge - more compact */}
              <div className="flex items-center gap-2 mt-2">
                <Badge
                  variant={status.variant}
                  className={cn(
                    "text-[10px] px-2 py-0.5 font-medium gap-1",
                    status.variant === "default" &&
                      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
                    status.variant === "secondary" &&
                      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
                  )}
                >
                  {isActive && <Zap className="h-2.5 w-2.5" />}
                  {status.label}
                </Badge>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 pb-4">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
            <Clock className="h-3 w-3" />
            <span>
              {agent.lastHeartbeat ? `Active ${relativeTime}` : relativeTime}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
