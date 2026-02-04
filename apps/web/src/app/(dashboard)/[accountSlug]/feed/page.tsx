"use client";

import { use, useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useAccount } from "@/lib/hooks/useAccount";
import { ActivityItem } from "@/components/feed/ActivityItem";
import { ActivityFilters, type ActivityFilterType } from "@/components/feed/ActivityFilters";
import { Skeleton } from "@packages/ui/components/skeleton";
import { Card } from "@packages/ui/components/card";
import { Activity, TrendingUp } from "lucide-react";

interface FeedPageProps {
  params: Promise<{ accountSlug: string }>;
}

/**
 * Activity feed page with type filter.
 */
export default function FeedPage({ params }: FeedPageProps) {
  const { accountSlug } = use(params);
  const { accountId } = useAccount();
  const [filterType, setFilterType] = useState<ActivityFilterType>("all");

  const activities = useQuery(
    api.activities.list,
    accountId ? { accountId, limit: 50 } : "skip"
  );

  const filteredActivities = useMemo(() => {
    if (!activities) return undefined;
    if (filterType === "all") return activities;
    return activities.filter((a) => a.type === filterType);
  }, [activities, filterType]);

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-6 py-5 border-b bg-gradient-to-r from-card to-card/80">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-amber-500/10 shadow-sm">
            <Activity className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">Activity Feed</h1>
              {activities && activities.length > 0 && (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">
                  <TrendingUp className="h-3 w-3" />
                  {activities.length} recent
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">Recent actions across your workspace</p>
          </div>
        </div>
        <ActivityFilters value={filterType} onValueChange={setFilterType} />
      </header>

      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto p-6">
          {filteredActivities === undefined ? (
            <Card className="divide-y">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3 p-4">
                  <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </Card>
          ) : filteredActivities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 mb-4 shadow-sm">
                <Activity className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">No activity yet</h3>
              <p className="text-sm text-muted-foreground/70 mt-1.5 max-w-sm leading-relaxed">
                {filterType === "all"
                  ? "Activity from your team and agents will appear here."
                  : "No activities match the selected filter."}
              </p>
            </div>
          ) : (
            <Card className="divide-y divide-border/50 overflow-hidden shadow-sm">
              {filteredActivities.map((activity) => (
                <ActivityItem
                  key={activity._id}
                  activity={activity}
                  accountSlug={accountSlug}
                />
              ))}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
