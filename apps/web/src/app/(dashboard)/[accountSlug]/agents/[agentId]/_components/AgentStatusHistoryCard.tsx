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
import { CircleDot } from "lucide-react";
import { useRelativeTime } from "@/lib/hooks/useRelativeTime";

interface StatusHistory {
  timestamp: number;
  status: string;
  actorName?: string;
}

interface AgentStatusHistoryCardProps {
  statusHistory?: StatusHistory[];
  agent: Doc<"agents">;
}

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  online: "default",
  busy: "secondary",
  idle: "outline",
  offline: "outline",
  error: "destructive",
};

/**
 * StatusHistoryEntry: sub-component that calls useRelativeTime in its own component body.
 * Fixes React Hooks rule violation by calling hook at component level, not in parent callback.
 */
function StatusHistoryEntry({ entry }: { entry: StatusHistory }) {
  const relativeTime = useRelativeTime(entry.timestamp, { addSuffix: true });
  const variant = statusColors[entry.status as keyof typeof statusColors] ?? "outline";

  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 mt-1">
        <CircleDot className="h-3 w-3 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={variant} className="text-xs capitalize">
            {entry.status}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {relativeTime}
          </span>
        </div>
        {entry.actorName && (
          <p className="text-xs text-muted-foreground mt-1">
            via {entry.actorName}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Display agent status change history.
 */
export function AgentStatusHistoryCard({
  statusHistory = [],
  agent,
}: AgentStatusHistoryCardProps) {
  // If no history, create a placeholder showing current status
  const displayHistory = statusHistory.length > 0
    ? statusHistory
    : [{ timestamp: agent.createdAt ?? 0, status: agent.status, actorName: "System" }];

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CircleDot className="h-4 w-4" />
          Status History
        </CardTitle>
        <CardDescription className="text-xs">
          Recent status changes
        </CardDescription>
      </CardHeader>
      <CardContent>
        {displayHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">No status history available</p>
        ) : (
          <div className="space-y-3">
            {displayHistory.map((entry, idx) => (
              <StatusHistoryEntry key={idx} entry={entry} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
