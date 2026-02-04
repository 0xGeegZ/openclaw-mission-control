"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useAccount } from "@/lib/hooks/useAccount";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@packages/ui/components/card";
import { Skeleton } from "@packages/ui/components/skeleton";
import { TASK_STATUS_LABELS } from "@packages/shared";
import type { TaskStatus } from "@packages/shared";
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig,
} from "@packages/ui/components/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  BarChart3,
  ListTodo,
  Bot,
  Activity,
  TrendingUp,
  ArrowUpRight,
  PieChartIcon,
} from "lucide-react";

// Define colors for task statuses (computed, not CSS vars)
const STATUS_COLORS: Record<TaskStatus, string> = {
  inbox: "#6b7280",      // gray
  assigned: "#8b5cf6",   // violet
  in_progress: "#3b82f6", // blue
  review: "#f59e0b",     // amber
  done: "#22c55e",       // green
  blocked: "#ef4444",    // red
};

// Define colors for agent statuses
const AGENT_STATUS_COLORS: Record<string, string> = {
  online: "#22c55e",   // green
  busy: "#f59e0b",     // amber
  idle: "#6b7280",     // gray
  offline: "#9ca3af",  // light gray
  error: "#ef4444",    // red
};

interface AnalyticsPageProps {
  params: Promise<{ accountSlug: string }>;
}

