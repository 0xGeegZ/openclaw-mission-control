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
import { Separator } from "@packages/ui/components/separator";
import { useAccount } from "@/lib/hooks/useAccount";
import { TaskStatus, TASK_STATUS_LABELS } from "@packages/shared";
import { toast } from "sonner";
import { Edit2, Check, X, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface TaskHeaderProps {
  task: Doc<"tasks">;
  accountSlug: string;
}

/**
 * Task header with title, status, and controls.
 */
export function TaskHeader({ task, accountSlug }: TaskHeaderProps) {
  useAccount();
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
    } catch {
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
    <div className="border-b bg-card">
      <div className="px-6 py-4 space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <Button variant="ghost" size="sm" className="h-8 px-2" asChild>
            <Link href={`/${accountSlug}/tasks`}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Tasks
            </Link>
          </Button>
        </div>
        
        <div className="flex items-start justify-between gap-4">
          {isEditingTitle ? (
            <div className="flex-1 flex items-center gap-2">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-2xl font-bold h-auto py-1"
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
                <span className="sr-only">Save</span>
              </Button>
              <Button variant="ghost" size="icon" onClick={() => {
                setTitle(task.title);
                setIsEditingTitle(false);
              }}>
                <X className="h-4 w-4" />
                <span className="sr-only">Cancel</span>
              </Button>
            </div>
          ) : (
            <div className="flex-1 flex items-center gap-2 group">
              <h1 className="text-2xl font-bold tracking-tight">{task.title}</h1>
              <Button 
                variant="ghost" 
                size="icon" 
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => setIsEditingTitle(true)}
              >
                <Edit2 className="h-4 w-4" />
                <span className="sr-only">Edit title</span>
              </Button>
            </div>
          )}
          
          <div className="flex items-center gap-2">
            <Select value={task.status} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-36">
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
          <p className="text-muted-foreground leading-relaxed">{task.description}</p>
        )}
        
        {task.labels.length > 0 && (
          <div className="flex items-center gap-2 pt-2">
            <Separator orientation="vertical" className="h-4" />
            <div className="flex gap-1.5 flex-wrap">
              {task.labels.map((label) => (
                <Badge key={label} variant="secondary" className="text-xs">
                  {label}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
