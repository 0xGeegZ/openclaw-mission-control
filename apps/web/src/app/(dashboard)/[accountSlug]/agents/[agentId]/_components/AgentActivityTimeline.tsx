"use client";

import type { Doc } from "@packages/backend/convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/card";
import { ActivityItem } from "@/components/feed/ActivityItem";
import { Clock } from "lucide-react";

interface AgentActivityTimelineProps {
  activities: Doc<"activities">[];
  accountSlug: string;
  limit?: number;
}

/**
 * Display a focused activity timeline for an agent with recent actions.
 */
export function AgentActivityTimeline({
  activities,
  accountSlug,
  limit = 15,
}: AgentActivityTimelineProps) {
  const displayActivities = activities.slice(0, limit);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Activity Timeline
        </CardTitle>
        <CardDescription className="text-xs">
          {activities.length > 0
            ? `Showing ${displayActivities.length} of ${activities.length} recent actions`
            : "No activity yet"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {displayActivities.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No activity recorded
          </p>
        ) : (
          <ul className="space-y-3 divide-y divide-border">
            {displayActivities.map((activity) => (
              <li key={activity._id} className="pt-3 first:pt-0">
                <ActivityItem activity={activity} accountSlug={accountSlug} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
