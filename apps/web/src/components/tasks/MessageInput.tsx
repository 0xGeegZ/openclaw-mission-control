"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id, Doc } from "@packages/backend/convex/_generated/dataModel";
import { Textarea } from "@packages/ui/components/textarea";
import { Button } from "@packages/ui/components/button";
import { Send, Loader2, Bot, Users, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@packages/ui/lib/utils";
import { useAccount } from "@/lib/hooks/useAccount";

interface MessageInputProps {
  taskId: Id<"tasks">;
}

type MentionOption = 
  | { type: "all"; label: string; description: string }
  | { type: "agent"; agent: Doc<"agents"> };

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
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { accountId } = useAccount();
  const agents = useQuery(
    api.agents.list,
    accountId ? { accountId } : "skip"
  );
  
  const createMessage = useMutation(api.messages.create);
  
  // Loading state for agents
  const isLoadingAgents = agents === undefined;
  
  // Filter agents based on mention query
  const filteredAgents = useMemo((): MentionOption[] => {
    const query = mentionQuery.toLowerCase();
    
    // Add "all" option at the top
    const allOption: MentionOption = {
      type: "all",
      label: "all",
      description: "Mention all agents"
    };
    
    // If still loading, return just the "all" option if it matches
    if (!agents) {
      if ("all".includes(query)) {
        return [allOption];
      }
      return [];
    }
    
    const agentOptions: MentionOption[] = agents
      .filter(agent => 
        agent.name.toLowerCase().includes(query) ||
        agent.slug.toLowerCase().includes(query) ||
        agent.role.toLowerCase().includes(query)
      )
      .map(agent => ({ type: "agent" as const, agent }));
    
    // Include "all" if query matches
    const options: MentionOption[] = [];
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
  
  const handleMentionSelect = useCallback((option: MentionOption) => {
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
        containerRef.current && 
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowMentionDropdown(false);
      }
    };
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    if (showMentionDropdown && dropdownRef.current) {
      const selectedElement = dropdownRef.current.querySelector(`[data-index="${selectedMentionIndex}"]`);
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedMentionIndex, showMentionDropdown]);
  
  return (
    <div ref={containerRef} className="border-t bg-card/80 backdrop-blur-sm">
      <form onSubmit={handleSubmit} className="p-4">
        <div className="relative">
          {/* Mention Autocomplete Dropdown - positioned above input */}
          {showMentionDropdown && (
            <div 
              ref={dropdownRef}
              className="absolute bottom-full left-0 right-0 mb-2 bg-popover border border-border rounded-xl shadow-xl overflow-hidden z-50 max-w-sm"
            >
              <div className="px-3 py-2.5 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <p className="text-xs font-medium text-foreground">Mention an agent</p>
                </div>
              </div>
              
              {isLoadingAgents ? (
                <div className="px-3 py-6 flex flex-col items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Loading agents...</p>
                </div>
              ) : filteredAgents.length > 0 ? (
                <div className="max-h-64 overflow-y-auto p-1">
                  {filteredAgents.map((option, index) => (
                    <button
                      key={option.type === "all" ? "all" : option.agent._id}
                      type="button"
                      data-index={index}
                      onClick={() => handleMentionSelect(option)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all rounded-lg",
                        index === selectedMentionIndex 
                          ? "bg-primary text-primary-foreground" 
                          : "hover:bg-accent"
                      )}
                    >
                      {option.type === "all" ? (
                        <>
                          <div className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-full shrink-0",
                            index === selectedMentionIndex 
                              ? "bg-primary-foreground/20" 
                              : "bg-primary/10"
                          )}>
                            <Users className={cn(
                              "h-4 w-4",
                              index === selectedMentionIndex ? "text-primary-foreground" : "text-primary"
                            )} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold">@all</p>
                            <p className={cn(
                              "text-xs truncate",
                              index === selectedMentionIndex 
                                ? "text-primary-foreground/70" 
                                : "text-muted-foreground"
                            )}>
                              {option.description}
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-full shrink-0",
                            index === selectedMentionIndex 
                              ? "bg-primary-foreground/20" 
                              : "bg-secondary"
                          )}>
                            <Bot className={cn(
                              "h-4 w-4",
                              index === selectedMentionIndex 
                                ? "text-primary-foreground" 
                                : "text-secondary-foreground"
                            )} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold">@{option.agent.slug}</p>
                            <p className={cn(
                              "text-xs truncate",
                              index === selectedMentionIndex 
                                ? "text-primary-foreground/70" 
                                : "text-muted-foreground"
                            )}>
                              {option.agent.name} - {option.agent.role}
                            </p>
                          </div>
                        </>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-6 text-center">
                  <Bot className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">No agents found</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Try a different search term</p>
                </div>
              )}
              
              <div className="px-3 py-2 border-t border-border bg-muted/30">
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-background rounded border font-mono">Tab</kbd>
                    <span>select</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 bg-background rounded border font-mono">Esc</kbd>
                    <span>close</span>
                  </span>
                </div>
              </div>
            </div>
          )}
          
          {/* Input area */}
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Textarea
                ref={textareaRef}
                value={content}
                onChange={handleContentChange}
                onKeyDown={handleKeyDown}
                placeholder="Write a message... Use @ to mention agents"
                rows={1}
                className={cn(
                  "resize-none min-h-[52px] py-3.5 px-4 rounded-xl border-border/50 bg-background",
                  "focus-visible:ring-1 focus-visible:ring-primary/30 focus-visible:border-primary/50",
                  "placeholder:text-muted-foreground/60 text-sm leading-relaxed"
                )}
              />
            </div>
            <Button 
              type="submit" 
              disabled={!content.trim() || isSubmitting} 
              size="icon"
              className="h-[52px] w-[52px] rounded-xl shrink-0 shadow-sm"
            >
              {isSubmitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
              <span className="sr-only">Send message</span>
            </Button>
          </div>
          
          {/* Keyboard hints */}
          <div className="flex items-center gap-4 mt-2 px-1">
            <p className="text-[11px] text-muted-foreground/70">
              <kbd className="px-1.5 py-0.5 text-[10px] font-medium bg-muted/50 rounded border border-border/50 mr-1">Enter</kbd>
              send
            </p>
            <p className="text-[11px] text-muted-foreground/70">
              <kbd className="px-1.5 py-0.5 text-[10px] font-medium bg-muted/50 rounded border border-border/50 mr-1">Shift+Enter</kbd>
              new line
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}
