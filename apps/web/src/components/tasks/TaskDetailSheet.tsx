"use client";

import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id, Doc } from "@packages/backend/convex/_generated/dataModel";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@packages/ui/components/sheet";
import { Badge } from "@packages/ui/components/badge";
import { Button } from "@packages/ui/components/button";
import { Avatar, AvatarFallback } from "@packages/ui/components/avatar";

import { Skeleton } from "@packages/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@packages/ui/components/tabs";
import { ScrollArea } from "@packages/ui/components/scroll-area";
import { formatDistanceToNow, format } from "date-fns";
import { 
  ArrowUpRight, 
  Calendar, 
  MessageSquare, 
  FileText,
  Clock,
  Flag,
  Tag
} from "lucide-react";
import Link from "next/link";
import { TASK_STATUS_LABELS } from "@packages/shared";
import { TaskThread } from "./TaskThread";
import { TaskDocuments } from "./TaskDocuments";

interface TaskDetailSheetProps {
  taskId: Id<"tasks"> | null;
  accountSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PRIORITY_CONFIG: Record<number, { label: string; color: string }> = {
  1: { label: "Critical", color: "bg-red-500" },
  2: { label: "High", color: "bg-orange-500" },
  3: { label: "Medium", color: "bg-yellow-500" },
  4: { label: "Low", color: "bg-blue-500" },
  5: { label: "Lowest", color: "bg-slate-400" },
};

const STATUS_COLORS: Record<string, string> = {
  inbox: "bg-muted-foreground/40",
  assigned: "bg-primary",
  in_progress: "bg-amber-500",
  review: "bg-violet-500",
  done: "bg-emerald-500",
  blocked: "bg-destructive",
};

/**
 * Task detail sheet component.
 * Opens as a slide-over panel showing full task details.
 */
export function TaskDetailSheet({ 
  taskId, 
  accountSlug, 
  open, 
  onOpenChange 
}: TaskDetailSheetProps) {
  const task = useQuery(
    api.tasks.get,
    taskId ? { taskId } : "skip"
  );

  const agents = useQuery(
    api.agents.getRoster,
    task?.accountId ? { accountId: task.accountId } : "skip"
  );

  const assignedAgents = agents?.filter(agent => 
    task?.assignedAgentIds.includes(agent._id)
  ) ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="right" 
        className="w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl p-0 flex flex-col"
        showCloseButton={true}
      >
        {task === undefined ? (
          <TaskDetailSkeleton />
        ) : task === null ? (
          <div className="flex flex-col items-center justify-center h-full p-6">
            <p className="text-muted-foreground">Task not found</p>
          </div>
        ) : (
          <>
            <SheetHeader className="p-4 pb-0 shrink-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[task.status]}`} />
                <span className="uppercase tracking-wide font-medium">Task Detail</span>
              </div>
              
              <div className="flex items-start justify-between gap-4">
                <SheetTitle className="text-lg font-semibold leading-tight text-balance pr-8">
                  {task.title}
                </SheetTitle>
              </div>
              
              <div className="flex items-center gap-2 mt-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/${accountSlug}/tasks/${task._id}`}>
                    <ArrowUpRight className="h-3.5 w-3.5 mr-1.5" />
                    Open Full Page
                  </Link>
                </Button>
              </div>
            </SheetHeader>
            
            <div className="p-4 space-y-4 shrink-0 border-b">
              {/* Status badge */}
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[task.status]}`} />
                  {TASK_STATUS_LABELS[task.status]}
                </Badge>
                
                {task.priority && (
                  <Badge variant="outline" className="gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_CONFIG[task.priority]?.color || PRIORITY_CONFIG[3].color}`} />
                    {PRIORITY_CONFIG[task.priority]?.label || "Medium"}
                  </Badge>
                )}
              </div>
              
              {/* Description */}
              {task.description && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {task.description}
                </p>
              )}
              
              {/* Blocked reason */}
              {task.status === "blocked" && task.blockedReason && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
                  <Flag className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Blocked Reason</p>
                    <p className="text-sm opacity-90">{task.blockedReason}</p>
                  </div>
                </div>
              )}
              
              {/* Metadata grid */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                {/* Assignees */}
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Assignees</span>
                  <div className="flex items-center gap-2">
                    {assignedAgents.length > 0 ? (
                      <div className="flex -space-x-2">
                        {assignedAgents.slice(0, 4).map((agent) => (
                          <Avatar key={agent._id} className="h-7 w-7 border-2 border-background">
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              {agent.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        ))}
                        {assignedAgents.length > 4 && (
                          <div className="h-7 w-7 rounded-full border-2 border-background bg-muted flex items-center justify-center">
                            <span className="text-xs text-muted-foreground">+{assignedAgents.length - 4}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </div>
                </div>
                
                {/* Due date */}
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Due Date</span>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>
                      {task.dueDate 
                        ? format(new Date(task.dueDate), "MMM d, yyyy")
                        : "No due date"
                      }
                    </span>
                  </div>
                </div>
                
                {/* Created */}
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Created</span>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{formatDistanceToNow(task.createdAt, { addSuffix: true })}</span>
                  </div>
                </div>
                
                {/* Updated */}
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Updated</span>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{formatDistanceToNow(task.updatedAt, { addSuffix: true })}</span>
                  </div>
                </div>
              </div>
              
              {/* Labels */}
              {task.labels.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    Labels
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {task.labels.map((label) => (
                      <Badge key={label} variant="secondary" className="text-xs">
                        {label}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Tabs for Thread / Documents */}
            <Tabs defaultValue="thread" className="flex-1 flex flex-col min-h-0">
              <div className="shrink-0 border-b px-4">
                <TabsList variant="line" className="h-10">
                  <TabsTrigger value="thread" className="px-4 gap-2 text-sm">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Thread
                  </TabsTrigger>
                  <TabsTrigger value="documents" className="px-4 gap-2 text-sm">
                    <FileText className="h-3.5 w-3.5" />
                    Documents
                  </TabsTrigger>
                </TabsList>
              </div>
              
              <TabsContent 
                value="thread" 
                className="relative flex-1 min-h-0 mt-0 data-[state=inactive]:hidden"
              >
                <TaskThread
                  taskId={task._id}
                  accountSlug={accountSlug}
                  accountId={task.accountId}
                />
              </TabsContent>
              
              <TabsContent 
                value="documents" 
                className="relative flex-1 min-h-0 mt-0 data-[state=inactive]:hidden"
              >
                <ScrollArea className="h-full">
                  <div className="p-4">
                    <TaskDocuments taskId={task._id} />
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function TaskDetailSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-6 w-3/4" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-16" />
      </div>
      <Skeleton className="h-16 w-full" />
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}
