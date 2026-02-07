"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useAccount } from "@/lib/hooks/useAccount";
import { Id } from "@packages/backend/convex/_generated/dataModel";
import { AgentTemplateGallery } from "./AgentTemplateGallery";
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
import { toast } from "sonner";
import { Loader2, Bot, Sparkles, AtSign, Briefcase, ArrowLeft, Check } from "lucide-react";

interface CreateAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type CreationStep = "template-select" | "customize";

/**
 * Dialog for creating a new agent from a template.
 * Two-step flow: 1) Select template, 2) Customize agent details
 */
export function CreateAgentDialog({ open, onOpenChange }: CreateAgentDialogProps) {
  const { accountId } = useAccount();
  const [step, setStep] = useState<CreationStep>("template-select");
  const [selectedTemplateId, setSelectedTemplateId] = useState<Id<"agentTemplates"> | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const createAgentFromTemplate = useMutation(api.agentTemplates.createAgentFromTemplate);
  const getTemplate = useQuery(
    selectedTemplateId ? api.agentTemplates.get : "skip",
    selectedTemplateId ? { templateId: selectedTemplateId } : "skip"
  );

  // Auto-generate slug from name
  useEffect(() => {
    if (name) {
      setSlug(name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""));
    }
  }, [name]);

  // Load template details when selected
  useEffect(() => {
    if (getTemplate) {
      setSelectedTemplate(getTemplate);
    }
  }, [getTemplate]);

  const handleTemplateSelect = (templateId: Id<"agentTemplates">) => {
    setSelectedTemplateId(templateId);
    // Pre-populate name from template
    const template = []; // Will be loaded via query
    setStep("customize");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId || !selectedTemplateId || !name.trim() || !slug.trim()) return;
    
    setIsSubmitting(true);
    try {
      await createAgentFromTemplate({
        accountId,
        templateId: selectedTemplateId,
        agentName: name.trim(),
        agentSlug: slug.trim(),
      });
      
      toast.success("Agent created successfully from template");
      resetForm();
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to create agent", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setStep("template-select");
    setSelectedTemplateId(null);
    setSelectedTemplate(null);
    setName("");
    setSlug("");
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  const goBack = () => {
    setStep("template-select");
    setSelectedTemplateId(null);
    setSelectedTemplate(null);
    setName("");
    setSlug("");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl">
        {step === "template-select" ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-violet-500/10">
                  <Bot className="h-5 w-5 text-violet-500" />
                </div>
                <div>
                  <DialogTitle className="text-lg">Create Agent</DialogTitle>
                  <DialogDescription className="text-sm mt-0.5">
                    Choose a template to quickly set up your AI agent
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="py-4">
              {accountId ? (
                <AgentTemplateGallery 
                  accountId={accountId}
                  onSelectTemplate={handleTemplateSelect}
                />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Loading...
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <button
                  type="button"
                  onClick={goBack}
                  className="flex items-center justify-center h-10 w-10 rounded-lg hover:bg-muted transition-colors"
                  title="Back to templates"
                >
                  <ArrowLeft className="h-5 w-5 text-muted-foreground" />
                </button>
                <div>
                  <DialogTitle className="text-lg">Customize Agent</DialogTitle>
                  <DialogDescription className="text-sm mt-0.5">
                    {selectedTemplate?.name && `Based on ${selectedTemplate.name} template`}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">Agent Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`e.g., ${selectedTemplate?.name || "My Agent"}`}
                  required
                  autoFocus
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug" className="text-sm font-medium flex items-center gap-2">
                  <AtSign className="h-3.5 w-3.5 text-muted-foreground" />
                  Mention Handle
                  <span className="text-muted-foreground/60 font-normal text-xs">(auto-generated)</span>
                </Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s/g, "-"))}
                  placeholder="agent-slug"
                  required
                  className="font-mono text-sm h-11"
                />
                <p className="text-[11px] text-muted-foreground/60">
                  Mention this agent in messages with <code className="px-1 py-0.5 rounded bg-muted text-[10px]">@{slug || "agent-slug"}</code>
                </p>
              </div>

              {selectedTemplate && (
                <div className="rounded-lg border border-muted bg-muted/20 p-4 mt-6">
                  <h4 className="text-sm font-semibold mb-3">Template Details</h4>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Template:</dt>
                      <dd className="font-medium">{selectedTemplate.name}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Role:</dt>
                      <dd className="font-medium">{selectedTemplate.config?.role}</dd>
                    </div>
                    {selectedTemplate.defaultSkillSlugs?.length > 0 && (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Skills:</dt>
                        <dd className="font-medium">{selectedTemplate.defaultSkillSlugs.length} included</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              <DialogFooter className="gap-2 sm:gap-2 pt-4">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={goBack}
                  className="text-muted-foreground"
                >
                  Back
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSubmitting || !name.trim() || !slug.trim()}
                  className="min-w-[130px]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Create Agent
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
