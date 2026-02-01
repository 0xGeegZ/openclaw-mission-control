"use client";

import { Doc } from "@packages/backend/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@packages/ui/components/card";
import { Avatar, AvatarFallback } from "@packages/ui/components/avatar";
import { cn } from "@packages/ui/lib/utils";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

interface AgentCardProps {
  agent: Doc<"agents">;
  accountSlug: string;
}

const statusColors: Record<string, string> = {
  online: "bg-green-500",
  busy: "bg-yellow-500",
  idle: "bg-blue-500",
  offline: "bg-gray-500",
  error: "bg-red-500",
};

/**
 * Agent card component for roster display.
 */
export function AgentCard({ agent, accountSlug }: AgentCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback>{agent.name[0]}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div 
                className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  statusColors[agent.status] || statusColors.offline
                )}
              />
              <CardTitle className="text-base truncate">{agent.name}</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">{agent.role}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {agent.lastHeartbeat && (
          <p className="text-xs text-muted-foreground">
            Last seen: {formatDistanceToNow(agent.lastHeartbeat, { addSuffix: true })}
          </p>
        )}
        {!agent.lastHeartbeat && (
          <p className="text-xs text-muted-foreground">Never active</p>
        )}
      </CardContent>
    </Card>
  );
}
