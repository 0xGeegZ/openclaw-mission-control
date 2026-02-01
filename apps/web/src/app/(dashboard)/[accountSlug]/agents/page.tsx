"use client";

import { use } from "react";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useAccount } from "@/lib/hooks/useAccount";
import { AgentCard } from "@/components/agents/AgentCard";
import { CreateAgentDialog } from "@/components/agents/CreateAgentDialog";
import { Button } from "@packages/ui/components/button";
import { Skeleton } from "@packages/ui/components/skeleton";
import { Card } from "@packages/ui/components/card";
import { Plus, Bot } from "lucide-react";

interface AgentsPageProps {
  params: Promise<{ accountSlug: string }>;
}

/**
 * Agents roster page.
 */
export default function AgentsPage({ params }: AgentsPageProps) {
  const { accountSlug } = use(params);
  const { accountId } = useAccount();
  const [showCreate, setShowCreate] = useState(false);
  
  const roster = useQuery(
    api.agents.getRoster,
    accountId ? { accountId } : "skip"
  );
  
  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agents</h1>
          <p className="text-sm text-muted-foreground">Manage your AI agent roster</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Agent
        </Button>
      </header>
      
      <div className="flex-1 overflow-auto p-6">
        {roster === undefined ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <Skeleton className="h-3 w-32 mt-4" />
              </Card>
            ))}
          </div>
        ) : roster.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
              <Bot className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No agents yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Create your first AI agent to start building your team.
            </p>
            <Button onClick={() => setShowCreate(true)} className="mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Create Agent
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {roster.map((agent) => (
              <AgentCard key={agent._id} agent={agent} accountSlug={accountSlug} />
            ))}
          </div>
        )}
      </div>
      
      <CreateAgentDialog open={showCreate} onOpenChange={setShowCreate} />
    </div>
  );
}
