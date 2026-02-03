"use client";

import { useState, useCallback } from "react";
import { 
  DndContext, 
  DragEndEvent, 
  DragOverlay,
  DragStartEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useQuery, useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id, Doc } from "@packages/backend/convex/_generated/dataModel";
import { KanbanColumn } from "./KanbanColumn";
import { TaskCard } from "./TaskCard";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { BlockedReasonDialog } from "./BlockedReasonDialog";
import { useAccount } from "@/lib/hooks/useAccount";
import { TaskStatus, TASK_STATUS_ORDER } from "@packages/shared";
import { toast } from "sonner";

interface KanbanBoardProps {
  accountSlug: string;
}

/**
 * Kanban board component with drag-and-drop.
 * Main interface for task management.
 */
export function KanbanBoard({ accountSlug }: KanbanBoardProps) {
  const { accountId, isLoading: isAccountLoading } = useAccount();
  const [activeTask, setActiveTask] = useState<Doc<"tasks"> | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showBlockedDialog, setShowBlockedDialog] = useState(false);
  const [pendingBlockedTask, setPendingBlockedTask] = useState<Doc<"tasks"> | null>(null);
  
  const tasksData = useQuery(
    api.tasks.listByStatus,
    accountId ? { accountId } : "skip"
  );
  
  // Show loading while account is loading or tasks are loading
  const isLoading = isAccountLoading || (accountId && tasksData === undefined);
  
  const updateStatus = useMutation(api.tasks.updateStatus);
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const taskId = active.id as Id<"tasks">;
    
    // Find the task in any column
    if (tasksData?.tasks) {
      for (const tasks of Object.values(tasksData.tasks)) {
        const task = tasks.find(t => t._id === taskId);
        if (task) {
          setActiveTask(task);
          break;
        }
      }
    }
  }, [tasksData]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    
    if (!over || !accountId) return;
    
    const taskId = active.id as Id<"tasks">;
    const newStatus = over.id as TaskStatus;
    
    // Find current task
    let currentTask: Doc<"tasks"> | null = null;
    if (tasksData?.tasks) {
      for (const tasks of Object.values(tasksData.tasks)) {
        const task = tasks.find(t => t._id === taskId);
        if (task) {
          currentTask = task;
          break;
        }
      }
    }
    
    if (!currentTask || currentTask.status === newStatus) return;
    
    // For blocked status, show dialog to get reason
    if (newStatus === "blocked") {
      setPendingBlockedTask(currentTask);
      setShowBlockedDialog(true);
      return;
    }
    
    try {
      await updateStatus({ 
        taskId, 
        status: newStatus,
      });
      toast.success("Task status updated");
    } catch (error) {
      toast.error("Failed to update status", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, [accountId, tasksData, updateStatus]);
  
  const handleBlockedConfirm = async (reason: string) => {
    if (!pendingBlockedTask) return;
    
    try {
      await updateStatus({
        taskId: pendingBlockedTask._id,
        status: "blocked",
        blockedReason: reason,
      });
      toast.success("Task marked as blocked");
      setPendingBlockedTask(null);
    } catch (error) {
      toast.error("Failed to update status", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  };

  if (isLoading || !tasksData) {
    return <KanbanSkeleton />;
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 px-6 h-full">
          {TASK_STATUS_ORDER.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={tasksData.tasks[status] || []}
              accountSlug={accountSlug}
              onAddTask={status === "inbox" ? () => setShowCreateDialog(true) : undefined}
            />
          ))}
          
          {/* Blocked column */}
          <KanbanColumn
            status="blocked"
            tasks={tasksData.tasks.blocked || []}
            accountSlug={accountSlug}
          />
        </div>
        
        <DragOverlay>
          {activeTask && (
            <TaskCard task={activeTask} accountSlug={accountSlug} isDragging />
          )}
        </DragOverlay>
      </DndContext>
      
      <CreateTaskDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />
      
      <BlockedReasonDialog
        open={showBlockedDialog}
        onOpenChange={(open) => {
          setShowBlockedDialog(open);
          if (!open) setPendingBlockedTask(null);
        }}
        onConfirm={handleBlockedConfirm}
        taskTitle={pendingBlockedTask?.title}
      />
    </>
  );
}

/**
 * Loading skeleton for Kanban board.
 */
function KanbanSkeleton() {
  return (
    <div className="flex gap-4 px-6 h-full">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="w-72 shrink-0 flex flex-col gap-3 h-full rounded-xl bg-muted/30 border border-border/50 p-2">
          {/* Column header */}
          <div className="h-10 rounded-lg bg-muted animate-pulse" />
          {/* Task cards */}
          <div className="flex-1 space-y-2">
            {Array.from({ length: 2 }).map((_, j) => (
              <div key={j} className="h-24 rounded-lg bg-muted/60 animate-pulse" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
