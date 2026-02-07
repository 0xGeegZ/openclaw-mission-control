'use client';

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useState } from 'react';

/**
 * Generic confirmation dialog for delete operations.
 * 
 * Replaces repetitive delete confirmation dialogs with a reusable,
 * type-safe component that handles the common pattern:
 * - Title + description
 * - Action button (delete/remove)
 * - Cancel button
 * - Loading state during async operations
 * 
 * @template T - The type of item being deleted (Agent, Task, etc.)
 * 
 * @example
 * ```tsx
 * const [open, setOpen] = useState(false);
 * 
 * <ConfirmDeleteDialog<Agent>
 *   open={open}
 *   onOpenChange={setOpen}
 *   title="Delete Agent"
 *   description="This action cannot be undone. The agent will be permanently deleted."
 *   itemName={agent.name}
 *   onConfirm={async () => {
 *     await deleteAgent(agent.id);
 *   }}
 * />
 * ```
 */
export interface ConfirmDeleteDialogProps<T = unknown> {
  /** Whether the dialog is open */
  open: boolean;
  
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  
  /** Dialog title (e.g., "Delete Agent", "Remove Task") */
  title: string;
  
  /** Warning/description text explaining the action */
  description: string;
  
  /** Name/label of the item being deleted (shown for context) */
  itemName: string;
  
  /** Callback when user confirms deletion (should throw on error) */
  onConfirm: () => Promise<void>;
  
  /** Optional: Custom action button text (default: "Delete") */
  actionLabel?: string;
  
  /** Optional: Custom cancel button text (default: "Cancel") */
  cancelLabel?: string;
  
  /** Optional: Additional CSS class for the dialog content */
  className?: string;
}

export function ConfirmDeleteDialog<T = unknown>({
  open,
  onOpenChange,
  title,
  description,
  itemName,
  onConfirm,
  actionLabel = 'Delete',
  cancelLabel = 'Cancel',
  className,
}: ConfirmDeleteDialogProps<T>) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    try {
      setError(null);
      setIsLoading(true);
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'An error occurred while deleting'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={className}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>{description}</p>
            {itemName && (
              <p className="text-xs font-mono bg-muted px-2 py-1 rounded">
                {itemName}
              </p>
            )}
            {error && (
              <p className="text-sm text-destructive mt-2">{error}</p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex justify-end gap-3">
          <AlertDialogCancel disabled={isLoading}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? 'Deleting...' : actionLabel}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
