"use client";

import { useRef, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id } from "@packages/backend/convex/_generated/dataModel";
import { MessageItem } from "./MessageItem";
import { MessageInput } from "./MessageInput";

interface TaskThreadProps {
  taskId: Id<"tasks">;
  accountSlug: string;
}

/**
 * Task thread component with messages and input.
 */
export function TaskThread({ taskId, accountSlug }: TaskThreadProps) {
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
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages && messages.length > 0 ? (
          messages.map((message) => (
            <MessageItem key={message._id} message={message} />
          ))
        ) : (
          <div className="text-center text-muted-foreground py-8">
            No messages yet. Start the conversation!
          </div>
        )}
      </div>
      <MessageInput taskId={taskId} />
    </div>
  );
}
