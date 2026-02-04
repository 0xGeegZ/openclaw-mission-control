"use client";

import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id } from "@packages/backend/convex/_generated/dataModel";
import { FileText, File, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@packages/ui/components/card";
import { Badge } from "@packages/ui/components/badge";
import { Skeleton } from "@packages/ui/components/skeleton";

interface TaskDocumentsProps {
  taskId: Id<"tasks">;
}

/**
 * Task documents component.
 * Shows documents linked to this task.
 */
export function TaskDocuments({ taskId }: TaskDocumentsProps) {
  const documents = useQuery(api.documents.listByTask, { taskId });
  
  if (documents === undefined) {
    return (
      <div className="p-6 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  
  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-6">
        <div className="relative mb-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/10 to-blue-500/5 shadow-sm">
            <FileText className="h-8 w-8 text-blue-500/60" />
          </div>
        </div>
        <h3 className="text-lg font-semibold text-foreground">No documents yet</h3>
        <p className="text-sm text-muted-foreground/70 mt-2 max-w-xs leading-relaxed">
          Documents and files linked to this task will appear here for easy access.
        </p>
      </div>
    );
  }
  
  return (
    <div className="p-6 space-y-3">
      {documents.map((doc) => (
        <Link
          key={doc._id}
          href={`/docs/${doc._id}`}
          className="block group"
        >
          <Card className="hover:shadow-md hover:border-primary/20 transition-all">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate group-hover:text-primary transition-colors">
                      {doc.title}
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {doc.type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Version {doc.version}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
