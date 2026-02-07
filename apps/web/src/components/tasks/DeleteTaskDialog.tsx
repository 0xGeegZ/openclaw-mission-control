'use client';

import { useMutation } from 'convex/react';
import { api } from '@packages/backend/convex/_generated/api';
import { Id } from '@packages/backend/convex/_generated/dataModel';
import { ConfirmDeleteDialog } from '@/components/shared';
import { toast } from 'sonner';

interface DeleteTaskDialogProps {
  taskId: Id<'tasks'>;
  taskTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

/**
 * Confirmation dialog for deleting a task.
 * 
 * Thin wrapper around ConfirmDeleteDialog that handles:
 * - Convex mutation (api.tasks.remove)
 * - Toast notifications
 * - Callback on successful deletion
 */
export function DeleteTaskDialog({
  taskId,
  taskTitle,
  open,
  onOpenChange,
  onDeleted,
}: DeleteTaskDialogProps) {
  const removeTask = useMutation(api.tasks.remove);

  const handleDelete = async () => {
    try {
      await removeTask({ taskId });
      toast.success('Task deleted');
      onOpenChange(false);
      onDeleted?.();
    } catch (error) {
      throw error instanceof Error
        ? new Error(error.message)
        : new Error('Failed to delete task');
    }
  };

  return (
    <ConfirmDeleteDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Task"
      description="This action cannot be undone. The task will be permanently removed along with all messages and attachments."
      itemName={taskTitle}
      onConfirm={handleDelete}
      actionLabel="Delete Task"
    />
  );
}
