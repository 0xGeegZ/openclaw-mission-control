"use client";

import { use, useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { useAccount } from "@/lib/hooks/useAccount";
import { Card, CardContent } from "@packages/ui/components/card";
import { Button } from "@packages/ui/components/button";
import { Input } from "@packages/ui/components/input";
import { Skeleton } from "@packages/ui/components/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@packages/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@packages/ui/components/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/select";
import { Textarea } from "@packages/ui/components/textarea";
import {
  FileText,
  FilePlus,
  Search,
  Grid3X3,
  List,
  FileIcon,
  FolderIcon,
  MoreHorizontal,
  Upload,
  ChevronRight,
  Trash2,
  ArrowLeft,
  Copy,
  Link2,
  Save,
  Eye,
  Edit3,
} from "lucide-react";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface DocsPageProps {
  params: Promise<{ accountSlug: string }>;
}

type DocItem = {
  _id: Id<"documents">;
  name: string;
  type: "file" | "folder";
  updatedAt: number;
  kind?: "file" | "folder";
};

/**
 * Documents page for workspace files and folders.
 * Supports folder navigation, create file/folder, search, and delete.
 */
export default function DocsPage({ params }: DocsPageProps) {
  use(params);
  const { accountId } = useAccount();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState<
    Id<"documents"> | undefined
  >(undefined);
  const [openDocId, setOpenDocId] = useState<Id<"documents"> | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [linkToTaskDocId, setLinkToTaskDocId] =
    useState<Id<"documents"> | null>(null);
  const [linkTaskId, setLinkTaskId] = useState<Id<"tasks"> | "__unlink__">(
    "__unlink__",
  );
  const [isEditMode, setIsEditMode] = useState(false);

  const documents = useQuery(
    api.documents.list,
    accountId ? { accountId, folderId: currentFolderId } : "skip",
  );
  const searchResults = useQuery(
    api.documents.search,
    accountId && searchQuery.trim().length >= 2
      ? { accountId, query: searchQuery.trim(), limit: 50 }
      : "skip",
  );
  const currentFolder = useQuery(
    api.documents.get,
    currentFolderId ? { documentId: currentFolderId } : "skip",
  );
  const openDoc = useQuery(
    api.documents.get,
    openDocId ? { documentId: openDocId } : "skip",
  );

  const createDoc = useMutation(api.documents.create);
  const removeDoc = useMutation(api.documents.remove);
  const updateDoc = useMutation(api.documents.update);
  const duplicateDoc = useMutation(api.documents.duplicate);
  const linkToTask = useMutation(api.documents.linkToTask);
  const tasks = useQuery(
    api.tasks.list,
    accountId ? { accountId, limit: 200 } : "skip",
  );

  const isSearching = searchQuery.trim().length >= 2;
  const displayItems: DocItem[] =
    isSearching && searchResults
      ? searchResults.map((d) => ({
          _id: d._id,
          name: d.name ?? d.title ?? "Untitled",
          type: (d.kind ?? "file") as "file" | "folder",
          updatedAt: d.updatedAt,
        }))
      : (documents ?? []).map((d) => ({
          _id: d._id,
          name: d.name,
          type: d.type as "file" | "folder",
          updatedAt: d.updatedAt,
        }));

  const hasItems = displayItems.length > 0;

  const handleCreateFile = async () => {
    if (!accountId) return;
    try {
      await createDoc({
        accountId,
        kind: "file",
        parentId: currentFolderId,
        title: "Untitled",
        content: "",
        type: "note",
      });
      toast.success("Document created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create document");
    }
  };

  const handleCreateFolder = async () => {
    if (!accountId) return;
    try {
      await createDoc({
        accountId,
        kind: "folder",
        parentId: currentFolderId,
        name: "New Folder",
      });
      toast.success("Folder created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create folder");
    }
  };

  const handleDelete = async (documentId: Id<"documents">) => {
    try {
      await removeDoc({ documentId });
      toast.success("Deleted");
      if (openDocId === documentId) setOpenDocId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const handleRowClick = (item: DocItem) => {
    if (item.type === "folder") {
      setCurrentFolderId(item._id);
    } else {
      setOpenDocId(item._id);
    }
  };

  useEffect(() => {
    if (!openDoc) return;
    const resolvedKind = openDoc.kind ?? "file";
    const title = openDoc.title ?? openDoc.name ?? "";
    const content = resolvedKind === "file" ? (openDoc.content ?? "") : "";
    const t = setTimeout(() => {
      setEditTitle(title);
      setEditContent(content);
      // Start in view mode if there's content, edit mode if empty
      setIsEditMode(resolvedKind === "file" && !content.trim());
    }, 0);
    return () => clearTimeout(t);
  }, [openDoc]);

  const handleSaveDoc = async () => {
    if (!openDocId || !openDoc) return;
    try {
      await updateDoc({
        documentId: openDocId,
        title: editTitle || undefined,
        content: openDoc.kind === "file" ? editContent : undefined,
      });
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  };

  const handleDuplicate = async (documentId: Id<"documents">) => {
    try {
      await duplicateDoc({ documentId });
      toast.success("Document duplicated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to duplicate");
    }
  };

  const handleLinkToTask = async () => {
    if (!linkToTaskDocId) return;
    try {
      await linkToTask({
        documentId: linkToTaskDocId,
        taskId: linkTaskId === "__unlink__" ? undefined : linkTaskId,
      });
      toast.success(
        linkTaskId === "__unlink__" ? "Unlinked from task" : "Linked to task",
      );
      setLinkToTaskDocId(null);
      setLinkTaskId("__unlink__");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to link");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-4 border-b bg-card">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground">
            Shared files and documents for your workspace
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <FilePlus className="mr-2 h-4 w-4" />
                New
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleCreateFile}>
                <FileIcon className="mr-2 h-4 w-4" />
                New Document
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCreateFolder}>
                <FolderIcon className="mr-2 h-4 w-4" />
                New Folder
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <Upload className="mr-2 h-4 w-4" />
                Upload File
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Breadcrumb when inside a folder */}
      {currentFolderId && (
        <div className="flex items-center gap-2 px-6 py-2 border-b text-sm text-muted-foreground">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1"
            onClick={() => setCurrentFolderId(undefined)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <ChevronRight className="h-4 w-4" />
          <span className="font-medium text-foreground">
            {currentFolder?.name ?? currentFolder?.title ?? "Folder"}
          </span>
        </div>
      )}

      {/* Search and view toggle */}
      <div className="flex items-center justify-between gap-4 px-6 py-3 border-b">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1 border rounded-lg p-1">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode("grid")}
          >
            <Grid3X3 className="h-4 w-4" />
            <span className="sr-only">Grid view</span>
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
            <span className="sr-only">List view</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {documents === undefined && !isSearching ? (
          viewMode === "grid" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Card key={i} className="p-4">
                  <div className="flex flex-col items-center text-center">
                    <Skeleton className="h-16 w-16 rounded-lg mb-3" />
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0 divide-y">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-4">
                    <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-8 w-8 rounded" />
                  </div>
                ))}
              </CardContent>
            </Card>
          )
        ) : !hasItems ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-muted mb-6">
              <FileText className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold">No documents yet</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">
              {isSearching
                ? "No documents match your search."
                : "Create your first document or folder to get started."}
            </p>
            {!isSearching && (
              <div className="flex items-center gap-3 mt-6">
                <Button onClick={handleCreateFile}>
                  <FilePlus className="mr-2 h-4 w-4" />
                  Create Document
                </Button>
                <Button variant="outline" onClick={handleCreateFolder}>
                  <FolderIcon className="mr-2 h-4 w-4" />
                  New Folder
                </Button>
              </div>
            )}
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {displayItems.map((doc) => (
              <Card
                key={doc._id}
                className="p-4 cursor-pointer hover:bg-muted/50 transition-colors flex flex-col"
              >
                <div
                  className="flex flex-col items-center text-center flex-1"
                  onClick={() => {
                    handleRowClick(doc);
                    if (doc.type === "file") setOpenDocId(doc._id);
                  }}
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted mb-3">
                    {doc.type === "folder" ? (
                      <FolderIcon className="h-8 w-8 text-muted-foreground" />
                    ) : (
                      <FileIcon className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <p className="font-medium text-sm truncate w-full">
                    {doc.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(doc.updatedAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
                <div
                  className="mt-2 flex justify-end"
                  onClick={(e) => e.stopPropagation()}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {doc.type === "file" && (
                        <DropdownMenuItem
                          onClick={() => handleDuplicate(doc._id)}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicate
                        </DropdownMenuItem>
                      )}
                      {doc.type === "file" && (
                        <DropdownMenuItem
                          onClick={() => setLinkToTaskDocId(doc._id)}
                        >
                          <Link2 className="mr-2 h-4 w-4" />
                          Link to task
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => handleDelete(doc._id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {displayItems.map((doc) => (
                <div
                  key={doc._id}
                  className="flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/50 transition-colors group"
                  onClick={() => handleRowClick(doc)}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
                    {doc.type === "folder" ? (
                      <FolderIcon className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <FileIcon className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(doc.updatedAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      asChild
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {doc.type === "file" && (
                        <DropdownMenuItem
                          onClick={() => handleDuplicate(doc._id)}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicate
                        </DropdownMenuItem>
                      )}
                      {doc.type === "file" && (
                        <DropdownMenuItem
                          onClick={() => setLinkToTaskDocId(doc._id)}
                        >
                          <Link2 className="mr-2 h-4 w-4" />
                          Link to task
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => handleDelete(doc._id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* View/edit document dialog */}
      <Dialog
        open={!!openDocId}
        onOpenChange={(open) => !open && setOpenDocId(null)}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0">
          {openDoc?.kind === "folder" ? (
            <div className="p-6">
              <DialogHeader>
                <DialogTitle>Folder</DialogTitle>
              </DialogHeader>
              <p className="text-muted-foreground mt-2">This is a folder.</p>
            </div>
          ) : (
            <>
              {/* Header with title and mode toggle */}
              <div className="flex items-center justify-between gap-4 p-4 border-b bg-muted/30">
                <DialogHeader className="flex-1 space-y-0">
                  {isEditMode ? (
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Document title"
                      className="text-lg font-semibold h-auto py-1 px-2 -ml-2 bg-transparent border-transparent focus:border-input focus:bg-background"
                    />
                  ) : (
                    <DialogTitle className="text-lg font-semibold">
                      {editTitle || "Untitled"}
                    </DialogTitle>
                  )}
                </DialogHeader>

                {/* View/Edit toggle */}
                <div className="flex items-center gap-1 border rounded-lg p-1 bg-background">
                  <Button
                    variant={!isEditMode ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => setIsEditMode(false)}
                  >
                    <Eye className="h-4 w-4" />
                    View
                  </Button>
                  <Button
                    variant={isEditMode ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => setIsEditMode(true)}
                  >
                    <Edit3 className="h-4 w-4" />
                    Edit
                  </Button>
                </div>
              </div>

              {/* Content area */}
              <div className="flex-1 min-h-0 overflow-auto">
                {isEditMode ? (
                  <div className="h-full flex flex-col">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      placeholder="Write your content here using Markdown...&#10;&#10;# Headings&#10;**Bold text** and *italic text*&#10;- Bullet points&#10;- Lists&#10;&#10;> Blockquotes&#10;&#10;`code snippets`"
                      className="flex-1 min-h-[300px] resize-none border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 font-mono text-sm leading-relaxed p-4"
                    />
                  </div>
                ) : (
                  <div className="p-6">
                    {editContent.trim() ? (
                      <MarkdownRenderer content={editContent} />
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                        <FileText className="h-12 w-12 mb-3 opacity-50" />
                        <p>No content yet</p>
                        <Button
                          variant="link"
                          size="sm"
                          onClick={() => setIsEditMode(true)}
                          className="mt-2"
                        >
                          Click to add content
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer with actions */}
              <div className="flex items-center justify-between gap-2 p-4 border-t bg-muted/30">
                <p className="text-xs text-muted-foreground">
                  {isEditMode ? "Supports Markdown formatting" : ""}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setOpenDocId(null)}>
                    Close
                  </Button>
                  <Button onClick={handleSaveDoc}>
                    <Save className="mr-2 h-4 w-4" />
                    Save
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Link to task dialog */}
      <Dialog
        open={!!linkToTaskDocId}
        onOpenChange={(open) => {
          if (!open) {
            setLinkToTaskDocId(null);
            setLinkTaskId("__unlink__");
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Link to task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Task</label>
              <Select
                value={linkTaskId}
                onValueChange={(v) =>
                  setLinkTaskId(v as Id<"tasks"> | "__unlink__")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a task (or Unlink)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unlink__">(Unlink)</SelectItem>
                  {(tasks ?? []).map((t) => (
                    <SelectItem key={t._id} value={t._id}>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setLinkToTaskDocId(null);
                  setLinkTaskId("__unlink__");
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleLinkToTask}>Apply</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
