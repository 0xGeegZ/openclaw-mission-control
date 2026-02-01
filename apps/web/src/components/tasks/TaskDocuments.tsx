"use client";

import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Id } from "@packages/backend/convex/_generated/dataModel";
import { FileText } from "lucide-react";
import Link from "next/link";

interface TaskDocumentsProps {
  taskId: Id<"tasks">;
}

/**
 * Task documents component.
 * Shows documents linked to this task.
 */
export function TaskDocuments({ taskId }: TaskDocumentsProps) {
  const documents = useQuery(api.documents.listByTask, { taskId });
  
  if (!documents) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Loading documents...
      </div>
    );
  }
  
  if (documents.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        No documents linked to this task.
      </div>
    );
  }
  
  return (
    <div className="p-6 space-y-2">
      {documents.map((doc) => (
        <Link
          key={doc._id}
          href={`/docs/${doc._id}`}
          className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors"
        >
          <FileText className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1">
            <div className="font-medium">{doc.title}</div>
            <div className="text-sm text-muted-foreground">
              {doc.type} • v{doc.version}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
