'use client';

import { useMutation } from 'convex/react';
import { api } from '@packages/backend/convex/_generated/api';
import { Id } from '@packages/backend/convex/_generated/dataModel';
import { ConfirmDeleteDialog } from '@/components/ui/ConfirmDeleteDialog';
import { toast } from 'sonner';

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
 * Thin wrapper around ConfirmDeleteDialog that handles:
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

  const handleDelete = async () => {
    try {
      await removeAgent({ agentId });
      toast.success('Agent deleted');
      onOpenChange(false);
      onDeleted?.();
    } catch (error) {
      throw error instanceof Error
        ? new Error(error.message)
        : new Error('Failed to delete agent');
    }
  };

  return (
    <ConfirmDeleteDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Agent"
      description="This action cannot be undone. The agent will be removed from all task assignments and all associated data will be permanently deleted."
      itemName={agentName}
      onConfirm={handleDelete}
      actionLabel="Delete Agent"
    />
  );
}
