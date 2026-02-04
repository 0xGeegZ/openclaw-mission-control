"use client";

import Link from "next/link";
import { Doc } from "@packages/backend/convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/card";
import { Avatar, AvatarFallback } from "@packages/ui/components/avatar";
import { Badge } from "@packages/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@packages/ui/components/tooltip";
import { cn } from "@packages/ui/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Clock, Crown } from "lucide-react";

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
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  online: { color: "bg-primary", label: "Online", variant: "default" },
  busy: { color: "bg-primary/60", label: "Busy", variant: "secondary" },
  idle: {
    color: "bg-secondary-foreground/40",
    label: "Idle",
    variant: "outline",
  },
  offline: {
    color: "bg-muted-foreground/40",
    label: "Offline",
    variant: "outline",
  },
  error: { color: "bg-destructive", label: "Error", variant: "destructive" },
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

  return (
    <Link href={`/${accountSlug}/agents/${agent._id}`}>
      <Card className="hover:shadow-md hover:border-primary/20 transition-all group h-full">
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <Avatar className="h-11 w-11 border-2 border-background shadow-sm">
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {agent.name[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 min-w-0">
                  <CardTitle className="text-base truncate group-hover:text-primary transition-colors">
                    {agent.name}
                  </CardTitle>
                  {isOrchestrator && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className="shrink-0 text-amber-500"
                          aria-label="Orchestrator"
                        >
                          <Crown className="h-4 w-4" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {ORCHESTRATOR_TOOLTIP}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant={status.variant} className="text-xs">
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full mr-1.5",
                        status.color,
                      )}
                    />
                    {status.label}
                  </Badge>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {agent.role}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {agent.lastHeartbeat ? (
              <span>
                Last seen{" "}
                {formatDistanceToNow(agent.lastHeartbeat, { addSuffix: true })}
              </span>
            ) : (
              <span>Never active</span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
