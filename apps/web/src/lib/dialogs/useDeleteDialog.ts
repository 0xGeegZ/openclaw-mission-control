'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { Id } from '@packages/backend/convex/_generated/dataModel';

/**
 * Type-safe entity configuration for delete dialog factory pattern.
 */
interface DeleteEntityConfig<T extends string> {
  /** Entity type identifier (e.g., 'task', 'agent') */
  type: T;
  /** Dialog title (e.g., "Delete Task") */
  title: string;
  /** Warning message explaining the action and consequences */
  description: string;
  /** Toast success message (e.g., "Task deleted") */
  successMessage: string;
  /** Button action label (e.g., "Delete Task") */
  actionLabel: string;
}

/**
 * Standard entity configs for common delete operations.
 * Centralized to ensure consistency across the app.
 */
export const DELETE_ENTITY_CONFIGS = {
  task: {
    type: 'task',
    title: 'Delete Task',
    description:
      'This action cannot be undone. The task will be permanently removed along with all messages and attachments.',
    successMessage: 'Task deleted',
    actionLabel: 'Delete Task',
  } as const,
  agent: {
    type: 'agent',
    title: 'Delete Agent',
    description:
      'This action cannot be undone. The agent will be removed from all task assignments and all associated data will be permanently deleted.',
    successMessage: 'Agent deleted',
    actionLabel: 'Delete Agent',
  } as const,
} as const;

/**
 * Hook union type for all supported entity types.
 */
export type DeleteEntityType = keyof typeof DELETE_ENTITY_CONFIGS;

/**
 * Return type for the useDeleteDialog hook.
 */
export interface UseDeleteDialogReturn {
  /** Handler function to call the delete mutation */
  handleDelete: () => Promise<void>;
  /** Title for the dialog */
  title: string;
  /** Description for the dialog */
  description: string;
  /** Action button label */
  actionLabel: string;
}

/**
 * Factory hook for creating type-safe delete dialog handlers.
 *
 * Centralizes and removes duplication from delete dialogs by:
 * - Accepting a configuration for the entity type
 * - Wrapping the mutation with standard error handling
 * - Providing toast notifications
 * - Returning consistent dialog configuration
 *
 * @template T - Entity type (task, agent, etc.)
 * @param config - Entity configuration (title, description, success message, etc.)
 * @param mutation - Async function that performs the deletion (should throw on error)
 * @param onSuccess - Optional callback after successful deletion (receives the entity name)
 * @returns Object containing handleDelete function and dialog config
 *
 * @example
 * ```tsx
 * const removeTask = useMutation(api.tasks.remove);
 * const { handleDelete, title, description, actionLabel } = useDeleteDialog(
 *   DELETE_ENTITY_CONFIGS.task,
 *   async () => {
 *     await removeTask({ taskId });
 *   },
 *   () => onOpenChange(false)
 * );
 *
 * return (
 *   <ConfirmDeleteDialog
 *     open={open}
 *     onOpenChange={onOpenChange}
 *     title={title}
 *     description={description}
 *     itemName={taskTitle}
 *     onConfirm={handleDelete}
 *     actionLabel={actionLabel}
 *   />
 * );
 * ```
 */
export function useDeleteDialog(
  config: DeleteEntityConfig<DeleteEntityType>,
  mutation: () => Promise<void>,
  onSuccess?: () => void
): UseDeleteDialogReturn {
  const handleDelete = useCallback(async () => {
    try {
      await mutation();
      toast.success(config.successMessage);
      onSuccess?.();
    } catch (error) {
      throw error instanceof Error
        ? new Error(error.message)
        : new Error(`Failed to delete ${config.type}`);
    }
  }, [config, mutation, onSuccess]);

  return {
    handleDelete,
    title: config.title,
    description: config.description,
    actionLabel: config.actionLabel,
  };
}
