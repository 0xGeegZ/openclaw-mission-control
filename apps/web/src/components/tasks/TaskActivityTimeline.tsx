"use client";

import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id } from "@packages/backend/convex/_generated/dataModel";
import { ScrollArea } from "@packages/ui/components/scroll-area";
import { Skeleton } from "@packages/ui/components/skeleton";
import { ActivityItem } from "@/components/feed/ActivityItem";

interface TaskActivityTimelineProps {
  taskId: Id<"tasks">;
  accountSlug: string;
}

/**
 * Activity timeline for a specific task.
 * Shows all task events: created, status changed, assigned, messages, documents.
 */
export function TaskActivityTimeline({
  taskId,
  accountSlug,
}: TaskActivityTimelineProps) {
  const activities = useQuery(api.activities.listByTarget, {
    targetType: "task",
    targetId: taskId,
    limit: 100,
  });

  return (
    <ScrollArea className="h-full">
      <div className="divide-y divide-border">
        {activities === undefined ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3 py-3">
                <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <p className="text-sm">No activity yet</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline connector background */}
            <div className="absolute left-[29px] top-0 bottom-0 w-px bg-gradient-to-b from-border via-border to-transparent" />
            
            {/* Activity items */}
            {activities.map((activity) => (
              <ActivityItem
                key={activity._id}
                activity={activity}
                accountSlug={accountSlug}
              />
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
