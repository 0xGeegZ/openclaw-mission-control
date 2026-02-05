"use client";

import { use, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id } from "@packages/backend/convex/_generated/dataModel";
import { useAccount } from "@/lib/hooks/useAccount";
import { SKILL_CATEGORY_LABELS } from "@packages/shared/src/constants";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/card";
import { Button } from "@packages/ui/components/button";
import { Input } from "@packages/ui/components/input";
import { Label } from "@packages/ui/components/label";
import { Badge } from "@packages/ui/components/badge";
import { Skeleton } from "@packages/ui/components/skeleton";
import { Textarea } from "@packages/ui/components/textarea";
import { Checkbox } from "@packages/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@packages/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@packages/ui/components/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@packages/ui/components/dropdown-menu";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@packages/ui/components/tabs";
import {
  Zap,
  Plus,
  Shield,
  MoreHorizontal,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  Search,
  Server,
  Wrench,
  Plug,
  Code,
  AlertTriangle,
  Loader2,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@packages/ui/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SkillCategory = "mcp_server" | "tool" | "integration" | "custom";

interface SkillFormData {
  name: string;
  slug: string;
  category: SkillCategory;
  description: string;
  icon: string;
  contentMarkdown: string;
  serverUrl: string;
  authType: "none" | "api_key" | "oauth";
  credentialRef: string;
  rateLimit: string;
  requiresApproval: boolean;
  isEnabled: boolean;
}

const EMPTY_FORM: SkillFormData = {
  name: "",
  slug: "",
  category: "custom",
  description: "",
  icon: "",
  contentMarkdown: "",
  serverUrl: "",
  authType: "none",
  credentialRef: "",
  rateLimit: "",
  requiresApproval: false,
  isEnabled: true,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_ICONS: Record<SkillCategory, typeof Zap> = {
  mcp_server: Server,
  tool: Wrench,
  integration: Plug,
  custom: Code,
};

const CATEGORY_COLORS: Record<SkillCategory, string> = {
  mcp_server: "text-blue-500",
  tool: "text-emerald-500",
  integration: "text-violet-500",
  custom: "text-amber-500",
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface SkillsPageProps {
  params: Promise<{ accountSlug: string }>;
}

export default function SkillsPage({ params }: SkillsPageProps) {
  use(params);
  const { accountId, isLoading, isAdmin } = useAccount();

  // Queries & Mutations
  const skills = useQuery(
    api.skills.list,
    accountId ? { accountId } : "skip",
  );
  const createSkill = useMutation(api.skills.create);
  const updateSkill = useMutation(api.skills.update);
  const removeSkill = useMutation(api.skills.remove);
  const toggleEnabled = useMutation(api.skills.toggleEnabled);

  // UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<
    SkillCategory | "all"
  >("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Id<"skills"> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: Id<"skills">;
    name: string;
  } | null>(null);
  const [form, setForm] = useState<SkillFormData>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ---------------------------------------------------------------------------
  // Filtered list
  // ---------------------------------------------------------------------------

  const filteredSkills = (skills ?? []).filter((s) => {
    if (
      filterCategory !== "all" &&
      s.category !== filterCategory
    )
      return false;
    if (
      searchQuery &&
      !s.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !s.slug.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !(s.description ?? "").toLowerCase().includes(searchQuery.toLowerCase())
    )
      return false;
    return true;
  });

  // Category counts for tabs
  const counts = {
    all: (skills ?? []).length,
    mcp_server: (skills ?? []).filter((s) => s.category === "mcp_server").length,
    tool: (skills ?? []).filter((s) => s.category === "tool").length,
    integration: (skills ?? []).filter((s) => s.category === "integration").length,
    custom: (skills ?? []).filter((s) => s.category === "custom").length,
  };

  // ---------------------------------------------------------------------------
  // Form helpers
  // ---------------------------------------------------------------------------

  function resetForm() {
    setForm(EMPTY_FORM);
  }

  function openCreate() {
    resetForm();
    setEditingSkill(null);
    setCreateOpen(true);
  }

  function openEdit(skillId: Id<"skills">) {
    const skill = (skills ?? []).find((s) => s._id === skillId);
    if (!skill) return;
    setForm({
      name: skill.name,
      slug: skill.slug,
      category: skill.category as SkillCategory,
      description: skill.description ?? "",
      icon: skill.icon ?? "",
      contentMarkdown: skill.contentMarkdown ?? "",
      serverUrl: skill.config.serverUrl ?? "",
      authType: (skill.config.authType ?? "none") as "none" | "api_key" | "oauth",
      credentialRef: skill.config.credentialRef ?? "",
      rateLimit: skill.config.rateLimit != null ? String(skill.config.rateLimit) : "",
      requiresApproval: skill.config.requiresApproval ?? false,
      isEnabled: skill.isEnabled,
    });
    setEditingSkill(skillId);
    setCreateOpen(true);
  }

  async function handleSave() {
    if (!accountId || !form.name.trim() || !form.slug.trim()) return;
    setIsSaving(true);
    try {
      const config = {
        serverUrl: form.serverUrl || undefined,
        authType: form.authType !== "none" ? form.authType : undefined,
        credentialRef: form.credentialRef || undefined,
        rateLimit: form.rateLimit ? Number(form.rateLimit) : undefined,
        requiresApproval: form.requiresApproval || undefined,
      };

      if (editingSkill) {
        await updateSkill({
          skillId: editingSkill,
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          icon: form.icon.trim() || undefined,
          contentMarkdown: form.contentMarkdown.trim() || undefined,
          config,
          isEnabled: form.isEnabled,
        });
        toast.success("Skill updated");
      } else {
        await createSkill({
          accountId,
          name: form.name.trim(),
          slug: form.slug.trim(),
          category: form.category,
          description: form.description.trim() || undefined,
          icon: form.icon.trim() || undefined,
          contentMarkdown: form.contentMarkdown.trim() || undefined,
          config,
          isEnabled: form.isEnabled,
        });
        toast.success("Skill created");
      }
      setCreateOpen(false);
      resetForm();
      setEditingSkill(null);
    } catch (e) {
      toast.error(editingSkill ? "Failed to update skill" : "Failed to create skill", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await removeSkill({ skillId: deleteTarget.id });
      toast.success("Skill deleted", {
        description: `"${deleteTarget.name}" has been removed and unlinked from all agents.`,
      });
      setDeleteTarget(null);
    } catch (e) {
      toast.error("Failed to delete skill", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleToggle(skillId: Id<"skills">, currentEnabled: boolean) {
    try {
      await toggleEnabled({ skillId });
      toast.success(currentEnabled ? "Skill disabled" : "Skill enabled");
    } catch (e) {
      toast.error("Failed to toggle skill", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Guards
  // ---------------------------------------------------------------------------

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-destructive/10 mb-5">
          <Shield className="h-10 w-10 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">Access Denied</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md text-center">
          You need admin or owner permissions to manage skills.
        </p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-5 border-b border-border/50 bg-card/50 backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Skills
            </h1>
            <Badge variant="secondary" className="rounded-full">
              <Shield className="h-3 w-3 mr-1" />
              Admin
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage reusable skills and tools that can be assigned to agents
          </p>
        </div>
        <Button className="rounded-xl shadow-sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Create Skill
        </Button>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 rounded-xl"
            />
          </div>
        </div>

        {/* Category Tabs */}
        <Tabs
          value={filterCategory}
          onValueChange={(v) => setFilterCategory(v as SkillCategory | "all")}
        >
          <TabsList className="bg-muted/50">
            <TabsTrigger value="all" className="rounded-lg">
              All
              {counts.all > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
                  {counts.all}
                </Badge>
              )}
            </TabsTrigger>
            {(
              Object.keys(SKILL_CATEGORY_LABELS) as SkillCategory[]
            ).map((cat) => {
              const Icon = CATEGORY_ICONS[cat];
              return (
                <TabsTrigger key={cat} value={cat} className="rounded-lg">
                  <Icon className={cn("h-3.5 w-3.5 mr-1.5", CATEGORY_COLORS[cat])} />
                  {SKILL_CATEGORY_LABELS[cat]}
                  {counts[cat] > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-1.5 h-5 px-1.5 text-[10px]"
                    >
                      {counts[cat]}
                    </Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* We use a single content panel since the filtering is JS-driven */}
          <TabsContent value={filterCategory} className="mt-6">
            {isLoading || skills === undefined ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="border-border/50">
                    <CardHeader>
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-4 w-48" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-2/3" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredSkills.length === 0 ? (
              <EmptyState
                icon={Zap}
                title={
                  searchQuery || filterCategory !== "all"
                    ? "No matching skills"
                    : "No skills yet"
                }
                description={
                  searchQuery || filterCategory !== "all"
                    ? "Try adjusting your search or filter."
                    : "Create your first skill to give agents new capabilities."
                }
                variant="card"
                action={
                  !searchQuery && filterCategory === "all"
                    ? { label: "Create Skill", onClick: openCreate, icon: Plus }
                    : undefined
                }
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredSkills.map((skill) => {
                  const CatIcon =
                    CATEGORY_ICONS[skill.category as SkillCategory] ?? Code;
                  const catColor =
                    CATEGORY_COLORS[skill.category as SkillCategory] ??
                    "text-muted-foreground";

                  return (
                    <Card
                      key={skill._id}
                      className={cn(
                        "border-border/50 shadow-sm transition-colors hover:border-border",
                        !skill.isEnabled && "opacity-60",
                      )}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={cn(
                                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted",
                              )}
                            >
                              <CatIcon
                                className={cn("h-4.5 w-4.5", catColor)}
                              />
                            </div>
                            <div className="min-w-0">
                              <CardTitle className="text-base truncate">
                                {skill.name}
                              </CardTitle>
                              <code className="text-xs text-muted-foreground">
                                {skill.slug}
                              </code>
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 rounded-lg"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="rounded-xl"
                            >
                              <DropdownMenuItem
                                className="rounded-lg"
                                onClick={() => openEdit(skill._id)}
                              >
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="rounded-lg"
                                onClick={() =>
                                  handleToggle(skill._id, skill.isEnabled)
                                }
                              >
                                {skill.isEnabled ? (
                                  <>
                                    <PowerOff className="h-4 w-4 mr-2" />
                                    Disable
                                  </>
                                ) : (
                                  <>
                                    <Power className="h-4 w-4 mr-2" />
                                    Enable
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="rounded-lg text-destructive focus:text-destructive"
                                onClick={() =>
                                  setDeleteTarget({
                                    id: skill._id,
                                    name: skill.name,
                                  })
                                }
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {skill.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {skill.description}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className="rounded-full text-xs gap-1"
                          >
                            <CatIcon className={cn("h-3 w-3", catColor)} />
                            {
                              SKILL_CATEGORY_LABELS[
                                skill.category as SkillCategory
                              ]
                            }
                          </Badge>
                          <Badge
                            variant={skill.isEnabled ? "default" : "secondary"}
                            className="rounded-full text-xs"
                          >
                            {skill.isEnabled ? "Enabled" : "Disabled"}
                          </Badge>
                          {skill.config.requiresApproval && (
                            <Badge
                              variant="outline"
                              className="rounded-full text-xs text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700"
                            >
                              Approval required
                            </Badge>
                          )}
                          {skill.contentMarkdown && (
                            <Badge
                              variant="outline"
                              className="rounded-full text-xs gap-1"
                            >
                              <FileText className="h-3 w-3" />
                              SKILL.md
                            </Badge>
                          )}
                        </div>
                        {skill.config.serverUrl && (
                          <p className="text-xs text-muted-foreground truncate">
                            <span className="font-medium">Server:</span>{" "}
                            {skill.config.serverUrl}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setEditingSkill(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSkill ? "Edit Skill" : "Create Skill"}
            </DialogTitle>
            <DialogDescription>
              {editingSkill
                ? "Update the skill configuration."
                : "Define a new skill that can be assigned to agents."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-4">
            {/* Name & Slug */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="skill-name">Name</Label>
                <Input
                  id="skill-name"
                  placeholder="e.g. Web Search"
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((f) => ({
                      ...f,
                      name,
                      ...(editingSkill ? {} : { slug: slugify(name) }),
                    }));
                  }}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="skill-slug">Slug</Label>
                <Input
                  id="skill-slug"
                  placeholder="web-search"
                  value={form.slug}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, slug: e.target.value }))
                  }
                  className="rounded-xl"
                  disabled={!!editingSkill}
                />
                {editingSkill && (
                  <p className="text-xs text-muted-foreground">
                    Slug cannot be changed after creation.
                  </p>
                )}
              </div>
            </div>

            {/* Category & Icon */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, category: v as SkillCategory }))
                  }
                  disabled={!!editingSkill}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.entries(SKILL_CATEGORY_LABELS) as [
                        SkillCategory,
                        string,
                      ][]
                    ).map(([value, label]) => {
                      const Icon = CATEGORY_ICONS[value];
                      return (
                        <SelectItem key={value} value={value}>
                          <div className="flex items-center gap-2">
                            <Icon
                              className={cn(
                                "h-4 w-4",
                                CATEGORY_COLORS[value],
                              )}
                            />
                            {label}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {editingSkill && (
                  <p className="text-xs text-muted-foreground">
                    Category cannot be changed after creation.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="skill-icon">Icon (optional)</Label>
                <Input
                  id="skill-icon"
                  placeholder="e.g. search, wrench"
                  value={form.icon}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, icon: e.target.value }))
                  }
                  className="rounded-xl"
                />
                <p className="text-xs text-muted-foreground">
                  Lucide icon name for display
                </p>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="skill-desc">Description</Label>
              <Textarea
                id="skill-desc"
                placeholder="Describe what this skill does..."
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                className="rounded-xl min-h-[80px]"
              />
            </div>

            {/* Config: MCP / Tool specifics */}
            {(form.category === "mcp_server" ||
              form.category === "integration") && (
              <Card className="border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">
                    Connection Configuration
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Settings for connecting to external services.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="server-url">Server URL</Label>
                    <Input
                      id="server-url"
                      placeholder="https://..."
                      value={form.serverUrl}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          serverUrl: e.target.value,
                        }))
                      }
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Auth Type</Label>
                    <Select
                      value={form.authType}
                      onValueChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          authType: v as "none" | "api_key" | "oauth",
                        }))
                      }
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="api_key">API Key</SelectItem>
                        <SelectItem value="oauth">OAuth</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.authType !== "none" && (
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="cred-ref">
                        Credential Reference
                      </Label>
                      <Input
                        id="cred-ref"
                        placeholder="ENV_VAR_NAME or secret reference"
                        value={form.credentialRef}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            credentialRef: e.target.value,
                          }))
                        }
                        className="rounded-xl"
                      />
                      <p className="text-xs text-muted-foreground">
                        Reference to the credential stored in environment
                        variables.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Content Markdown (for custom skills) */}
            <div className="space-y-2">
              <Label htmlFor="skill-content">
                SKILL.md Content (optional)
              </Label>
              <Textarea
                id="skill-content"
                placeholder="# Skill Instructions&#10;&#10;Markdown content that gets materialized as SKILL.md in the agent directory..."
                value={form.contentMarkdown}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    contentMarkdown: e.target.value,
                  }))
                }
                className="rounded-xl min-h-[120px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Markdown that gets written to{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-xs">
                  {"agentDir/skills/<slug>/SKILL.md"}
                </code>
                . Max 512 KB.
              </p>
            </div>

            {/* Rate limit & Approval */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="skill-rate">
                  Rate Limit (req/min, optional)
                </Label>
                <Input
                  id="skill-rate"
                  type="number"
                  min="0"
                  placeholder="e.g. 60"
                  value={form.rateLimit}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, rateLimit: e.target.value }))
                  }
                  className="rounded-xl"
                />
              </div>
              <div className="flex flex-col justify-end gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="skill-approval"
                    checked={form.requiresApproval}
                    onCheckedChange={(checked) =>
                      setForm((f) => ({
                        ...f,
                        requiresApproval: checked === true,
                      }))
                    }
                  />
                  <Label
                    htmlFor="skill-approval"
                    className="text-sm font-normal cursor-pointer"
                  >
                    Requires approval before use
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="skill-enabled"
                    checked={form.isEnabled}
                    onCheckedChange={(checked) =>
                      setForm((f) => ({
                        ...f,
                        isEnabled: checked === true,
                      }))
                    }
                  />
                  <Label
                    htmlFor="skill-enabled"
                    className="text-sm font-normal cursor-pointer"
                  >
                    Enabled
                  </Label>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateOpen(false);
                setEditingSkill(null);
                resetForm();
              }}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !form.name.trim() || !form.slug.trim()}
              className="rounded-xl"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {isSaving
                ? "Saving..."
                : editingSkill
                  ? "Update Skill"
                  : "Create Skill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <AlertDialogTitle className="text-lg">
                  Delete Skill
                </AlertDialogTitle>
                <AlertDialogDescription className="mt-1">
                  This action cannot be undone.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <div className="py-4 px-1">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">
                {deleteTarget?.name}
              </span>
              ? This will also remove it from all agents currently using it.
            </p>
          </div>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={isDeleting} className="rounded-lg">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-white hover:bg-destructive/90 rounded-lg gap-2"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {isDeleting ? "Deleting..." : "Delete Skill"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
