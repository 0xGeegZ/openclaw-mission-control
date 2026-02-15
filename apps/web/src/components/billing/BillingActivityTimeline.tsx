"use client";

import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { Skeleton } from "@packages/ui/components/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/card";
import { BillingActivityItem } from "./BillingActivityItem";

interface BillingActivityTimelineProps {
  accountId: Id<"accounts">;
  actionTypeFilter?: string;
  limit?: number;
}

/**
 * BillingActivityTimeline - Display a timeline of billing actions.
 * Shows all user actions related to billing: upgrades, downgrades, cancellations, payments, etc.
 */
export function BillingActivityTimeline({
  accountId,
  actionTypeFilter,
  limit = 50,
}: BillingActivityTimelineProps) {
  const actions = useQuery(api.billing.getBillingActionHistory, {
    accountId,
    actionType: actionTypeFilter,
    limit,
  });

  const isLoading = actions === undefined;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Activity Timeline</CardTitle>
          <CardDescription>Loading billing activity...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const isEmpty = !actions || actions.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity Timeline</CardTitle>
        <CardDescription>
          {isEmpty
            ? "No billing activity yet"
            : `Showing ${actions.length} ${actionTypeFilter ? "filtered " : ""}action${actions.length !== 1 ? "s" : ""}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No billing activity to display.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Activities will appear here when you upgrade, downgrade, or manage
              your subscription.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {actions.map((action) => (
              <BillingActivityItem key={action._id} action={action} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
