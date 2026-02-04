"use client";

import { useState, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id } from "@packages/backend/convex/_generated/dataModel";
import { KanbanBoard } from "./KanbanBoard";
import { TasksPageHeader } from "./TasksPageHeader";
import { AgentsSidebar } from "./AgentsSidebar";
import { useAccount } from "@/lib/hooks/useAccount";
import { Button } from "@packages/ui/components/button";
import { Badge } from "@packages/ui/components/badge";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { cn } from "@packages/ui/lib/utils";
import { TaskStatus } from "@packages/shared";

interface TasksPageContentProps {
  accountSlug: string;
}

type StatusFilter = "all" | TaskStatus;

const STATUS_FILTER_CONFIG: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "inbox", label: "Inbox" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "Active" },
  { value: "review", label: "Review" },
  { value: "done", label: "Done" },
  { value: "blocked", label: "Waiting" },
];

const AGENTS_SIDEBAR_STORAGE_KEY = "agents-sidebar-collapsed";

/**
 * Tasks page content with agents sidebar, kanban board, and header.
 * Main layout component for the tasks view.
 */
export function TasksPageContent({ accountSlug }: TasksPageContentProps) {
  const { accountId } = useAccount();
  const [selectedAgentId, setSelectedAgentId] = useState<Id<"agents"> | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    // Initialize from localStorage on client side
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(AGENTS_SIDEBAR_STORAGE_KEY);
      if (stored !== null) {
        return stored === "true";
      }
    }
    return false;
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  
  // Get task counts for filter badges
  const tasksData = useQuery(
    api.tasks.listByStatus,
    accountId ? { accountId } : "skip"
  );
  
  const getStatusCount = (status: StatusFilter): number => {
    if (!tasksData?.tasks) return 0;
    if (status === "all") {
      return Object.values(tasksData.tasks).reduce((acc, tasks) => acc + tasks.length, 0);
    }
    return tasksData.tasks[status]?.length ?? 0;
  };

  return (
    <div className="flex flex-col h-full">
      <TasksPageHeader 
        accountSlug={accountSlug} 
        selectedAgentId={selectedAgentId}
        onClearFilter={() => setSelectedAgentId(null)}
      />
      
      {/* Status filter tabs */}
      <div className="flex items-center gap-2 px-6 py-3 border-b bg-card/50 overflow-x-auto">
        {STATUS_FILTER_CONFIG.map((filter) => {
          const count = getStatusCount(filter.value);
          const isActive = statusFilter === filter.value;
          
          return (
            <Button
              key={filter.value}
              variant={isActive ? "default" : "outline"}
              size="sm"
              className={cn(
                "gap-1.5 shrink-0",
                isActive && "bg-primary text-primary-foreground"
              )}
              onClick={() => setStatusFilter(filter.value)}
            >
              {filter.label}
              <Badge 
                variant={isActive ? "secondary" : "outline"} 
                className={cn(
                  "text-[10px] px-1.5 py-0 h-4 min-w-[1.25rem]",
                  isActive && "bg-primary-foreground/20 text-primary-foreground border-0"
                )}
              >
                {count}
              </Badge>
            </Button>
          );
        })}
      </div>
      
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Sidebar toggle - hidden on mobile, positioned at left edge when collapsed */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "absolute top-4 z-20 h-6 w-6 rounded-full border bg-background shadow-sm hover:bg-accent transition-all duration-300 hidden md:flex",
            sidebarCollapsed ? "left-2" : "left-[15rem]"
          )}
          onClick={() => {
            const newValue = !sidebarCollapsed;
            setSidebarCollapsed(newValue);
            if (typeof window !== "undefined") {
              localStorage.setItem(AGENTS_SIDEBAR_STORAGE_KEY, String(newValue));
            }
          }}
        >
          {sidebarCollapsed ? (
            <PanelLeft className="h-3.5 w-3.5" />
          ) : (
            <PanelLeftClose className="h-3.5 w-3.5" />
          )}
          <span className="sr-only">
            {sidebarCollapsed ? "Show agents" : "Hide agents"}
          </span>
        </Button>
        
        {/* Agents sidebar - hidden on mobile */}
        <div className={cn(
          "relative transition-all duration-300 ease-in-out shrink-0 hidden md:block",
          sidebarCollapsed ? "w-0" : "w-64"
        )}>
          <div className={cn(
            "absolute inset-0 overflow-hidden",
            sidebarCollapsed && "invisible"
          )}>
            <AgentsSidebar
              accountId={accountId}
              selectedAgentId={selectedAgentId}
              onSelectAgent={setSelectedAgentId}
              className="w-64"
            />
          </div>
        </div>
        
        {/* Kanban board */}
        <div className="flex-1 overflow-hidden py-4">
          <KanbanBoard 
            accountSlug={accountSlug} 
            filterByAgentId={selectedAgentId}
            statusFilter={statusFilter === "all" ? undefined : statusFilter}
          />
        </div>
      </div>
    </div>
  );
}
