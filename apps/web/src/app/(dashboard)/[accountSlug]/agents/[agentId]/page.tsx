"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { env } from "@packages/env/nextjs-client";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@packages/ui/components/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@packages/ui/components/tooltip";
import {
  ArrowLeft,
  Bot,
  Activity,
  Clock,
  MoreHorizontal,
  Settings2,
  CircleDot,
  Trash2,
  ListTodo,
  ExternalLink,
  Crown,
  MinusCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { ActivityItem } from "@/components/feed/ActivityItem";
import { AgentEditDialog } from "@/components/agents/AgentEditDialog";
import { AgentDeleteDialog } from "@/components/agents/AgentDeleteDialog";
import { AgentStatusDialog } from "@/components/agents/AgentStatusDialog";

interface AgentDetailPageProps {
  params: Promise<{ accountSlug: string; agentId: string }>;
}

const ORCHESTRATOR_TOOLTIP =
  "Orchestrator: auto-subscribed to all task threads; receives agent thread updates for review.";

/**
 * Return the OpenClaw UI URL if configured in client env.
 */
function getOpenClawUiUrl(): string | undefined {
  return env.NEXT_PUBLIC_OPENCLAW_UI_URL;
}

/**
 * Agent detail page: config, recent activity, stats.
 */
export default function AgentDetailPage({ params }: AgentDetailPageProps) {
  const { accountSlug, agentId } = use(params);
  const router = useRouter();
  const { accountId, account, isAdmin } = useAccount();
  const openclawUiUrl = getOpenClawUiUrl();
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);

  const orchestratorAgentId = (
    account?.settings as { orchestratorAgentId?: Id<"agents"> } | undefined
  )?.orchestratorAgentId;
  const isOrchestrator = agentId && orchestratorAgentId === agentId;

  const updateAccount = useMutation(api.accounts.update);

  const handleSetOrchestrator = async () => {
    if (!accountId || !agent) return;
    try {
      await updateAccount({
        accountId,
        settings: { orchestratorAgentId: agent._id },
      });
      toast.success("Orchestrator set");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to set orchestrator",
      );
    }
  };

  const handleRemoveOrchestrator = async () => {
    if (!accountId) return;
    try {
      await updateAccount({
        accountId,
        settings: { orchestratorAgentId: null },
      });
      toast.success("Orchestrator removed");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to remove orchestrator",
      );
    }
  };

  const agent = useQuery(
    api.agents.get,
    agentId ? { agentId: agentId as Id<"agents"> } : "skip",
  );
  const activities = useQuery(
    api.activities.list,
    accountId ? { accountId, limit: 30 } : "skip",
  );
  const agentTasks = useQuery(
    api.tasks.listByAgent,
    accountId && agentId
      ? { accountId, agentId: agentId as Id<"agents"> }
      : "skip",
  );

  const agentActivities =
    activities?.filter(
      (a) => a.actorType === "agent" && a.actorId === agentId,
    ) ?? [];

  const statusConfig: Record<
    string,
    { variant: "default" | "secondary" | "destructive" | "outline" }
  > = {
    online: { variant: "default" },
    busy: { variant: "secondary" },
    idle: { variant: "outline" },
    offline: { variant: "outline" },
    error: { variant: "destructive" },
  };
  const status = agent
    ? (statusConfig[agent.status] ?? statusConfig.offline)
    : statusConfig.offline;

  const handleDeleted = () => {
    router.push(`/${accountSlug}/agents`);
  };

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
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold tracking-tight truncate">
                  {agent?.name ?? "Agent"}
                </h1>
                {agent && isOrchestrator && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="shrink-0 text-amber-500 flex items-center gap-1.5"
                        aria-label="Orchestrator"
                      >
                        <Crown className="h-5 w-5" />
                        <span className="text-sm font-medium text-muted-foreground">
                          Orchestrator
                        </span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {ORCHESTRATOR_TOOLTIP}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {agent?.role ?? "—"}
              </p>
            </>
          )}
        </div>

        {/* Actions dropdown - admin only */}
        {agent && isAdmin && (
          <div className="flex items-center gap-2">
            {openclawUiUrl && (
              <Button variant="outline" asChild>
                <a href={openclawUiUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  OpenClaw UI
                </a>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Agent actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                  <Settings2 className="mr-2 h-4 w-4" />
                  Edit Agent
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowStatusDialog(true)}>
                  <CircleDot className="mr-2 h-4 w-4" />
                  Change Status
                </DropdownMenuItem>
                {isOrchestrator ? (
                  <DropdownMenuItem onClick={handleRemoveOrchestrator}>
                    <MinusCircle className="mr-2 h-4 w-4" />
                    Remove Orchestrator
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={handleSetOrchestrator}>
                    <Crown className="mr-2 h-4 w-4" />
                    Set as Orchestrator
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Agent
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
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
                      Last seen{" "}
                      {formatDistanceToNow(agent.lastHeartbeat, {
                        addSuffix: true,
                      })}
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
                    <p className="text-sm text-muted-foreground">
                      No activity yet
                    </p>
                  ) : (
                    <ul className="space-y-2 max-h-48 overflow-auto">
                      {agentActivities.slice(0, 10).map((a) => (
                        <li key={a._id}>
                          <ActivityItem
                            activity={a}
                            accountSlug={accountSlug}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
            {/* Assigned Tasks */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ListTodo className="h-4 w-4" />
                  Assigned Tasks
                </CardTitle>
                <CardDescription className="text-xs">
                  Tasks currently assigned to this agent
                </CardDescription>
              </CardHeader>
              <CardContent>
                {agentTasks === undefined ? (
                  <Skeleton className="h-20 w-full" />
                ) : agentTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No tasks assigned
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {agentTasks.map((task) => (
                      <li key={task._id}>
                        <Link
                          href={`/${accountSlug}/tasks/${task._id}`}
                          className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 transition-colors"
                        >
                          <span className="text-sm font-medium truncate">
                            {task.title}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-xs capitalize"
                          >
                            {task.status.replace("_", " ")}
                          </Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Activity feed</CardTitle>
                <CardDescription className="text-xs">
                  All activity by this agent
                </CardDescription>
              </CardHeader>
              <CardContent>
                {agentActivities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No activity yet
                  </p>
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

      {/* Dialogs */}
      {agent && (
        <>
          <AgentEditDialog
            agent={agent}
            open={showEditDialog}
            onOpenChange={setShowEditDialog}
          />
          <AgentDeleteDialog
            agentId={agent._id}
            agentName={agent.name}
            open={showDeleteDialog}
            onOpenChange={setShowDeleteDialog}
            onDeleted={handleDeleted}
          />
          <AgentStatusDialog
            agent={agent}
            open={showStatusDialog}
            onOpenChange={setShowStatusDialog}
          />
        </>
      )}
    </div>
  );
}
