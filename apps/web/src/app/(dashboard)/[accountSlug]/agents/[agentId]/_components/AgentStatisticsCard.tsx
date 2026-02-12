"use client";

import type { Doc } from "@packages/backend/convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/card";
import {
  BarChart3,
  Activity,
  Zap,
  Clock,
} from "lucide-react";

interface AgentStatisticsCardProps {
  agent: Doc<"agents">;
  sessionsCreated?: number;
  tasksCompleted?: number;
  avgResponseTime?: number;
}

/**
 * Display agent statistics: sessions created, tasks completed, avg response time.
 */
export function AgentStatisticsCard({
  agent,
  sessionsCreated = 0,
  tasksCompleted = 0,
  avgResponseTime = 0,
}: AgentStatisticsCardProps) {
  const stats = [
    {
      label: "Sessions Created",
      value: sessionsCreated,
      icon: Activity,
      color: "text-blue-500",
    },
    {
      label: "Tasks Completed",
      value: tasksCompleted,
      icon: BarChart3,
      color: "text-green-500",
    },
    {
      label: "Avg Response Time",
      value: avgResponseTime > 0 ? `${avgResponseTime.toFixed(1)}s` : "—",
      icon: Zap,
      color: "text-purple-500",
    },
    {
      label: "Created",
      value: agent.createdAt ? new Date(agent.createdAt).toLocaleDateString() : "—",
      icon: Clock,
      color: "text-gray-500",
      isDate: true,
    },
  ];

  return (
    <Card className="md:col-span-2 lg:col-span-1">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Statistics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Icon className={`h-3 w-3 ${stat.color}`} />
                  {stat.label}
                </div>
                <div className="text-lg font-semibold">
                  {stat.isDate ? (
                    <span className="text-sm">{stat.value}</span>
                  ) : (
                    stat.value
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
