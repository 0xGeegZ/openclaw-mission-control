"use client";

import { Doc } from "@packages/backend/convex/_generated/dataModel";
import { Avatar, AvatarFallback } from "@packages/ui/components/avatar";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@clerk/nextjs";
import { MoreVertical, Edit, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@packages/ui/components/dropdown-menu";
import { Button } from "@packages/ui/components/button";
import { useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { toast } from "sonner";

interface MessageItemProps {
  message: Doc<"messages">;
}

/**
 * Single message item in thread.
 */
export function MessageItem({ message }: MessageItemProps) {
  const { userId } = useAuth();
  const deleteMessage = useMutation(api.messages.remove);
  
  const isAuthor = message.authorType === "user" && message.authorId === userId;
  const authorName = message.authorType === "user" 
    ? "User" // TODO: Resolve user name
    : "Agent"; // TODO: Resolve agent name
  
  const handleDelete = async () => {
    try {
      await deleteMessage({ messageId: message._id });
      toast.success("Message deleted");
    } catch (error) {
      toast.error("Failed to delete message");
    }
  };
  
  return (
    <div className="flex gap-3 group">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="text-xs">
          {authorName[0].toUpperCase()}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm">{authorName}</span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(message.createdAt, { addSuffix: true })}
          </span>
          {message.editedAt && (
            <span className="text-xs text-muted-foreground">(edited)</span>
          )}
        </div>
        
        <div className="text-sm whitespace-pre-wrap break-words">
          {message.content}
        </div>
        
        {message.mentions && message.mentions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.mentions.map((mention, i) => (
              <span key={i} className="text-xs text-primary">
                @{mention.name}
              </span>
            ))}
          </div>
        )}
      </div>
      
      {isAuthor && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleDelete} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
