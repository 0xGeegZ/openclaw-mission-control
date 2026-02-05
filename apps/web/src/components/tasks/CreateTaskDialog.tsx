"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useAccount } from "@/lib/hooks/useAccount";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@packages/ui/components/dialog";
import { Button } from "@packages/ui/components/button";
import { Input } from "@packages/ui/components/input";
import { Label } from "@packages/ui/components/label";
import { Textarea } from "@packages/ui/components/textarea";
import { toast } from "sonner";
import { Loader2, Plus, FileText } from "lucide-react";

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog for creating a new task.
 */
export function CreateTaskDialog({
  open,
  onOpenChange,
}: CreateTaskDialogProps) {
  const { accountId } = useAccount();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createTask = useMutation(api.tasks.create);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId || !title.trim()) return;

    setIsSubmitting(true);
    try {
      await createTask({
        accountId,
        title: title.trim(),
        description: description.trim() || undefined,
      });

      toast.success("Task created successfully");
      setTitle("");
      setDescription("");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to create task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10">
              <Plus className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-lg">Create Task</DialogTitle>
              <DialogDescription className="text-sm mt-0.5">
                Add a new task to your inbox
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="title" className="text-sm font-medium">
              Title
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              required
              autoFocus
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="description"
              className="text-sm font-medium flex items-center gap-2"
            >
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              Description
              <span className="text-muted-foreground/60 font-normal text-xs">
                (optional)
              </span>
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add more details about this task..."
              rows={8}
              className="min-h-[10rem] resize-y text-sm"
            />
            <p className="text-[11px] text-muted-foreground/60">
              Supports Markdown formatting
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="min-w-[120px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Task
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
