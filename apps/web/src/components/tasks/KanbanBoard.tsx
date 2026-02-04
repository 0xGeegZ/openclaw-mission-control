"use client";

import { useState, useCallback, useMemo } from "react";
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
import { TaskDetailSheet } from "./TaskDetailSheet";
import { useAccount } from "@/lib/hooks/useAccount";
import { TaskStatus, TASK_STATUS_ORDER } from "@packages/shared";
import { toast } from "sonner";

const VALID_STATUSES: readonly TaskStatus[] = [...TASK_STATUS_ORDER, "blocked"];

function isValidStatus(value: string): value is TaskStatus {
  return (VALID_STATUSES as readonly string[]).includes(value);
}

/** Resolve drop target to column status. Dropping on a column uses status id; dropping on a task uses that task's status. */
function resolveDropTargetToStatus(
  overId: string,
  tasksByStatus: Record<TaskStatus, Doc<"tasks">[]> | undefined,
): TaskStatus | null {
  if (isValidStatus(overId)) return overId;
  if (!tasksByStatus) return null;
  for (const tasks of Object.values(tasksByStatus)) {
    const task = tasks.find((t) => String(t._id) === overId);
    if (task && isValidStatus(task.status)) return task.status as TaskStatus;
  }
  return null;
}

interface KanbanBoardProps {
  accountSlug: string;
  filterByAgentId?: Id<"agents"> | null;
  statusFilter?: TaskStatus;
}

/**
 * Kanban board component with drag-and-drop.
 * Main interface for task management.
 */
export function KanbanBoard({
  accountSlug,
  filterByAgentId,
  statusFilter,
}: KanbanBoardProps) {
  const { accountId, isLoading: isAccountLoading } = useAccount();
  const [activeTask, setActiveTask] = useState<Doc<"tasks"> | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showBlockedDialog, setShowBlockedDialog] = useState(false);
  const [pendingBlockedTask, setPendingBlockedTask] =
    useState<Doc<"tasks"> | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tasks"> | null>(
    null,
  );
  const [showTaskSheet, setShowTaskSheet] = useState(false);

  const tasksData = useQuery(
    api.tasks.listByStatus,
    accountId ? { accountId } : "skip",
  );

  const agents = useQuery(
    api.agents.getRoster,
    accountId ? { accountId } : "skip",
  );

  // Show loading while account is loading or tasks are loading
  const isLoading = isAccountLoading || (accountId && tasksData === undefined);

  const updateStatus = useMutation(api.tasks.updateStatus);

  // Filter tasks by agent if filterByAgentId is set (deps: tasksData + filterByAgentId for compiler)
  const filteredTasksData = useMemo(() => {
    if (!tasksData?.tasks || !filterByAgentId) return tasksData?.tasks;

    const filtered: Record<TaskStatus, Doc<"tasks">[]> = {
      inbox: [],
      assigned: [],
      in_progress: [],
      review: [],
      done: [],
      blocked: [],
    };

    for (const [status, tasks] of Object.entries(tasksData.tasks)) {
      filtered[status as TaskStatus] = tasks.filter((task) =>
        task.assignedAgentIds.includes(filterByAgentId),
      );
    }

    return filtered;
  }, [tasksData, filterByAgentId]);

  const handleTaskClick = useCallback((taskId: Id<"tasks">) => {
    setSelectedTaskId(taskId);
    setShowTaskSheet(true);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      const taskId = active.id as Id<"tasks">;

      // Find the task in any column
      if (tasksData?.tasks) {
        for (const tasks of Object.values(tasksData.tasks)) {
          const task = tasks.find((t) => t._id === taskId);
          if (task) {
            setActiveTask(task);
            break;
          }
        }
      }
    },
    [tasksData],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveTask(null);

      if (!over || !accountId) return;

      const taskId = active.id as Id<"tasks">;
      const newStatus = resolveDropTargetToStatus(
        String(over.id),
        tasksData?.tasks,
      );
      if (newStatus == null) return;

      // Find current task
      let currentTask: Doc<"tasks"> | null = null;
      if (tasksData?.tasks) {
        for (const tasks of Object.values(tasksData.tasks)) {
          const task = tasks.find((t) => t._id === taskId);
          if (task) {
            currentTask = task;
            break;
          }
        }
      }

      if (!currentTask || currentTask.status === newStatus) return;
      if (!isValidStatus(newStatus)) return;

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
    },
    [accountId, tasksData, updateStatus],
  );

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

  // Use filtered tasks if filter is active, otherwise use all tasks
  const displayTasks = filteredTasksData ?? tasksData.tasks;

  // Determine which statuses to show based on filter
  const statusesToShow = statusFilter
    ? [statusFilter]
    : [...TASK_STATUS_ORDER, "blocked" as TaskStatus];

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 px-4 h-full">
          {statusesToShow.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={displayTasks[status] || []}
              accountSlug={accountSlug}
              onAddTask={
                status === "inbox" ? () => setShowCreateDialog(true) : undefined
              }
              onTaskClick={handleTaskClick}
              agents={agents}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask && (
            <TaskCard
              task={activeTask}
              accountSlug={accountSlug}
              isDragging
              assignedAgents={agents?.filter((a) =>
                activeTask.assignedAgentIds.includes(a._id),
              )}
            />
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

      <TaskDetailSheet
        taskId={selectedTaskId}
        accountSlug={accountSlug}
        open={showTaskSheet}
        onOpenChange={setShowTaskSheet}
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
        <div
          key={i}
          className="w-72 shrink-0 flex flex-col gap-3 h-full rounded-xl bg-muted/30 border border-border/50 p-2"
        >
          {/* Column header */}
          <div className="h-10 rounded-lg bg-muted animate-pulse" />
          {/* Task cards */}
          <div className="flex-1 space-y-2">
            {Array.from({ length: 2 }).map((_, j) => (
              <div
                key={j}
                className="h-24 rounded-lg bg-muted/60 animate-pulse"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
