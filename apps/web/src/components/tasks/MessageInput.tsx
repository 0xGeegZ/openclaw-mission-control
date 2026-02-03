"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id, Doc } from "@packages/backend/convex/_generated/dataModel";
import { Textarea } from "@packages/ui/components/textarea";
import { Button } from "@packages/ui/components/button";
import { Send, Loader2, Bot, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@packages/ui/lib/utils";
import { useAccount } from "@/lib/hooks/useAccount";

interface MessageInputProps {
  taskId: Id<"tasks">;
}

/**
 * Message input with send button and @ mention autocomplete.
 */
export function MessageInput({ taskId }: MessageInputProps) {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const { accountId } = useAccount();
  const agents = useQuery(
    api.agents.list,
    accountId ? { accountId } : "skip"
  );
  
  const createMessage = useMutation(api.messages.create);
  
  // Filter agents based on mention query
  const filteredAgents = useMemo(() => {
    if (!agents) return [];
    
    const query = mentionQuery.toLowerCase();
    
    // Add "all" option at the top
    const allOption: { type: "all"; label: string; description: string } = {
      type: "all",
      label: "all",
      description: "Mention all agents"
    };
    
    const agentOptions: { type: "agent"; agent: Doc<"agents"> }[] = agents
      .filter(agent => 
        agent.name.toLowerCase().includes(query) ||
        agent.slug.toLowerCase().includes(query) ||
        agent.role.toLowerCase().includes(query)
      )
      .map(agent => ({ type: "agent" as const, agent }));
    
    // Include "all" if query matches
    const options: (typeof allOption | typeof agentOptions[number])[] = [];
    if ("all".includes(query)) {
      options.push(allOption);
    }
    options.push(...agentOptions);
    
    return options;
  }, [agents, mentionQuery]);
  
  // Reset selection when filtered list changes
  useEffect(() => {
    setSelectedMentionIndex(0);
  }, [filteredAgents.length]);
  
  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setContent(value);
    
    // Check for @ mention trigger
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    
    if (atMatch) {
      setShowMentionDropdown(true);
      setMentionQuery(atMatch[1]);
      setMentionStartIndex(cursorPos - atMatch[0].length);
    } else {
      setShowMentionDropdown(false);
      setMentionQuery("");
      setMentionStartIndex(null);
    }
  }, []);
  
  const insertMention = useCallback((mentionText: string) => {
    if (mentionStartIndex === null) return;
    
    const beforeMention = content.slice(0, mentionStartIndex);
    const afterCursor = content.slice(
      mentionStartIndex + mentionQuery.length + 1 // +1 for the @
    );
    
    const newContent = `${beforeMention}@${mentionText} ${afterCursor}`;
    setContent(newContent);
    setShowMentionDropdown(false);
    setMentionQuery("");
    setMentionStartIndex(null);
    
    // Focus back on textarea
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newCursorPos = beforeMention.length + mentionText.length + 2; // +2 for @ and space
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  }, [content, mentionStartIndex, mentionQuery.length]);
  
  const handleMentionSelect = useCallback((option: typeof filteredAgents[number]) => {
    if (option.type === "all") {
      insertMention("all");
    } else {
      insertMention(option.agent.slug);
    }
  }, [insertMention]);
  
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
      setShowMentionDropdown(false);
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
    // Handle mention dropdown navigation
    if (showMentionDropdown && filteredAgents.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedMentionIndex(prev => 
          prev < filteredAgents.length - 1 ? prev + 1 : 0
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedMentionIndex(prev => 
          prev > 0 ? prev - 1 : filteredAgents.length - 1
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        handleMentionSelect(filteredAgents[selectedMentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentionDropdown(false);
        return;
      }
    }
    
    // Submit on Enter (without Shift)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setShowMentionDropdown(false);
      }
    };
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  return (
    <form onSubmit={handleSubmit} className="border-t bg-card p-4">
      <div className="flex gap-3 items-end">
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={handleContentChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (use @ to mention agents)"
            rows={2}
            className={cn(
              "resize-none min-h-[80px] transition-all",
              "focus-visible:ring-primary/50"
            )}
          />
          
          {/* Mention Autocomplete Dropdown */}
          {showMentionDropdown && filteredAgents.length > 0 && (
            <div 
              ref={dropdownRef}
              className="absolute bottom-full left-0 mb-2 w-72 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50"
            >
              <div className="px-3 py-2 border-b border-border bg-muted/50">
                <p className="text-xs font-medium text-muted-foreground">Mention an agent</p>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {filteredAgents.map((option, index) => (
                  <button
                    key={option.type === "all" ? "all" : option.agent._id}
                    type="button"
                    onClick={() => handleMentionSelect(option)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                      index === selectedMentionIndex 
                        ? "bg-accent text-accent-foreground" 
                        : "hover:bg-accent/50"
                    )}
                  >
                    {option.type === "all" ? (
                      <>
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                          <Users className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">@all</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {option.description}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                          <Bot className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">@{option.agent.slug}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {option.agent.name} - {option.agent.role}
                          </p>
                        </div>
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Empty state when no agents match */}
          {showMentionDropdown && filteredAgents.length === 0 && (
            <div 
              ref={dropdownRef}
              className="absolute bottom-full left-0 mb-2 w-72 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50"
            >
              <div className="px-3 py-4 text-center">
                <Bot className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">No agents found</p>
              </div>
            </div>
          )}
          
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
