"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@packages/ui/components/card";
import { Button } from "@packages/ui/components/button";
import { format } from "date-fns";
import { Crown, ExternalLink, AlertCircle } from "lucide-react";
import type { SubscriptionSummary, PlanTier } from "@packages/shared/types/billing";

interface SubscriptionCardProps {
  subscription: SubscriptionSummary;
  onManageSubscription: () => void;
  isLoading?: boolean;
}

/**
 * SubscriptionCard component for displaying current subscription details.
 * Shows plan, status, renewal date, and manage button.
 */
export function SubscriptionCard({
  subscription,
  onManageSubscription,
  isLoading,
}: SubscriptionCardProps) {
  const isActive = subscription.status === "active";
  const isCanceling = subscription.cancelAtPeriodEnd;
  const isTrial = subscription.status === "trialing";
  const isPastDue = subscription.status === "past_due";

  const getPlanDisplayName = (plan: PlanTier) => {
    return plan.charAt(0).toUpperCase() + plan.slice(1);
  };

  const getStatusColor = (status: SubscriptionSummary["status"]) => {
    switch (status) {
      case "active":
        return "text-green-600 dark:text-green-500 bg-green-50 dark:bg-green-500/10";
      case "trialing":
        return "text-blue-600 dark:text-blue-500 bg-blue-50 dark:bg-blue-500/10";
      case "past_due":
        return "text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-500/10";
      case "canceled":
        return "text-red-600 dark:text-red-500 bg-red-50 dark:bg-red-500/10";
      default:
        return "text-muted-foreground bg-muted";
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" />
              Current Subscription
            </CardTitle>
            <CardDescription>
              {subscription.plan === "free"
                ? "Manage your subscription and billing"
                : "Your active subscription details"}
            </CardDescription>
          </div>
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(
              subscription.status
            )}`}
          >
            {subscription.status}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center justify-between py-3 border-b">
          <span className="text-sm text-muted-foreground">Plan</span>
          <span className="text-sm font-semibold">
            {getPlanDisplayName(subscription.plan)}
          </span>
        </div>

        {isTrial && subscription.trialEnd && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
            <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-400">
                Trial Period
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                Your trial ends on {format(subscription.trialEnd, "MMM dd, yyyy")}
              </p>
            </div>
          </div>
        )}

        {isPastDue && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-400">
                Payment Failed
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                Please update your payment method to continue service
              </p>
            </div>
          </div>
        )}

        {isCanceling && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-900 dark:text-red-400">
                Subscription Ending
              </p>
              <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                Your subscription will end on {format(subscription.currentPeriodEnd, "MMM dd, yyyy")}
              </p>
            </div>
          </div>
        )}

        {isActive && !isCanceling && !isTrial && (
          <div className="flex items-center justify-between py-3 border-b">
            <span className="text-sm text-muted-foreground">Renews on</span>
            <span className="text-sm font-medium">
              {format(subscription.currentPeriodEnd, "MMM dd, yyyy")}
            </span>
          </div>
        )}

        {subscription.plan !== "free" && (
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={onManageSubscription}
            disabled={isLoading}
          >
            <ExternalLink className="h-4 w-4" />
            {isLoading ? "Loading..." : "Manage Subscription"}
          </Button>
        )}

        {subscription.plan === "free" && (
          <p className="text-xs text-muted-foreground text-center py-2">
            You're currently on the free plan. Upgrade to unlock more features.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
