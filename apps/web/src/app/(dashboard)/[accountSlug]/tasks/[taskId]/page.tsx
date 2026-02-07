"use client";

import { use } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id } from "@packages/backend/convex/_generated/dataModel";
import { TaskHeader } from "@/components/tasks/TaskHeader";
import { TaskThread } from "@/components/tasks/TaskThread";
import { TaskDocuments } from "@/components/tasks/TaskDocuments";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@packages/ui/components/tabs";
import { Skeleton } from "@packages/ui/components/skeleton";
import { MessageSquare, FileText, AlertCircle } from "lucide-react";
import { Button } from "@packages/ui/components/button";
import Link from "next/link";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

interface TaskDetailPageProps {
  params: Promise<{ accountSlug: string; taskId: string }>;
}

/**
 * Task detail page with thread and documents.
 */
export default function TaskDetailPage({ params }: TaskDetailPageProps) {
  const { accountSlug, taskId } = use(params);
  const { isAuthenticated } = useConvexAuth();

  const task = useQuery(
    api.tasks.get,
    isAuthenticated ? { taskId: taskId as Id<"tasks"> } : "skip",
  );

  if (task === undefined) {
    return <TaskDetailSkeleton />;
  }

  if (task === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 text-center px-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 mb-4">
          <AlertCircle className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="text-xl font-semibold">Task not found</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          This task may have been deleted or you don&apos;t have permission to
          view it.
        </p>
        <Button asChild className="mt-4">
          <Link href={`/${accountSlug}/tasks`}>Back to Tasks</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-muted/30">
      <TaskHeader task={task} accountSlug={accountSlug} />

      <Tabs defaultValue="thread" className="flex-1 flex flex-col min-h-0">
        <div className="shrink-0 border-b bg-card px-4">
          <TabsList variant="line" className="h-9">
            <TabsTrigger value="thread" className="px-4 gap-2">
              <MessageSquare className="h-4 w-4" />
              Thread
            </TabsTrigger>
            <TabsTrigger value="documents" className="px-4 gap-2">
              <FileText className="h-4 w-4" />
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
            useReadByFallback
          />
        </TabsContent>

        <TabsContent
          value="documents"
          className="relative flex-1 min-h-0 overflow-auto mt-0 p-4 data-[state=inactive]:hidden"
        >
          <ErrorBoundary variant="section">
            <TaskDocuments taskId={task._id} />
          </ErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Loading skeleton for task detail page.
 */
function TaskDetailSkeleton() {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 border-b bg-card p-6 space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="shrink-0 border-b bg-card px-4 h-10 flex items-center">
        <div className="flex gap-2">
          <Skeleton className="h-6 w-20 rounded" />
          <Skeleton className="h-6 w-24 rounded" />
        </div>
      </div>
      <div className="flex-1 p-6 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-9 w-9 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
