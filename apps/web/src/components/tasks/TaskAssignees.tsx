"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Doc, Id } from "@packages/backend/convex/_generated/dataModel";
import { Button } from "@packages/ui/components/button";
import { Avatar, AvatarFallback } from "@packages/ui/components/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@packages/ui/components/popover";
import { Checkbox } from "@packages/ui/components/checkbox";
import { useAccount } from "@/lib/hooks/useAccount";
import { toast } from "sonner";
import { UserPlus, Bot, Loader2 } from "lucide-react";
import { cn } from "@packages/ui/lib/utils";

interface TaskAssigneesProps {
  task: Doc<"tasks">;
}

/**
 * Task assignees component with agent picker.
 * Allows assigning agents to a task.
 */
export function TaskAssignees({ task }: TaskAssigneesProps) {
  const { accountId } = useAccount();
  const [open, setOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  
  const agents = useQuery(
    api.agents.getRoster,
    accountId ? { accountId } : "skip"
  );
  
  const assignTask = useMutation(api.tasks.assign);
  
  const handleToggleAgent = async (agentId: Id<"agents">) => {
    setIsUpdating(true);
    try {
      const isAssigned = task.assignedAgentIds.includes(agentId);
      const newAgentIds = isAssigned
        ? task.assignedAgentIds.filter(id => id !== agentId)
        : [...task.assignedAgentIds, agentId];
      
      await assignTask({
        taskId: task._id,
        assignedAgentIds: newAgentIds,
      });
      
      toast.success(isAssigned ? "Agent removed" : "Agent assigned");
    } catch (error) {
      toast.error("Failed to update assignees", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsUpdating(false);
    }
  };
  
  // Get assigned agent details
  const assignedAgents = agents?.filter(agent => 
    task.assignedAgentIds.includes(agent._id)
  ) ?? [];
  
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Assignees:</span>
      
      {/* Display assigned agents */}
      <div className="flex -space-x-2">
        {assignedAgents.length > 0 ? (
          assignedAgents.slice(0, 5).map((agent) => (
            <Avatar 
              key={agent._id} 
              className="h-7 w-7 border-2 border-background"
              title={agent.name}
            >
              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                {agent.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">None</span>
        )}
        {assignedAgents.length > 5 && (
          <div className="h-7 w-7 rounded-full border-2 border-background bg-muted flex items-center justify-center">
            <span className="text-xs text-muted-foreground">
              +{assignedAgents.length - 5}
            </span>
          </div>
        )}
      </div>
      
      {/* Agent picker popover */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button 
            variant="outline" 
            size="sm"
            className="h-7 px-2"
          >
            <UserPlus className="h-4 w-4" />
            <span className="sr-only">Assign agents</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <div className="p-3 border-b">
            <h4 className="font-medium text-sm">Assign Agents</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Select agents to work on this task
            </p>
          </div>
          
          <div className="max-h-64 overflow-y-auto">
            {agents === undefined ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : agents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center px-4">
                <Bot className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No agents available
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Create agents in the Agents page
                </p>
              </div>
            ) : (
              <div className="p-2">
                {agents.map((agent) => {
                  const isAssigned = task.assignedAgentIds.includes(agent._id);
                  return (
                    <button
                      key={agent._id}
                      onClick={() => handleToggleAgent(agent._id)}
                      disabled={isUpdating}
                      className={cn(
                        "w-full flex items-center gap-3 p-2 rounded-md text-left",
                        "hover:bg-accent transition-colors",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      <Checkbox 
                        checked={isAssigned}
                        className="pointer-events-none"
                      />
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {agent.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {agent.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {agent.role}
                        </p>
                      </div>
                      <div 
                        className={cn(
                          "w-2 h-2 rounded-full shrink-0",
                          agent.status === "online" && "bg-emerald-500",
                          agent.status === "busy" && "bg-amber-500",
                          agent.status === "idle" && "bg-blue-400",
                          agent.status === "offline" && "bg-muted-foreground/40",
                          agent.status === "error" && "bg-destructive"
                        )}
                        title={agent.status}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
