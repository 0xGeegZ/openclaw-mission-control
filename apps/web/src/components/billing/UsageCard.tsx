"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@packages/ui/components/card";
import { Progress } from "@packages/ui/components/progress";
import { Users, CheckSquare, FileText, Database } from "lucide-react";
import type { UsageMetrics, PlanTier } from "@packages/shared/types/billing";

interface UsageCardProps {
  usage: UsageMetrics;
  plan: PlanTier;
}

/**
 * Plan limits for each tier.
 * Used to calculate usage percentages.
 */
const PLAN_LIMITS = {
  free: {
    agents: 1,
    tasks: 10,
    documents: 50, // 5 per task * 10 tasks
    storageGB: 1,
  },
  pro: {
    agents: 5,
    tasks: Infinity,
    documents: Infinity, // 20 per task, unlimited tasks
    storageGB: 10,
  },
  enterprise: {
    agents: Infinity,
    tasks: Infinity,
    documents: Infinity,
    storageGB: 100,
  },
};

/**
 * UsageCard component for displaying current billing period usage.
 * Shows usage metrics with progress bars and percentage.
 */
export function UsageCard({ usage, plan }: UsageCardProps) {
  const limits = PLAN_LIMITS[plan];

  const metrics = [
    {
      label: "AI Agents",
      value: usage.agents,
      limit: limits.agents,
      icon: Users,
      color: "text-blue-500",
    },
    {
      label: "Tasks",
      value: usage.tasks,
      limit: limits.tasks,
      icon: CheckSquare,
      color: "text-green-500",
    },
    {
      label: "Documents",
      value: usage.documents,
      limit: limits.documents,
      icon: FileText,
      color: "text-purple-500",
    },
    {
      label: "Storage",
      value: (usage.storageBytes / (1024 * 1024 * 1024)).toFixed(2), // Convert to GB
      limit: limits.storageGB,
      icon: Database,
      color: "text-amber-500",
      unit: "GB",
    },
  ];

  const formatValue = (value: number | string, limit: number, unit?: string) => {
    if (limit === Infinity) {
      return `${value}${unit ? ` ${unit}` : ""}`;
    }
    return `${value}${unit ? ` ${unit}` : ""} / ${limit}${unit ? ` ${unit}` : ""}`;
  };

  const calculatePercentage = (value: number | string, limit: number) => {
    if (limit === Infinity) return 0;
    const numValue = typeof value === "string" ? parseFloat(value) : value;
    return Math.min((numValue / limit) * 100, 100);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage This Period</CardTitle>
        <CardDescription>
          Current billing period: {usage.period}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          const percentage = calculatePercentage(metric.value, metric.limit);
          const isNearLimit = percentage >= 80 && percentage < 100;
          const isOverLimit = percentage >= 100;

          return (
            <div key={metric.label} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${metric.color}`} />
                  <span className="text-sm font-medium">{metric.label}</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {formatValue(metric.value, metric.limit, metric.unit)}
                </span>
              </div>
              {metric.limit !== Infinity && (
                <div className="space-y-1">
                  <Progress
                    value={percentage}
                    className={
                      isOverLimit
                        ? "bg-muted [&>div]:bg-destructive"
                        : isNearLimit
                          ? "bg-muted [&>div]:bg-amber-500"
                          : ""
                    }
                  />
                  {isOverLimit && (
                    <p className="text-xs text-destructive">
                      Limit exceeded. Consider upgrading your plan.
                    </p>
                  )}
                  {isNearLimit && !isOverLimit && (
                    <p className="text-xs text-amber-600 dark:text-amber-500">
                      Approaching limit ({percentage.toFixed(0)}%)
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
