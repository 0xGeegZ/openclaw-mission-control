"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id } from "@packages/backend/convex/_generated/dataModel";
import { ScrollArea } from "@packages/ui/components/scroll-area";
import { Skeleton } from "@packages/ui/components/skeleton";
import { Label } from "@packages/ui/components/label";
import { ActivityItem } from "@/components/feed/ActivityItem";
import type { ActivityType } from "@packages/backend/convex/lib/activity";

interface TaskActivityTimelineProps {
  taskId: Id<"tasks">;
  accountSlug: string;
}

type ActivityFilter = "all" | "status_changes" | "assignments" | "comments_documents";

/**
 * Activity timeline for a specific task.
 * Shows all task events: created, status changed, assigned, messages, documents.
 * Supports filtering by activity type.
 */
export function TaskActivityTimeline({
  taskId,
  accountSlug,
}: TaskActivityTimelineProps) {
  const [filter, setFilter] = useState<ActivityFilter>("all");

  const activities = useQuery(api.activities.listByTarget, {
    targetType: "task",
    targetId: taskId,
    limit: 100,
  });

  /**
   * Filter activities based on selected filter.
   * Maps activity types to filter categories:
   * - Status Changes: task_status_changed
   * - Assignments: task_updated (when assignedAgentIds changed)
   * - Comments & Documents: message_created, document_created, document_updated
   */
  const filteredActivities = activities
    ? activities.filter((activity) => {
        if (filter === "all") return true;

        const actType = activity.type as ActivityType;

        switch (filter) {
          case "status_changes":
            return actType === "task_status_changed";
          case "assignments":
            return actType === "task_updated";
          case "comments_documents":
            return (
              actType === "message_created" ||
              actType === "document_created" ||
              actType === "document_updated"
            );
          default:
            return true;
        }
      })
    : undefined;

  return (
    <div className="h-full flex flex-col">
      {/* Filter controls */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <input
              type="radio"
              id="filter-all"
              name="activity-filter"
              value="all"
              checked={filter === "all"}
              onChange={(e) => setFilter(e.target.value as ActivityFilter)}
              className="cursor-pointer"
            />
            <Label htmlFor="filter-all" className="cursor-pointer font-normal text-sm">
              All
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="radio"
              id="filter-status"
              name="activity-filter"
              value="status_changes"
              checked={filter === "status_changes"}
              onChange={(e) => setFilter(e.target.value as ActivityFilter)}
              className="cursor-pointer"
            />
            <Label htmlFor="filter-status" className="cursor-pointer font-normal text-sm">
              Status Changes
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="radio"
              id="filter-assignments"
              name="activity-filter"
              value="assignments"
              checked={filter === "assignments"}
              onChange={(e) => setFilter(e.target.value as ActivityFilter)}
              className="cursor-pointer"
            />
            <Label htmlFor="filter-assignments" className="cursor-pointer font-normal text-sm">
              Assignments
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="radio"
              id="filter-comments"
              name="activity-filter"
              value="comments_documents"
              checked={filter === "comments_documents"}
              onChange={(e) => setFilter(e.target.value as ActivityFilter)}
              className="cursor-pointer"
            />
            <Label htmlFor="filter-comments" className="cursor-pointer font-normal text-sm">
              Comments & Documents
            </Label>
          </div>
        </div>
      </div>

      {/* Timeline content */}
      <ScrollArea className="h-full flex-1">
        <div className="divide-y divide-border">
          {filteredActivities === undefined ? (
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
          ) : filteredActivities.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <p className="text-sm">No activity found for this filter</p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline connector background */}
              <div className="absolute left-[29px] top-0 bottom-0 w-px bg-gradient-to-b from-border via-border to-transparent" />

              {/* Activity items */}
              {filteredActivities.map((activity) => (
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
    </div>
  );
}
