"use client";

import { useState, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id } from "@packages/backend/convex/_generated/dataModel";
import { Textarea } from "@packages/ui/components/textarea";
import { Button } from "@packages/ui/components/button";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@packages/ui/lib/utils";

interface MessageInputProps {
  taskId: Id<"tasks">;
}

/**
 * Message input with send button.
 * Basic implementation - mention autocomplete can be added later.
 */
export function MessageInput({ taskId }: MessageInputProps) {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const createMessage = useMutation(api.messages.create);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      await createMessage({
        taskId,
        content: content.trim(),
      });
      
      setContent("");
      textareaRef.current?.focus();
    } catch (error) {
      toast.error("Failed to send message", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };
  
  return (
    <form onSubmit={handleSubmit} className="border-t bg-card p-4">
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (use @ to mention agents)"
            rows={2}
            className={cn(
              "resize-none min-h-[80px] transition-all",
              "focus-visible:ring-primary/50"
            )}
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Press <kbd className="px-1.5 py-0.5 text-[10px] font-semibold bg-muted rounded border">Enter</kbd> to send, <kbd className="px-1.5 py-0.5 text-[10px] font-semibold bg-muted rounded border">Shift + Enter</kbd> for new line
          </p>
        </div>
        <Button 
          type="submit" 
          disabled={!content.trim() || isSubmitting} 
          size="icon"
          className="h-10 w-10 shrink-0"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          <span className="sr-only">Send message</span>
        </Button>
      </div>
    </form>
  );
}
