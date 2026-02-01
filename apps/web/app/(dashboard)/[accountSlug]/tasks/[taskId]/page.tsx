"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id } from "@packages/backend/convex/_generated/dataModel";
import { TaskHeader } from "@/components/tasks/TaskHeader";
import { TaskThread } from "@/components/tasks/TaskThread";
import { TaskDocuments } from "@/components/tasks/TaskDocuments";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@packages/ui/components/tabs";
import { Skeleton } from "@packages/ui/components/skeleton";

interface TaskDetailPageProps {
  params: Promise<{ accountSlug: string; taskId: string }>;
}

/**
 * Task detail page with thread and documents.
 */
export default function TaskDetailPage({ params }: TaskDetailPageProps) {
  const { accountSlug, taskId } = use(params);
  
  const task = useQuery(api.tasks.get, { taskId: taskId as Id<"tasks"> });
  
  if (task === undefined) {
    return <TaskDetailSkeleton />;
  }
  
  if (task === null) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Task not found</h1>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full">
      <TaskHeader task={task} accountSlug={accountSlug} />
      
      <Tabs defaultValue="thread" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-6 mt-4">
          <TabsTrigger value="thread">Thread</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>
        
        <TabsContent value="thread" className="flex-1 overflow-hidden mt-4">
          <TaskThread taskId={task._id} accountSlug={accountSlug} />
        </TabsContent>
        
        <TabsContent value="documents" className="flex-1 overflow-auto">
          <TaskDocuments taskId={task._id} />
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
    <div className="flex flex-col h-full">
      <div className="border-b p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full" />
      </div>
      <div className="flex-1 p-6 space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}