/**
 * Analytics dashboard with charts for task/agent visualization.
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

  // Prepare chart data for tasks
  const taskChartData = useMemo(() => {
    if (!summary) return [];
    return statusOrder.map((status) => ({
      status,
      label: TASK_STATUS_LABELS[status],
      count: summary.taskCountByStatus[status] ?? 0,
      fill: STATUS_COLORS[status],
    }));
  }, [summary]);

  // Prepare pie chart data for agents
  const agentChartData = useMemo(() => {
    if (!summary) return [];
    return agentStatusOrder
      .map((status) => ({
        status,
        label: status.charAt(0).toUpperCase() + status.slice(1),
        count: summary.agentCountByStatus[status] ?? 0,
        fill: AGENT_STATUS_COLORS[status],
      }))
      .filter((item) => item.count > 0);
  }, [summary]);

  // Calculate completion rate
  const completionRate = useMemo(() => {
    if (!summary || summary.totalTasks === 0) return 0;
    const done = summary.taskCountByStatus["done"] ?? 0;
    return Math.round((done / summary.totalTasks) * 100);
  }, [summary]);

  // Calculate active tasks (in_progress + review)
  const activeTasks = useMemo(() => {
    if (!summary) return 0;
    return (summary.taskCountByStatus["in_progress"] ?? 0) + 
           (summary.taskCountByStatus["review"] ?? 0);
  }, [summary]);

  const chartConfig: ChartConfig = {
    count: { label: "Count" },
  };

  return (
    <div className="flex flex-col h-full">
      <header className="px-4 sm:px-6 py-4 border-b bg-card">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Analytics</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Task and agent overview for this workspace
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {summary === undefined ? (
          <div className="space-y-6 max-w-5xl animate-in fade-in duration-300">
            {/* Stats skeleton */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <Skeleton className="h-4 w-20 rounded-md" />
                    <Skeleton className="h-4 w-4 rounded" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-16 rounded-lg mb-2" />
                    <Skeleton className="h-3 w-20 rounded-md opacity-60" />
                  </CardContent>
                </Card>
              ))}
            </div>
            {/* Charts skeleton */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <Skeleton className="h-5 w-32 rounded-md" />
                  <Skeleton className="h-3 w-40 rounded-md mt-1 opacity-60" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-[250px] w-full rounded-lg" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <Skeleton className="h-5 w-32 rounded-md" />
                  <Skeleton className="h-3 w-40 rounded-md mt-1 opacity-60" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-[250px] w-full rounded-lg" />
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-5xl">
            {/* Stats cards */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              <Card className="relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Tasks
                  </CardTitle>
                  <ListTodo className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl sm:text-3xl font-bold">{summary.totalTasks}</div>
                  <Link
                    href={`/${accountSlug}/tasks`}
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
                  >
                    View all <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-violet-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Agents
                  </CardTitle>
                  <Bot className="h-4 w-4 text-violet-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl sm:text-3xl font-bold">{summary.totalAgents}</div>
                  <Link
                    href={`/${accountSlug}/agents`}
                    className="text-xs text-violet-500 hover:underline inline-flex items-center gap-1 mt-1"
                  >
                    Manage <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Completion
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl sm:text-3xl font-bold">{completionRate}%</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.taskCountByStatus["done"] ?? 0} tasks done
                  </p>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Activity (24h)
                  </CardTitle>
                  <Activity className="h-4 w-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl sm:text-3xl font-bold">{summary.recentActivityCount}</div>
                  <Link
                    href={`/${accountSlug}/feed`}
                    className="text-xs text-amber-600 hover:underline inline-flex items-center gap-1 mt-1"
                  >
                    View feed <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Task distribution bar chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Tasks by Status
                  </CardTitle>
                  <CardDescription>Distribution across Kanban columns</CardDescription>
                </CardHeader>
                <CardContent>
                  {summary.totalTasks === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[250px] text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50 mb-3">
                        <ListTodo className="h-6 w-6 text-muted-foreground/50" />
                      </div>
                      <p className="text-sm text-muted-foreground">No tasks yet</p>
                      <Link href={`/${accountSlug}/tasks`} className="text-xs text-primary hover:underline mt-1">
                        Create your first task
                      </Link>
                    </div>
                  ) : (
                    <ChartContainer config={chartConfig} className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart 
                          data={taskChartData} 
                          layout="vertical"
                          margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                        >
                          <XAxis type="number" tickLine={false} axisLine={false} />
                          <YAxis 
                            dataKey="label" 
                            type="category" 
                            tickLine={false} 
                            axisLine={false}
                            width={80}
                            tick={{ fontSize: 12 }}
                          />
                          <Tooltip
                            content={<ChartTooltipContent hideIndicator />}
                            cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                          />
                          <Bar 
                            dataKey="count" 
                            radius={[0, 4, 4, 0]}
                            maxBarSize={24}
                          >
                            {taskChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>

              {/* Agent status pie chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <PieChartIcon className="h-4 w-4 text-violet-500" />
                    Agent Status
                  </CardTitle>
                  <CardDescription>Current state of your agents</CardDescription>
                </CardHeader>
                <CardContent>
                  {summary.totalAgents === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[250px] text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50 mb-3">
                        <Bot className="h-6 w-6 text-muted-foreground/50" />
                      </div>
                      <p className="text-sm text-muted-foreground">No agents yet</p>
                      <Link href={`/${accountSlug}/agents`} className="text-xs text-primary hover:underline mt-1">
                        Create your first agent
                      </Link>
                    </div>
                  ) : (
                    <ChartContainer config={chartConfig} className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={agentChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={2}
                            dataKey="count"
                            nameKey="label"
                          >
                            {agentChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip
                            content={<ChartTooltipContent nameKey="label" />}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Custom legend */}
                      <div className="flex flex-wrap justify-center gap-4 mt-2">
                        {agentChartData.map((item) => (
                          <div key={item.status} className="flex items-center gap-1.5 text-xs">
                            <div 
                              className="h-2.5 w-2.5 rounded-full" 
                              style={{ backgroundColor: item.fill }}
                            />
                            <span className="text-muted-foreground">{item.label}</span>
                            <span className="font-medium">{item.count}</span>
                          </div>
                        ))}
                      </div>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Task progress summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Task Pipeline</CardTitle>
                <CardDescription>Visual representation of task flow</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {statusOrder.map((status) => {
                    const count = summary.taskCountByStatus[status] ?? 0;
                    const percentage = summary.totalTasks > 0 
                      ? Math.round((count / summary.totalTasks) * 100) 
                      : 0;
                    return (
                      <div key={status} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2">
                            <div 
                              className="h-2.5 w-2.5 rounded-full" 
                              style={{ backgroundColor: STATUS_COLORS[status] }}
                            />
                            {TASK_STATUS_LABELS[status]}
                          </span>
                          <span className="font-medium tabular-nums">
                            {count} <span className="text-muted-foreground font-normal">({percentage}%)</span>
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all duration-500 ease-out"
                            style={{ 
                              width: `${percentage}%`,
                              backgroundColor: STATUS_COLORS[status],
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
