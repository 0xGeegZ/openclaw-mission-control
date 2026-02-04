"use client";

import { useState } from "react";
import { Doc } from "@packages/backend/convex/_generated/dataModel";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@packages/ui/components/avatar";
import { Badge } from "@packages/ui/components/badge";
import { Textarea } from "@packages/ui/components/textarea";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@clerk/nextjs";
import {
  MoreVertical,
  Trash2,
  User,
  Bot,
  Edit2,
  Check,
  X,
  Loader2,
  Sparkles,
} from "lucide-react";
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
import { Streamdown } from "streamdown";

/** Lookup for agent author display (name, optional avatar). */
export type AgentsByAuthorId = Record<
  string,
  { name: string; avatarUrl?: string }
>;

interface MessageItemProps {
  message: Doc<"messages">;
  /** Map of agent id -> display info; used to show which agent wrote each message */
  agentsByAuthorId?: AgentsByAuthorId;
}

/**
 * Single message item in thread.
 * When authorType is "agent", shows the agent's name (and avatar if provided) so multiple agents are distinguishable.
 */
export function MessageItem({ message, agentsByAuthorId }: MessageItemProps) {
  const { userId } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isUpdating, setIsUpdating] = useState(false);

  const deleteMessage = useMutation(api.messages.remove);
  const updateMessage = useMutation(api.messages.update);

  const isAuthor = message.authorType === "user" && message.authorId === userId;
  const isAgent = message.authorType === "agent";
  const agentAuthor =
    isAgent && agentsByAuthorId
      ? agentsByAuthorId[message.authorId]
      : undefined;
  const authorName =
    message.authorType === "user"
      ? "You"
      : agentAuthor
        ? agentAuthor.name
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
    <div
      className={cn(
        "flex gap-3 group rounded-xl p-4 -mx-2 transition-all",
        isAgent ? "bg-muted/30 border border-border/40" : "hover:bg-muted/30",
      )}
    >
      <Avatar
        className={cn(
          "h-10 w-10 shrink-0 ring-2 ring-background shadow-sm",
          isAgent
            ? "bg-gradient-to-br from-primary/20 to-primary/5"
            : "bg-gradient-to-br from-secondary to-secondary/80",
        )}
      >
        {isAgent && agentAuthor?.avatarUrl ? (
          <>
            <AvatarImage src={agentAuthor.avatarUrl} alt={authorName} />
            <AvatarFallback className="sr-only">{authorName}</AvatarFallback>
          </>
        ) : (
          <AvatarFallback className="bg-transparent">
            {isAgent ? (
              <Bot className="h-5 w-5 text-primary" />
            ) : (
              <User className="h-5 w-5 text-secondary-foreground" />
            )}
          </AvatarFallback>
        )}
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="font-semibold text-sm text-foreground">
            {authorName}
          </span>
          {isAgent && (
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-0 gap-1"
            >
              <Sparkles className="h-2.5 w-2.5" />
              AI
            </Badge>
          )}
          <span className="text-[11px] text-muted-foreground/70">
            {formatDistanceToNow(message.createdAt, { addSuffix: true })}
          </span>
          {message.editedAt && (
            <span className="text-[11px] text-muted-foreground/60">
              (edited)
            </span>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-3">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[80px] resize-none text-sm rounded-lg"
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
                className="h-8"
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
                className="h-8"
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Cancel
              </Button>
              <span className="text-[11px] text-muted-foreground/70 ml-auto">
                <kbd className="px-1 py-0.5 bg-muted rounded border text-[10px]">
                  Cmd+Enter
                </kbd>{" "}
                to save
              </span>
            </div>
          </div>
        ) : (
          <>
            <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 prose-p:leading-relaxed prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-code:text-primary prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-headings:text-foreground prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
              <Streamdown>{message.content}</Streamdown>
            </div>

            {message.mentions && message.mentions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {message.mentions.map((mention, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className="text-xs font-medium bg-primary/5 text-primary border-primary/20 hover:bg-primary/10 transition-colors"
                  >
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
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
            >
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">Message options</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={handleEdit} className="gap-2">
              <Edit2 className="h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleDelete}
              className="text-destructive focus:text-destructive gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
