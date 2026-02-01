"use client";

import { use, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useAccount } from "@/lib/hooks/useAccount";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@packages/ui/components/card";
import { Button } from "@packages/ui/components/button";
import { Input } from "@packages/ui/components/input";
import { Badge } from "@packages/ui/components/badge";
import { Skeleton } from "@packages/ui/components/skeleton";
import { 
  FileText, 
  FolderPlus, 
  FilePlus, 
  Search,
  Grid3X3,
  List,
  Clock,
  FileIcon,
  FolderIcon,
  MoreHorizontal,
  Upload,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@packages/ui/components/dropdown-menu";

interface DocsPageProps {
  params: Promise<{ accountSlug: string }>;
}

/**
 * Documents page for workspace files and documents.
 */
export default function DocsPage({ params }: DocsPageProps) {
  const { accountSlug } = use(params);
  const { accountId, isLoading } = useAccount();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Mock documents data - will be replaced with real API
  const documents = useQuery(
    api.documents?.list,
    accountId ? { accountId } : "skip"
  );
  
  const hasDocuments = documents && documents.length > 0;
  
  return (
    <div className="flex flex-col h-full">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-4 border-b bg-card">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground">Shared files and documents for your workspace</p>
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
              <DropdownMenuItem disabled>
                <FileIcon className="mr-2 h-4 w-4" />
                New Document
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
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
      
      {/* Search and filters */}
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
        {documents === undefined ? (
          // Loading state
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
        ) : !hasDocuments ? (
          // Empty state
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-muted mb-6">
              <FileText className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold">No documents yet</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">
              Create your first document or upload files to share with your team. 
              Documents help keep everyone aligned and informed.
            </p>
            <div className="flex items-center gap-3 mt-6">
              <Button disabled>
                <FilePlus className="mr-2 h-4 w-4" />
                Create Document
              </Button>
              <Button variant="outline" disabled>
                <Upload className="mr-2 h-4 w-4" />
                Upload Files
              </Button>
            </div>
            <div className="mt-8 p-4 rounded-lg bg-muted/50 max-w-md">
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">Coming Soon:</strong> Document creation, file uploads, 
                real-time collaboration, and version history.
              </p>
            </div>
          </div>
        ) : (
          // Documents list/grid (when implemented)
          viewMode === "grid" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {documents.map((doc: { _id: string; name: string; type: string; updatedAt: number }) => (
                <Card key={doc._id} className="p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex flex-col items-center text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted mb-3">
                      {doc.type === "folder" ? (
                        <FolderIcon className="h-8 w-8 text-muted-foreground" />
                      ) : (
                        <FileIcon className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>
                    <p className="font-medium text-sm truncate w-full">{doc.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Updated recently
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0 divide-y divide-border">
                {documents.map((doc: { _id: string; name: string; type: string; updatedAt: number }) => (
                  <div key={doc._id} className="flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
                      {doc.type === "folder" ? (
                        <FolderIcon className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <FileIcon className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{doc.name}</p>
                      <p className="text-xs text-muted-foreground">Updated recently</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )
        )}
      </div>
    </div>
  );
}
