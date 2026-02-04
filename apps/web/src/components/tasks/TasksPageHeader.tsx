"use client";

import dynamic from "next/dynamic";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id } from "@packages/backend/convex/_generated/dataModel";
import { DashboardStats } from "@/components/dashboard/DashboardStats";
import { Badge } from "@packages/ui/components/badge";
import { Button } from "@packages/ui/components/button";
import { X } from "lucide-react";
import { useAccount } from "@/lib/hooks/useAccount";

/** Loaded client-only to avoid hydration mismatch (time/locale differ on server vs client). */
const LiveClock = dynamic(
  () =>
    import("@/components/dashboard/LiveClock").then((m) => ({
      default: m.LiveClock,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-w-24 items-center gap-2 text-sm text-muted-foreground">
        <span className="h-4 w-4 shrink-0" aria-hidden />
        <span className="tabular-nums">--:--:--</span>
      </div>
    ),
  }
);

interface TasksPageHeaderProps {
  accountSlug: string;
  selectedAgentId?: Id<"agents"> | null;
  onClearFilter?: () => void;
}

/**
 * Tasks page header with title, stats, filter indicator, and live clock.
 */
export function TasksPageHeader({ accountSlug, selectedAgentId, onClearFilter }: TasksPageHeaderProps) {
  const { accountId } = useAccount();
  
  // Fetch agent name if filtered
  const agents = useQuery(
    api.agents.getRoster,
    accountId ? { accountId } : "skip"
  );
  
  const selectedAgent = selectedAgentId 
    ? agents?.find(a => a._id === selectedAgentId)
    : null;

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b bg-card">
      <div className="flex items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <h1 className="text-lg font-semibold uppercase tracking-wide">
              {selectedAgent ? `${selectedAgent.name}'s Tasks` : "Mission Queue"}
            </h1>
          </div>
          {!selectedAgent && (
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage and track your team&apos;s work
            </p>
          )}
        </div>
        
        {/* Filter indicator */}
        {selectedAgent && onClearFilter && (
          <Badge variant="secondary" className="gap-1.5 pl-2 pr-1">
            <span className="text-xs">Filtering by</span>
            <span className="font-medium">{selectedAgent.name}</span>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-4 w-4 p-0 hover:bg-transparent"
              onClick={onClearFilter}
            >
              <X className="h-3 w-3" />
              <span className="sr-only">Clear filter</span>
            </Button>
          </Badge>
        )}
      </div>
      
      <div className="flex items-center gap-6">
        <DashboardStats accountSlug={accountSlug} />
        <LiveClock />
      </div>
    </header>
  );
}
