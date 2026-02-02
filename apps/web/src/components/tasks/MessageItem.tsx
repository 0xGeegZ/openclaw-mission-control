"use client";

import { useState } from "react";
import { Doc } from "@packages/backend/convex/_generated/dataModel";
import { Avatar, AvatarFallback } from "@packages/ui/components/avatar";
import { Badge } from "@packages/ui/components/badge";
import { Textarea } from "@packages/ui/components/textarea";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@clerk/nextjs";
import { MoreVertical, Trash2, User, Bot, Edit2, Check, X, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isUpdating, setIsUpdating] = useState(false);
  
  const deleteMessage = useMutation(api.messages.remove);
  const updateMessage = useMutation(api.messages.update);
  
  const isAuthor = message.authorType === "user" && message.authorId === userId;
  const isAgent = message.authorType === "agent";
  const authorName = message.authorType === "user" 
    ? "User"
    : "Agent";
  
  const handleDelete = async () => {
    try {
      await deleteMessage({ messageId: message._id });
      toast.success("Message deleted");
    } catch {
      toast.error("Failed to delete message");
    }
  };
  
  const handleEdit = () => {
    setEditContent(message.content);
    setIsEditing(true);
  };
  
  const handleCancelEdit = () => {
    setEditContent(message.content);
    setIsEditing(false);
  };
  
  const handleSaveEdit = async () => {
    if (!editContent.trim() || editContent.trim() === message.content) {
      handleCancelEdit();
      return;
    }
    
    setIsUpdating(true);
    try {
      await updateMessage({
        messageId: message._id,
        content: editContent.trim(),
      });
      toast.success("Message updated");
      setIsEditing(false);
    } catch {
      toast.error("Failed to update message");
    } finally {
      setIsUpdating(false);
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
        
        {isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[80px] resize-none text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Escape") handleCancelEdit();
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSaveEdit();
                }
              }}
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleSaveEdit}
                disabled={isUpdating || !editContent.trim()}
              >
                {isUpdating ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                )}
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancelEdit}
                disabled={isUpdating}
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Cancel
              </Button>
              <span className="text-xs text-muted-foreground ml-auto">
                Press Cmd+Enter to save
              </span>
            </div>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
      
      {isAuthor && !isEditing && (
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
            <DropdownMenuItem onClick={handleEdit}>
              <Edit2 className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
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
