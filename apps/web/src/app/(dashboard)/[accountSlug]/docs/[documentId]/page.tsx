"use client";

import { use, useEffect, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { Button } from "@packages/ui/components/button";
import { Input } from "@packages/ui/components/input";
import { Skeleton } from "@packages/ui/components/skeleton";
import { Textarea } from "@packages/ui/components/textarea";
import {
  AlertCircle,
  ArrowLeft,
  Copy,
  Edit3,
  Eye,
  FileText,
  Save,
} from "lucide-react";
import { useCopyToClipboard } from "usehooks-ts";
import Link from "next/link";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { toast } from "sonner";

interface DocumentDetailPageProps {
  params: Promise<{ accountSlug: string; documentId: string }>;
}

/**
 * Document detail page with view and edit modes.
 */
export default function DocumentDetailPage({
  params,
}: DocumentDetailPageProps) {
  const { accountSlug, documentId } = use(params);
  const { isAuthenticated } = useConvexAuth();
  const document = useQuery(
    api.documents.get,
    isAuthenticated ? { documentId: documentId as Id<"documents"> } : "skip",
  );
  const updateDoc = useMutation(api.documents.update);
  const [, copyToClipboard] = useCopyToClipboard();
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    if (!document) return;
    const resolvedKind = document.kind ?? "file";
    const title = document.title ?? document.name ?? "";
    const content = resolvedKind === "file" ? (document.content ?? "") : "";
    setEditTitle(title);
    setEditContent(content);
    setIsEditMode(resolvedKind === "file" && !content.trim());
  }, [document]);

  /**
   * Copy document content to clipboard.
   */
  const handleCopyContent = () => {
    copyToClipboard(editContent)
      .then(() => toast.success("Content copied"))
      .catch(() => toast.error("Failed to copy"));
  };

  /**
   * Persist document title and content updates.
   */
  const handleSaveDoc = async () => {
    if (!document || document.kind !== "file") return;
    try {
      await updateDoc({
        documentId: document._id,
        title: editTitle || undefined,
        content: editContent,
      });
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  };

  if (document === undefined) {
    return <DocumentDetailSkeleton />;
  }

  if (document === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 text-center px-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 mb-4">
          <AlertCircle className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="text-xl font-semibold">Document not found</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          This document may have been deleted or you don&apos;t have permission
          to view it.
        </p>
        <Button asChild className="mt-4">
          <Link href={`/${accountSlug}/docs`}>Back to Documents</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-muted/20">
      <header className="flex items-center justify-between gap-4 px-6 py-4 border-b bg-card">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/${accountSlug}/docs`} aria-label="Back to documents">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          {document.kind === "file" && isEditMode ? (
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Document title"
              className="text-xl font-semibold h-auto py-1 px-2 -ml-2 bg-transparent border-transparent focus:border-input focus:bg-background"
            />
          ) : (
            <h1 className="text-xl font-semibold truncate">
              {editTitle || document.title || document.name || "Untitled"}
            </h1>
          )}
        </div>

        {(document.kind ?? "file") === "file" && (
          <div className="flex items-center gap-2">
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
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleCopyContent}
              aria-label="Copy content"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button onClick={handleSaveDoc}>
              <Save className="mr-2 h-4 w-4" />
              Save
            </Button>
          </div>
        )}
      </header>

      <div className="flex-1 min-h-0 overflow-auto">
        {(document.kind ?? "file") === "folder" ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-muted mb-6">
              <FileText className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold">This is a folder</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">
              Folders don&apos;t have content. Use the documents page to browse
              its contents.
            </p>
            <Button asChild className="mt-4">
              <Link href={`/${accountSlug}/docs`}>Back to Documents</Link>
            </Button>
          </div>
        ) : isEditMode ? (
          <div className="h-full flex flex-col">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder={
                "Write your content here using Markdown...\n\n# Headings\n**Bold text** and *italic text*\n- Bullet points\n- Lists\n\n> Blockquotes\n\n`code snippets`"
              }
              className="flex-1 min-h-[300px] resize-none border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 font-mono text-sm leading-relaxed p-6"
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
    </div>
  );
}

/**
 * Loading skeleton for the document detail page.
 */
function DocumentDetailSkeleton() {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="border-b bg-card px-6 py-4">
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="p-6 space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-4 w-44" />
      </div>
    </div>
  );
}
