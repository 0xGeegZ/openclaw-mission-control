"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Doc } from "@packages/backend/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@packages/ui/components/card";
import { Badge } from "@packages/ui/components/badge";
import { Avatar, AvatarFallback } from "@packages/ui/components/avatar";
import { cn } from "@packages/ui/lib/utils";
import Link from "next/link";

interface TaskCardProps {
  task: Doc<"tasks">;
  accountSlug: string;
  isDragging?: boolean;
}

const priorityColors: Record<number, string> = {
  1: "bg-red-500",
  2: "bg-orange-500",
  3: "bg-yellow-500",
  4: "bg-blue-500",
  5: "bg-gray-500",
};

/**
 * Task card component for Kanban board.
 * Draggable card showing task details.
 */
export function TaskCard({ task, accountSlug, isDragging }: TaskCardProps) {
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

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50"
      )}
    >
      <CardHeader className="p-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <Link 
            href={`/${accountSlug}/tasks/${task._id}`}
            className="hover:underline flex-1"
            onClick={(e) => e.stopPropagation()}
          >
            <CardTitle className="text-sm font-medium line-clamp-2">
              {task.title}
            </CardTitle>
          </Link>
          <div 
            className={cn(
              "w-2 h-2 rounded-full shrink-0 mt-1",
              priorityColors[task.priority] || priorityColors[5]
            )}
            title={`Priority ${task.priority}`}
          />
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1">
            {task.labels.slice(0, 2).map((label) => (
              <Badge key={label} variant="secondary" className="text-xs">
                {label}
              </Badge>
            ))}
          </div>
          <div className="flex -space-x-2">
            {task.assignedAgentIds.slice(0, 3).map((id) => (
              <Avatar key={id} className="h-6 w-6 border-2 border-background">
                <AvatarFallback className="text-xs">A</AvatarFallback>
              </Avatar>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
