'use client';

import { useMutation } from 'convex/react';
import { api } from '@packages/backend/convex/_generated/api';
import { Id } from '@packages/backend/convex/_generated/dataModel';
import { ConfirmDeleteDialog } from '@/components/ui/ConfirmDeleteDialog';
import {
  useDeleteDialog,
  DELETE_ENTITY_CONFIGS,
} from '@/lib/dialogs/useDeleteDialog';

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
 * Uses the useDeleteDialog factory hook to eliminate duplication
 * across delete dialogs. Handles:
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
  const { handleDelete, title, description, actionLabel } = useDeleteDialog(
    DELETE_ENTITY_CONFIGS.task,
    () => removeTask({ taskId }),
    () => {
      onOpenChange(false);
      onDeleted?.();
    }
  );

  return (
    <ConfirmDeleteDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      itemName={taskTitle}
      onConfirm={handleDelete}
      actionLabel={actionLabel}
    />
  );
}
