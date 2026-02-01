"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Doc } from "@packages/backend/convex/_generated/dataModel";
import { Badge } from "@packages/ui/components/badge";
import { Button } from "@packages/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/select";
import { Input } from "@packages/ui/components/input";
import { useAccount } from "@/lib/hooks/useAccount";
import { TaskStatus, TASK_STATUS_LABELS } from "@packages/shared";
import { toast } from "sonner";
import { Edit2, Check, X } from "lucide-react";

interface TaskHeaderProps {
  task: Doc<"tasks">;
  accountSlug: string;
}

/**
 * Task header with title, status, and controls.
 */
export function TaskHeader({ task, accountSlug }: TaskHeaderProps) {
  const { accountId } = useAccount();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState(task.title);
  
  const updateTask = useMutation(api.tasks.update);
  const updateStatus = useMutation(api.tasks.updateStatus);
  
  const handleTitleSave = async () => {
    if (title.trim() === task.title) {
      setIsEditingTitle(false);
      return;
    }
    
    try {
      await updateTask({
        taskId: task._id,
        title: title.trim(),
      });
      setIsEditingTitle(false);
      toast.success("Task updated");
    } catch (error) {
      toast.error("Failed to update task");
    }
  };
  
  const handleStatusChange = async (newStatus: TaskStatus) => {
    try {
      await updateStatus({
        taskId: task._id,
        status: newStatus,
      });
      toast.success("Status updated");
    } catch (error) {
      toast.error("Failed to update status", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
  
  return (
    <div className="border-b p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        {isEditingTitle ? (
          <div className="flex-1 flex items-center gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-2xl font-bold"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleTitleSave();
                if (e.key === "Escape") {
                  setTitle(task.title);
                  setIsEditingTitle(false);
                }
              }}
              autoFocus
            />
            <Button variant="ghost" size="icon" onClick={handleTitleSave}>
              <Check className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => {
              setTitle(task.title);
              setIsEditingTitle(false);
            }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex-1 flex items-center gap-2">
            <h1 className="text-2xl font-bold">{task.title}</h1>
            <Button variant="ghost" size="icon" onClick={() => setIsEditingTitle(true)}>
              <Edit2 className="h-4 w-4" />
            </Button>
          </div>
        )}
        
        <div className="flex items-center gap-2">
          <Select value={task.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {task.description && (
        <p className="text-muted-foreground">{task.description}</p>
      )}
      
      <div className="flex items-center gap-4">
        {task.labels.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {task.labels.map((label) => (
              <Badge key={label} variant="secondary">
                {label}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
