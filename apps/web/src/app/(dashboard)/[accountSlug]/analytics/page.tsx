"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useAccount } from "@/lib/hooks/useAccount";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@packages/ui/components/card";
import { Skeleton } from "@packages/ui/components/skeleton";
import { TASK_STATUS_LABELS } from "@packages/shared";
import type { TaskStatus } from "@packages/shared";
import {
  BarChart3,
  ListTodo,
  Bot,
  Activity,
  CheckSquare,
  Clock,
} from "lucide-react";

interface AnalyticsPageProps {
  params: Promise<{ accountSlug: string }>;
}

/**
 * Analytics dashboard: task/agent counts and recent activity.
 */
export default function AnalyticsPage({ params }: AnalyticsPageProps) {
  const { accountSlug } = use(params);
  const { accountId } = useAccount();

  const summary = useQuery(
    api.analytics.getSummary,
    accountId ? { accountId } : "skip"
  );

  const statusOrder: TaskStatus[] = [
    "inbox",
    "assigned",
    "in_progress",
    "review",
    "done",
    "blocked",
  ];
  const agentStatusOrder = ["online", "busy", "idle", "offline", "error"];

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-4 border-b bg-card">
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Task and agent overview for this workspace
        </p>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {summary === undefined ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 max-w-4xl">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-48 md:col-span-2" />
            <Skeleton className="h-48" />
          </div>
        ) : (
          <div className="space-y-6 max-w-4xl">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total tasks
                  </CardTitle>
                  <ListTodo className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary.totalTasks}</div>
                  <Link
                    href={`/${accountSlug}/tasks`}
                    className="text-xs text-primary hover:underline"
                  >
                    View tasks
                  </Link>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Agents
                  </CardTitle>
                  <Bot className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary.totalAgents}</div>
                  <Link
                    href={`/${accountSlug}/agents`}
                    className="text-xs text-primary hover:underline"
                  >
                    View agents
                  </Link>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Activity (24h)
                  </CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {summary.recentActivityCount}
                  </div>
                  <Link
                    href={`/${accountSlug}/feed`}
                    className="text-xs text-primary hover:underline"
                  >
                    View feed
                  </Link>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Tasks by status
                  </CardTitle>
                  <CardDescription>Count per Kanban column</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {statusOrder.map((status) => (
                      <li
                        key={status}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="flex items-center gap-2">
                          <CheckSquare className="h-4 w-4 text-muted-foreground" />
                          {TASK_STATUS_LABELS[status]}
                        </span>
                        <span className="font-medium">
                          {summary.taskCountByStatus[status] ?? 0}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Agents by status
                  </CardTitle>
                  <CardDescription>Current agent states</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {agentStatusOrder.map((status) => {
                      const count = summary.agentCountByStatus[status] ?? 0;
                      if (count === 0 && summary.totalAgents > 0) return null;
                      return (
                        <li
                          key={status}
                          className="flex items-center justify-between text-sm capitalize"
                        >
                          <span>{status}</span>
                          <span className="font-medium">{count}</span>
                        </li>
                      );
                    })}
                    {summary.totalAgents === 0 && (
                      <li className="text-sm text-muted-foreground">
                        No agents yet
                      </li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
