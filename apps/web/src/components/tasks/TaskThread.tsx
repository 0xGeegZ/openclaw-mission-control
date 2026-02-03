"use client";

import { useRef, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id } from "@packages/backend/convex/_generated/dataModel";
import { MessageItem } from "./MessageItem";
import { MessageInput } from "./MessageInput";
import { Skeleton } from "@packages/ui/components/skeleton";
import { MessageSquare, Sparkles } from "lucide-react";

interface TaskThreadProps {
  taskId: Id<"tasks">;
  accountSlug: string;
}

/**
 * Task thread component with messages and input.
 */
export function TaskThread({ taskId, accountSlug: _accountSlug }: TaskThreadProps) {
  const messages = useQuery(api.messages.listByTask, { taskId });
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ 
        top: scrollRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [messages?.length]);
  
  return (
    <div className="absolute inset-0 flex flex-col bg-background">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {messages === undefined ? (
            <div className="space-y-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2 pt-1">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-full max-w-md" />
                    <Skeleton className="h-4 w-3/4 max-w-sm" />
                  </div>
                </div>
              ))}
            </div>
          ) : messages.length > 0 ? (
            <div className="space-y-1">
              {messages.map((message) => (
                <MessageItem key={message._id} message={message} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="relative mb-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/10">
                  <MessageSquare className="h-7 w-7 text-primary/60" />
                </div>
                <div className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="h-3 w-3 text-primary" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-foreground">Start the conversation</h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-xs leading-relaxed">
                Send a message or use <span className="font-medium text-foreground">@</span> to mention an agent and get things started.
              </p>
            </div>
          )}
        </div>
      </div>
      
      {/* Input area - sticky at bottom */}
      <div className="shrink-0 w-full">
        <div className="max-w-3xl mx-auto">
          <MessageInput taskId={taskId} />
        </div>
      </div>
    </div>
  );
}
