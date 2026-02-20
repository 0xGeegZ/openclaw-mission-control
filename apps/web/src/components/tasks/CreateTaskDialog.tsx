"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/select";
import { toast } from "sonner";
import { Loader2, Plus, FileText, Sparkles, Zap } from "lucide-react";

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const COMPLEXITY_OPTIONS = [
  { value: "easy", label: "Easy", description: "Simple content, design tasks" },
  { value: "medium", label: "Medium", description: "Standard feature work" },
  { value: "complex", label: "Complex", description: "API, integration, bug fixes" },
  { value: "hard", label: "Hard", description: "Architecture, security, migrations" },
];

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
  const [complexity, setComplexity] = useState<string>("");
  const [autoMode, setAutoMode] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createTask = useMutation(api.tasks.create);
  
  // Query to detect complexity if auto mode is on
  const detectedComplexity = useQuery(
    api.tasks.detectComplexity,
    title.length >= 3 ? { title, description: description || undefined } : null
  );

  // Update complexity when detected
  useState(() => {
    if (autoMode && detectedComplexity) {
      setComplexity(detectedComplexity);
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId || !title.trim()) return;

    setIsSubmitting(true);
    try {
      await createTask({
        accountId,
        title: title.trim(),
        description: description.trim() || undefined,
        complexity: complexity as "easy" | "medium" | "complex" | "hard" | undefined,
      });

      toast.success("Task created successfully");
      setTitle("");
      setDescription("");
      setComplexity("");
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
      <DialogContent className="flex max-h-[90vh] flex-col gap-4 overflow-hidden sm:max-w-md">
        <DialogHeader className="shrink-0">
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
        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col gap-4"
        >
          <div className="min-h-0 flex-1 overflow-auto pr-2">
            <div className="space-y-4">
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
                  rows={4}
                  className="min-h-[6rem] resize-y text-sm"
                />
                <p className="text-[11px] text-muted-foreground/60">
                  Supports Markdown formatting
                </p>
              </div>

              {/* Auto Mode Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <Label htmlFor="auto-mode" className="text-sm font-medium cursor-pointer">
                    Auto Mode
                  </Label>
                </div>
                <button
                  type="button"
                  id="auto-mode"
                  role="switch"
                  aria-checked={autoMode}
                  onClick={() => setAutoMode(!autoMode)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                    autoMode ? "bg-primary" : "bg-input"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      autoMode ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Complexity Selector */}
              {autoMode && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                    Complexity
                    <span className="text-muted-foreground/60 font-normal text-xs">
                      (auto-detected)
                    </span>
                  </Label>
                  <Select value={complexity} onValueChange={setComplexity}>
                    <SelectTrigger id="complexity">
                      <SelectValue placeholder="Select complexity level" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPLEXITY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex flex-col">
                            <span className="font-medium">{opt.label}</span>
                            <span className="text-xs text-muted-foreground">
                              {opt.description}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground/60">
                    Determines which agents and models are recommended
                  </p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="shrink-0 gap-2 pt-2 sm:gap-2">
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
