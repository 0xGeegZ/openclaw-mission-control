"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { useAccount } from "@/lib/hooks/useAccount";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/card";
import { Button } from "@packages/ui/components/button";
import { Badge } from "@packages/ui/components/badge";
import { Skeleton } from "@packages/ui/components/skeleton";
import { Avatar, AvatarFallback } from "@packages/ui/components/avatar";
import { ArrowLeft, Bot, Activity, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ActivityItem } from "@/components/feed/ActivityItem";

interface AgentDetailPageProps {
  params: Promise<{ accountSlug: string; agentId: string }>;
}

/**
 * Agent detail page: config, recent activity, stats.
 */
export default function AgentDetailPage({ params }: AgentDetailPageProps) {
  const { accountSlug, agentId } = use(params);
  const { accountId } = useAccount();

  const agent = useQuery(
    api.agents.get,
    agentId ? { agentId: agentId as Id<"agents"> } : "skip"
  );
  const activities = useQuery(
    api.activities.list,
    accountId ? { accountId, limit: 30 } : "skip"
  );

  const agentActivities =
    activities?.filter(
      (a) => a.actorType === "agent" && a.actorId === agentId
    ) ?? [];

  const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline" }> = {
    online: { variant: "default" },
    busy: { variant: "secondary" },
    idle: { variant: "outline" },
    offline: { variant: "outline" },
    error: { variant: "destructive" },
  };
  const status = agent ? statusConfig[agent.status] ?? statusConfig.offline : statusConfig.offline;

  if (agentId && agent === null) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-muted-foreground">Agent not found</p>
        <Button variant="link" asChild>
          <Link href={`/${accountSlug}/agents`}>Back to agents</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-4 px-6 py-4 border-b bg-card">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/${accountSlug}/agents`}>
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Back</span>
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          {agent === undefined ? (
            <Skeleton className="h-8 w-48" />
          ) : (
            <>
              <h1 className="text-2xl font-bold tracking-tight truncate">
                {agent?.name ?? "Agent"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {agent?.role ?? "—"}
              </p>
            </>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {agent === undefined ? (
          <div className="grid gap-6 md:grid-cols-2 max-w-4xl">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        ) : agent ? (
          <div className="space-y-6 max-w-4xl">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bot className="h-4 w-4" />
                    Agent
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                        {agent.name[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{agent.name}</p>
                      <Badge variant={status.variant} className="mt-1">
                        {agent.status}
                      </Badge>
                    </div>
                  </div>
                  {agent.lastHeartbeat && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      Last seen {formatDistanceToNow(agent.lastHeartbeat, { addSuffix: true })}
                    </div>
                  )}
                  {agent.sessionKey && (
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {agent.sessionKey}
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Recent activity
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {agentActivities.length} recent actions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {agentActivities.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No activity yet</p>
                  ) : (
                    <ul className="space-y-2 max-h-48 overflow-auto">
                      {agentActivities.slice(0, 10).map((a) => (
                        <li key={a._id}>
                          <ActivityItem activity={a} accountSlug={accountSlug} />
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Activity feed</CardTitle>
                <CardDescription className="text-xs">
                  All activity by this agent
                </CardDescription>
              </CardHeader>
              <CardContent>
                {agentActivities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No activity yet</p>
                ) : (
                  <ul className="space-y-3 divide-y divide-border">
                    {agentActivities.map((a) => (
                      <li key={a._id} className="pt-3 first:pt-0">
                        <ActivityItem activity={a} accountSlug={accountSlug} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
