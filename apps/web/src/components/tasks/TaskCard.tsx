"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Doc } from "@packages/backend/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@packages/ui/components/card";
import { Badge } from "@packages/ui/components/badge";
import { Avatar, AvatarFallback } from "@packages/ui/components/avatar";
import { cn } from "@packages/ui/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ChevronRight } from "lucide-react";

interface TaskCardProps {
  task: Doc<"tasks">;
  accountSlug?: string; // Kept for compatibility but not currently used
  isDragging?: boolean;
  onClick?: () => void;
  assignedAgents?: Doc<"agents">[];
}

const priorityColors: Record<number, string> = {
  1: "bg-destructive",
  2: "bg-destructive/70",
  3: "bg-primary/60",
  4: "bg-primary/40",
  5: "bg-muted-foreground/40",
};

/** Left border color by task status for at-a-glance visual cue */
const statusBorderColors: Record<string, string> = {
  inbox: "border-l-muted-foreground/40",
  assigned: "border-l-primary/60",
  in_progress: "border-l-amber-500/70",
  review: "border-l-violet-500/70",
  done: "border-l-emerald-500/70",
  blocked: "border-l-destructive/70",
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
  
  // Get the first assigned agent for display
  const primaryAgent = assignedAgents?.[0];

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
        "cursor-grab active:cursor-grabbing transition-all border-l-4 group",
        statusBorder,
        "hover:shadow-md hover:border-primary/20 hover:bg-accent/30",
        isDragging && "opacity-50 shadow-lg rotate-2",
        onClick && "cursor-pointer"
      )}
    >
      <CardHeader className="p-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <div 
              className={cn(
                "w-2 h-2 rounded-full shrink-0 mt-1.5",
                priorityColors[task.priority] || priorityColors[5]
              )}
              title={`Priority ${task.priority}`}
            />
            <CardTitle className="text-sm font-medium line-clamp-2 text-balance">
              {task.title}
            </CardTitle>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </div>
      </CardHeader>
      
      <CardContent className="p-3 pt-0 space-y-2.5">
        {/* Description preview */}
        {task.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {task.description}
          </p>
        )}
        
        {/* Agent and timestamp row */}
        <div className="flex items-center justify-between gap-2">
          {primaryAgent ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <Avatar className="h-5 w-5 border border-background">
                <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                  {primaryAgent.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground truncate">
                {primaryAgent.name}
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground/60">Unassigned</span>
          )}
          
          <span className="text-[10px] text-muted-foreground/70 shrink-0">
            {formatDistanceToNow(task.updatedAt, { addSuffix: false })}
          </span>
        </div>
        
        {/* Labels */}
        {task.labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {task.labels.slice(0, 3).map((label) => (
              <Badge 
                key={label} 
                variant="outline" 
                className="text-[10px] px-1.5 py-0 h-5 bg-muted/50 border-border/50 font-normal"
              >
                {label}
              </Badge>
            ))}
            {task.labels.length > 3 && (
              <Badge 
                variant="outline" 
                className="text-[10px] px-1.5 py-0 h-5 bg-muted/50 border-border/50 font-normal"
              >
                +{task.labels.length - 3}
              </Badge>
            )}
          </div>
        )}
        
        {/* Additional assignees indicator */}
        {assignedAgents && assignedAgents.length > 1 && (
          <div className="flex items-center justify-end -space-x-1.5">
            {assignedAgents.slice(1, 4).map((agent) => (
              <Avatar key={agent._id} className="h-5 w-5 border-2 border-background">
                <AvatarFallback className="text-[9px] bg-muted text-muted-foreground">
                  {agent.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ))}
            {assignedAgents.length > 4 && (
              <div className="h-5 w-5 rounded-full border-2 border-background bg-muted flex items-center justify-center">
                <span className="text-[9px] text-muted-foreground">+{assignedAgents.length - 4}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
