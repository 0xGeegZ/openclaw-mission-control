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
  MessageSquare,
  ListTodo,
  Clock,
} from "lucide-react";

interface AgentStatisticsCardProps {
  agent: Doc<"agents">;
  taskCount?: number;
  activityCount?: number;
  messageCount?: number;
}

/**
 * Display agent statistics: tasks assigned, sessions created, activity, etc.
 */
export function AgentStatisticsCard({
  agent,
  taskCount = 0,
  activityCount = 0,
  messageCount = 0,
}: AgentStatisticsCardProps) {
  const stats = [
    {
      label: "Tasks Assigned",
      value: taskCount,
      icon: ListTodo,
      color: "text-blue-500",
    },
    {
      label: "Activity Events",
      value: activityCount,
      icon: BarChart3,
      color: "text-green-500",
    },
    {
      label: "Messages",
      value: messageCount,
      icon: MessageSquare,
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
