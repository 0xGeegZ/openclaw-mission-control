"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Doc } from "@packages/backend/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@packages/ui/components/card";
import { Badge } from "@packages/ui/components/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@packages/ui/components/avatar";
import { cn } from "@packages/ui/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ChevronRight, Clock, AlertTriangle } from "lucide-react";

interface TaskCardProps {
  task: Doc<"tasks">;
  accountSlug?: string; // Kept for compatibility but not currently used
  isDragging?: boolean;
  onClick?: () => void;
  assignedAgents?: Doc<"agents">[];
}

const priorityConfig: Record<number, { color: string; label: string; bgColor: string }> = {
  1: { color: "bg-red-500", label: "Critical", bgColor: "bg-red-500/10" },
  2: { color: "bg-orange-500", label: "High", bgColor: "bg-orange-500/10" },
  3: { color: "bg-amber-500", label: "Medium", bgColor: "bg-amber-500/10" },
  4: { color: "bg-blue-500", label: "Low", bgColor: "bg-blue-500/10" },
  5: { color: "bg-slate-400", label: "Lowest", bgColor: "bg-slate-400/10" },
};

/** Left border color by task status for at-a-glance visual cue */
const statusBorderColors: Record<string, string> = {
  inbox: "border-l-slate-400",
  assigned: "border-l-primary",
  in_progress: "border-l-amber-500",
  review: "border-l-violet-500",
  done: "border-l-emerald-500",
  blocked: "border-l-destructive",
};

/**
 * Task card component for Kanban board.
 * Draggable card showing task details with rich information.
 */
export function TaskCard({ task, isDragging, onClick, assignedAgents }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: task._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const statusBorder = statusBorderColors[task.status] ?? statusBorderColors.inbox;
  const priority = priorityConfig[task.priority] || priorityConfig[5];
  
  // Get the first assigned agent for display
  const primaryAgent = assignedAgents?.[0];
  const isBlocked = task.status === "blocked";
  const isHighPriority = task.priority <= 2;

  const handleClick = (e: React.MouseEvent) => {
    // Only trigger onClick if not dragging
    if (onClick && !isDragging) {
      e.stopPropagation();
      onClick();
    }
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className={cn(
        "cursor-grab active:cursor-grabbing transition-all duration-200 border-l-[3px] group",
        statusBorder,
        "hover:shadow-md hover:shadow-primary/5 hover:border-l-primary hover:-translate-y-0.5",
        "bg-card/80 backdrop-blur-sm",
        isDragging && "opacity-60 shadow-xl rotate-1 scale-105",
        onClick && "cursor-pointer",
        isBlocked && "bg-destructive/5 border-destructive/20"
      )}
    >
      <CardHeader className="p-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            {/* Priority indicator */}
            <div 
              className={cn(
                "shrink-0 mt-0.5 flex items-center justify-center h-5 w-5 rounded-md",
                priority.bgColor
              )}
              title={priority.label}
            >
              {isHighPriority ? (
                <AlertTriangle className={cn("h-3 w-3", task.priority === 1 ? "text-red-500" : "text-orange-500")} />
              ) : (
                <div className={cn("w-2 h-2 rounded-full", priority.color)} />
              )}
            </div>
            <CardTitle className="text-sm font-medium line-clamp-2 leading-snug">
              {task.title}
            </CardTitle>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/30 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5" />
        </div>
      </CardHeader>
      
      <CardContent className="p-3 pt-0 space-y-2.5">
        {/* Description preview */}
        {task.description && (
          <p className="text-xs text-muted-foreground/80 line-clamp-2 leading-relaxed pl-7">
            {task.description}
          </p>
        )}
        
        {/* Agent and timestamp row */}
        <div className="flex items-center justify-between gap-2 pt-1">
          {primaryAgent ? (
            <div className="flex items-center gap-2 min-w-0">
              <Avatar className="h-6 w-6 ring-2 ring-background shadow-sm">
                {primaryAgent.avatarUrl ? (
                  <AvatarImage src={primaryAgent.avatarUrl} alt={primaryAgent.name} />
                ) : null}
                <AvatarFallback className="text-[9px] font-semibold bg-gradient-to-br from-primary/15 to-primary/5 text-primary">
                  {primaryAgent.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium text-muted-foreground truncate">
                {primaryAgent.name}
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground/50 italic">Unassigned</span>
          )}
          
          <div className="flex items-center gap-1 text-muted-foreground/50">
            <Clock className="h-3 w-3" />
            <span className="text-[10px] tabular-nums">
              {formatDistanceToNow(task.updatedAt, { addSuffix: false })}
            </span>
          </div>
        </div>
        
        {/* Labels */}
        {task.labels.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {task.labels.slice(0, 3).map((label) => (
              <Badge 
                key={label} 
                variant="outline" 
                className="text-[9px] px-1.5 py-0 h-[18px] bg-background/50 border-border/40 font-medium text-muted-foreground"
              >
                {label}
              </Badge>
            ))}
            {task.labels.length > 3 && (
              <Badge 
                variant="outline" 
                className="text-[9px] px-1.5 py-0 h-[18px] bg-muted/50 border-border/40 font-medium"
              >
                +{task.labels.length - 3}
              </Badge>
            )}
          </div>
        )}
        
        {/* Additional assignees indicator */}
        {assignedAgents && assignedAgents.length > 1 && (
          <div className="flex items-center justify-end -space-x-1.5 pt-1">
            {assignedAgents.slice(1, 4).map((agent) => (
              <Avatar key={agent._id} className="h-5 w-5 ring-2 ring-background shadow-sm">
                {agent.avatarUrl ? (
                  <AvatarImage src={agent.avatarUrl} alt={agent.name} />
                ) : null}
                <AvatarFallback className="text-[8px] font-semibold bg-muted text-muted-foreground">
                  {agent.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ))}
            {assignedAgents.length > 4 && (
              <div className="h-5 w-5 rounded-full ring-2 ring-background bg-muted/80 flex items-center justify-center shadow-sm">
                <span className="text-[8px] font-semibold text-muted-foreground">+{assignedAgents.length - 4}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
