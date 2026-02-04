"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useAccount } from "@/lib/hooks/useAccount";
import { ListTodo, Bot, Activity } from "lucide-react";
import { Skeleton } from "@packages/ui/components/skeleton";
import { cn } from "@packages/ui/lib/utils";

interface DashboardStatsProps {
  accountSlug: string;
}

const statConfig = [
  { key: "tasks", icon: ListTodo, color: "text-emerald-500", bgColor: "bg-emerald-500/10", href: "tasks", label: "tasks" },
  { key: "agents", icon: Bot, color: "text-violet-500", bgColor: "bg-violet-500/10", href: "agents", label: "agents" },
  { key: "activity", icon: Activity, color: "text-amber-500", bgColor: "bg-amber-500/10", href: "feed", label: "today" },
];

/**
 * Compact stats for dashboard header: tasks, agents, activity (24h).
 */
export function DashboardStats({ accountSlug }: DashboardStatsProps) {
  const { accountId } = useAccount();
  const summary = useQuery(
    api.analytics.getSummary,
    accountId ? { accountId } : "skip"
  );

  if (summary === undefined) {
    return (
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-xl" />
        ))}
      </div>
    );
  }

  const stats = [
    { ...statConfig[0], value: summary.totalTasks },
    { ...statConfig[1], value: summary.totalAgents },
    { ...statConfig[2], value: summary.recentActivityCount },
  ];

  return (
    <div className="flex items-center gap-2">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Link
            key={stat.key}
            href={`/${accountSlug}/${stat.href}`}
            className={cn(
              "group flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all duration-200",
              "hover:shadow-sm",
              stat.bgColor
            )}
          >
            <Icon className={cn("h-4 w-4 shrink-0", stat.color)} />
            <span className={cn("font-bold tabular-nums", stat.color)}>{stat.value}</span>
            <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
              {stat.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
