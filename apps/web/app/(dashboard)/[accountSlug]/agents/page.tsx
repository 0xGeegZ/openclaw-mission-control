"use client";

import { use } from "react";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useAccount } from "@/lib/hooks/useAccount";
import { AgentCard } from "@/components/agents/AgentCard";
import { CreateAgentDialog } from "@/components/agents/CreateAgentDialog";
import { Button } from "@packages/ui/components/button";
import { Plus } from "lucide-react";

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
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Agents</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Agent
        </Button>
      </div>
      
      {roster === undefined ? (
        <div className="text-center text-muted-foreground py-8">
          Loading agents...
        </div>
      ) : roster.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          No agents yet. Create your first agent!
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {roster.map((agent) => (
            <AgentCard key={agent._id} agent={agent} accountSlug={accountSlug} />
          ))}
        </div>
      )}
      
      <CreateAgentDialog open={showCreate} onOpenChange={setShowCreate} />
    </div>
  );
}
