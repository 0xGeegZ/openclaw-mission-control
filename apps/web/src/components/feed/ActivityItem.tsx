"use client";

import { Doc } from "@packages/backend/convex/_generated/dataModel";
import { formatDistanceToNow } from "date-fns";
import { getActivityDescription } from "@packages/backend/convex/lib/activity";
import { Avatar, AvatarFallback } from "@packages/ui/components/avatar";
import { User, Bot, Settings } from "lucide-react";
import { cn } from "@packages/ui/lib/utils";

interface ActivityItemProps {
  activity: Doc<"activities">;
  accountSlug: string;
}

const actorConfig: Record<string, { icon: typeof User; className: string }> = {
  user: { icon: User, className: "bg-primary/10 text-primary" },
  agent: { icon: Bot, className: "bg-secondary text-secondary-foreground" },
  system: { icon: Settings, className: "bg-muted text-muted-foreground" },
};

/**
 * Single activity item in feed.
 */
export function ActivityItem({ activity, accountSlug }: ActivityItemProps) {
  const config = actorConfig[activity.actorType] || actorConfig.system;
  const Icon = config.icon;
  
  return (
    <div className="flex gap-3 px-4 py-4 hover:bg-muted/50 transition-colors">
      <div className="flex flex-col items-center">
        <Avatar className={cn("h-9 w-9 border shadow-sm", config.className)}>
          <AvatarFallback className={config.className}>
            <Icon className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 w-px bg-border mt-2 last:hidden" />
      </div>
      
      <div className="flex-1 min-w-0 pt-1">
        <p className="text-sm leading-relaxed">
          <span className="font-medium text-foreground">{activity.actorName}</span>
          {" "}
          <span className="text-muted-foreground">
            {getActivityDescription(activity.type, activity.actorName, activity.targetName)}
          </span>
        </p>
        
        <p className="text-xs text-muted-foreground mt-1.5">
          {formatDistanceToNow(activity.createdAt, { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}
