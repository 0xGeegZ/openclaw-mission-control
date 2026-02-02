"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useAccount } from "@/lib/hooks/useAccount";
import { ListTodo, Bot, Activity } from "lucide-react";
import { Skeleton } from "@packages/ui/components/skeleton";

interface DashboardStatsProps {
  accountSlug: string;
}

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
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 text-sm">
      <Link
        href={`/${accountSlug}/tasks`}
        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ListTodo className="h-4 w-4 shrink-0" />
        <span className="font-medium">{summary.totalTasks}</span>
        <span>tasks</span>
      </Link>
      <Link
        href={`/${accountSlug}/agents`}
        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
      >
        <Bot className="h-4 w-4 shrink-0" />
        <span className="font-medium">{summary.totalAgents}</span>
        <span>agents</span>
      </Link>
      <Link
        href={`/${accountSlug}/feed`}
        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
      >
        <Activity className="h-4 w-4 shrink-0" />
        <span className="font-medium">{summary.recentActivityCount}</span>
        <span>activity (24h)</span>
      </Link>
    </div>
  );
}
