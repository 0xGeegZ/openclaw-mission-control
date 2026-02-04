"use client";

import { use } from "react";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useAccount } from "@/lib/hooks/useAccount";
import { AgentCard } from "@/components/agents/AgentCard";
import { CreateAgentDialog } from "@/components/agents/CreateAgentDialog";
import { Button } from "@packages/ui/components/button";
import { Card } from "@packages/ui/components/card";
import { Bot, Sparkles } from "lucide-react";

interface AgentsPageProps {
  params: Promise<{ accountSlug: string }>;
}

/**
 * Agents roster page.
 */
export default function AgentsPage({ params }: AgentsPageProps) {
  const { accountSlug } = use(params);
  const { accountId, account, isLoading: isAccountLoading } = useAccount();
  const [showCreate, setShowCreate] = useState(false);

  const orchestratorAgentId = (
    account?.settings as { orchestratorAgentId?: string } | undefined
  )?.orchestratorAgentId;

  const roster = useQuery(
    api.agents.getRoster,
    accountId ? { accountId } : "skip",
  );

  // Show loading state when account or roster is loading
  const isLoading = isAccountLoading || (accountId && roster === undefined);
  const onlineCount =
    roster?.filter((a) => a.status === "online" || a.status === "busy")
      .length ?? 0;

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-6 py-5 border-b bg-gradient-to-r from-card to-card/80">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-violet-500/10 shadow-sm">
            <Bot className="h-6 w-6 text-violet-500" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">Agents</h1>
              {roster && roster.length > 0 && (
                <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-full">
                  {onlineCount} online
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage your AI agent roster
            </p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} className="shadow-sm">
          <Sparkles className="mr-2 h-4 w-4" />
          Add Agent
        </Button>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-4 animate-pulse">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-24 bg-muted rounded" />
                    <div className="h-3 w-16 bg-muted rounded" />
                  </div>
                </div>
                <div className="h-3 w-32 mt-4 bg-muted rounded" />
              </Card>
            ))}
          </div>
        ) : roster && roster.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-500/10 to-violet-500/5 mb-5 shadow-sm">
              <Bot className="h-10 w-10 text-violet-500/60" />
            </div>
            <h3 className="text-xl font-semibold text-foreground">
              No agents yet
            </h3>
            <p className="text-sm text-muted-foreground/70 mt-2 max-w-sm leading-relaxed">
              Create your first AI agent to start building your intelligent
              team.
            </p>
            <Button
              onClick={() => setShowCreate(true)}
              className="mt-6 shadow-sm"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Create Your First Agent
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {roster?.map((agent) => (
              <AgentCard
                key={agent._id}
                agent={agent}
                accountSlug={accountSlug}
                isOrchestrator={orchestratorAgentId === agent._id}
              />
            ))}
          </div>
        )}
      </div>

      <CreateAgentDialog open={showCreate} onOpenChange={setShowCreate} />
    </div>
  );
}
