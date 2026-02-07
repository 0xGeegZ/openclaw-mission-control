"use client";

import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Doc } from "@packages/backend/convex/_generated/dataModel";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/select";
import { Badge } from "@packages/ui/components/badge";
import { toast } from "sonner";
import { Loader2, X, Plus } from "lucide-react";
import { format } from "date-fns";

interface TaskEditDialogProps {
  task: Doc<"tasks">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PRIORITY_OPTIONS = [
  { value: "1", label: "Critical", color: "bg-red-500" },
  { value: "2", label: "High", color: "bg-orange-500" },
  { value: "3", label: "Medium", color: "bg-yellow-500" },
  { value: "4", label: "Low", color: "bg-blue-500" },
  { value: "5", label: "Lowest", color: "bg-slate-400" },
];

/**
 * Dialog for editing task details: description, priority, labels, due date.
 */
export function TaskEditDialog({
  task,
  open,
  onOpenChange,
}: TaskEditDialogProps) {
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState(String(task.priority));
  const [labels, setLabels] = useState<string[]>(task.labels);
  const [newLabel, setNewLabel] = useState("");
  const [dueDate, setDueDate] = useState(
    task.dueDate ? format(new Date(task.dueDate), "yyyy-MM-dd") : "",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateTask = useMutation(api.tasks.update);

  // Sync state when task changes
  useEffect(() => {
    setDescription(task.description ?? "");
    setPriority(String(task.priority));
    setLabels(task.labels);
    setDueDate(
      task.dueDate ? format(new Date(task.dueDate), "yyyy-MM-dd") : "",
    );
  }, [task]);

  const handleAddLabel = () => {
    const trimmed = newLabel.trim().toLowerCase();
    if (trimmed && !labels.includes(trimmed)) {
      setLabels([...labels, trimmed]);
      setNewLabel("");
    }
  };

  const handleRemoveLabel = (label: string) => {
    setLabels(labels.filter((l) => l !== label));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await updateTask({
        taskId: task._id,
        description: description.trim() || undefined,
        priority: parseInt(priority, 10),
        labels,
        dueDate: dueDate ? new Date(dueDate).getTime() : undefined,
      });
      toast.success("Task updated");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to update task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-4 overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>Edit Task</DialogTitle>
          <DialogDescription>
            Update task details for{" "}
            <span className="font-medium">{task.title}</span>
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col gap-4"
        >
          <div className="min-h-0 flex-1 overflow-auto pr-2">
            <div className="space-y-4">
              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add more details about this task...&#10;&#10;Supports **Markdown** formatting"
                  rows={4}
                  className="resize-none font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Supports Markdown formatting
                </p>
              </div>

              {/* Priority & Due Date row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-priority">Priority</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger id="edit-priority">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-2 h-2 rounded-full ${opt.color}`}
                            />
                            {opt.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-due-date">Due Date</Label>
                  <Input
                    id="edit-due-date"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Labels */}
              <div className="space-y-2">
                <Label>Labels</Label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {labels.map((label) => (
                    <Badge
                      key={label}
                      variant="secondary"
                      className="gap-1 pr-1"
                    >
                      {label}
                      <button
                        type="button"
                        onClick={() => handleRemoveLabel(label)}
                        className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                      >
                        <X className="h-3 w-3" />
                        <span className="sr-only">Remove {label}</span>
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="Add a label..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddLabel();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleAddLabel}
                    disabled={!newLabel.trim()}
                  >
                    <Plus className="h-4 w-4" />
                    <span className="sr-only">Add label</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
