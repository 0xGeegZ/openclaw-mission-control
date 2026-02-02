"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@packages/ui/components/dialog";
import { Button } from "@packages/ui/components/button";
import { Textarea } from "@packages/ui/components/textarea";
import { Label } from "@packages/ui/components/label";
import { Loader2, AlertTriangle } from "lucide-react";

interface BlockedReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<void>;
  taskTitle?: string;
}

/**
 * Dialog to capture the reason when moving a task to blocked status.
 */
export function BlockedReasonDialog({
  open,
  onOpenChange,
  onConfirm,
  taskTitle,
}: BlockedReasonDialogProps) {
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;

    setIsSubmitting(true);
    try {
      await onConfirm(reason.trim());
      setReason("");
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setReason("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Mark as Blocked
          </DialogTitle>
          <DialogDescription>
            {taskTitle ? (
              <>
                Explain why <span className="font-medium">{taskTitle}</span> is blocked.
              </>
            ) : (
              "Please provide a reason for blocking this task."
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="blocked-reason">Reason</Label>
            <Textarea
              id="blocked-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Waiting for API access, blocked by another task, missing requirements..."
              rows={3}
              className="resize-none"
              required
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={isSubmitting || !reason.trim()}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? "Updating..." : "Mark Blocked"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
