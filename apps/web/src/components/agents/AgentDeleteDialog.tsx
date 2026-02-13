'use client';

import { useMutation } from 'convex/react';
import { api } from '@packages/backend/convex/_generated/api';
import { Id } from '@packages/backend/convex/_generated/dataModel';
import { ConfirmDeleteDialog } from '@/components/ui/ConfirmDeleteDialog';
import {
  useDeleteDialog,
  DELETE_ENTITY_CONFIGS,
} from '@/lib/dialogs/useDeleteDialog';

interface AgentDeleteDialogProps {
  agentId: Id<'agents'>;
  agentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

/**
 * Confirmation dialog for deleting an agent.
 *
 * Uses the useDeleteDialog factory hook to eliminate duplication
 * across delete dialogs. Handles:
 * - Convex mutation (api.agents.remove)
 * - Toast notifications
 * - Callback on successful deletion
 */
export function AgentDeleteDialog({
  agentId,
  agentName,
  open,
  onOpenChange,
  onDeleted,
}: AgentDeleteDialogProps) {
  const removeAgent = useMutation(api.agents.remove);
  const { handleDelete, title, description, actionLabel } = useDeleteDialog(
    DELETE_ENTITY_CONFIGS.agent,
    () => removeAgent({ agentId }),
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
      itemName={agentName}
      onConfirm={handleDelete}
      actionLabel={actionLabel}
    />
  );
}
