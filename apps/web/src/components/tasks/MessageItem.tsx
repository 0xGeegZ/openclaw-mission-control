"use client";

import { Doc } from "@packages/backend/convex/_generated/dataModel";
import { Avatar, AvatarFallback } from "@packages/ui/components/avatar";
import { Badge } from "@packages/ui/components/badge";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@clerk/nextjs";
import { MoreVertical, Trash2, User, Bot } from "lucide-react";
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
import { cn } from "@packages/ui/lib/utils";

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
  const isAgent = message.authorType === "agent";
  const authorName = message.authorType === "user" 
    ? "User"
    : "Agent";
  
  const handleDelete = async () => {
    try {
      await deleteMessage({ messageId: message._id });
      toast.success("Message deleted");
    } catch (error) {
      toast.error("Failed to delete message");
    }
  };
  
  return (
    <div className={cn(
      "flex gap-3 group rounded-lg p-3 -mx-3 transition-colors",
      "hover:bg-muted/50"
    )}>
      <Avatar className={cn(
        "h-9 w-9 shrink-0 border shadow-sm",
        isAgent ? "bg-secondary" : "bg-primary/10"
      )}>
        <AvatarFallback className={cn(
          "text-xs font-medium",
          isAgent ? "text-secondary-foreground" : "text-primary"
        )}>
          {isAgent ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm">{authorName}</span>
          {isAgent && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              AI
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(message.createdAt, { addSuffix: true })}
          </span>
          {message.editedAt && (
            <span className="text-xs text-muted-foreground italic">(edited)</span>
          )}
        </div>
        
        <div className="text-sm whitespace-pre-wrap break-words leading-relaxed text-foreground/90">
          {message.content}
        </div>
        
        {message.mentions && message.mentions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.mentions.map((mention, i) => (
              <Badge key={i} variant="outline" className="text-xs font-normal">
                @{mention.name}
              </Badge>
            ))}
          </div>
        )}
      </div>
      
      {isAuthor && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">Message options</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
