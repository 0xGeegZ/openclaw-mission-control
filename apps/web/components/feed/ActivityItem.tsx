"use client";

import { Doc } from "@packages/backend/convex/_generated/dataModel";
import { formatDistanceToNow } from "date-fns";
import { getActivityDescription } from "@packages/backend/convex/lib/activity";

interface ActivityItemProps {
  activity: Doc<"activities">;
  accountSlug: string;
}

const actorIcons: Record<string, string> = {
  user: "👤",
  agent: "🤖",
  system: "⚙️",
};

/**
 * Single activity item in feed.
 */
export function ActivityItem({ activity, accountSlug }: ActivityItemProps) {
  return (
    <div className="flex gap-3 py-3 border-b last:border-0">
      <div className="flex flex-col items-center">
        <span className="text-lg">{actorIcons[activity.actorType] || "⚙️"}</span>
        <div className="flex-1 w-px bg-border mt-2" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{activity.actorName}</span>
          <span className="text-muted-foreground">
            {getActivityDescription(activity.type, activity.actorName, activity.targetName)}
          </span>
        </div>
        
        <p className="text-xs text-muted-foreground mt-1">
          {formatDistanceToNow(activity.createdAt, { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}
