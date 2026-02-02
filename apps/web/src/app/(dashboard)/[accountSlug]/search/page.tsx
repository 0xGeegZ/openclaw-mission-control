"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useAccount } from "@/lib/hooks/useAccount";
import { Card, CardContent } from "@packages/ui/components/card";
import { Input } from "@packages/ui/components/input";
import { Skeleton } from "@packages/ui/components/skeleton";
import { Search, FileText, ListTodo, Bot } from "lucide-react";

interface SearchPageProps {
  params: Promise<{ accountSlug: string }>;
}

/**
 * Global search across tasks, documents, and agents.
 */
export default function SearchPage({ params }: SearchPageProps) {
  use(params);
  const { accountId, account } = useAccount();
  const accountSlug = account?.slug ?? "";
  const [query, setQuery] = useState("");

  const result = useQuery(
    api.search.globalSearch,
    accountId && query.trim().length >= 2
      ? { accountId, searchQuery: query.trim(), limitPerCategory: 15 }
      : "skip"
  );

  const hasQuery = query.trim().length >= 2;
  const hasResults =
    result &&
    (result.tasks.length > 0 ||
      result.documents.length > 0 ||
      result.agents.length > 0);

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-4 border-b bg-card">
        <h1 className="text-2xl font-bold tracking-tight">Search</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Search tasks, documents, and agents
        </p>
        <div className="relative mt-4 max-w-xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Type to search..."
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {!hasQuery ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
              <Search className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              Enter at least 2 characters to search
            </p>
          </div>
        ) : result === undefined ? (
          <div className="space-y-4 max-w-2xl">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : !hasResults ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-muted-foreground">
              No results for &quot;{query.trim()}&quot;
            </p>
          </div>
        ) : (
          <div className="space-y-6 max-w-2xl">
            {result.tasks.length > 0 && (
              <Card>
                <CardContent className="p-0 divide-y divide-border">
                  <div className="px-4 py-2 border-b bg-muted/50 flex items-center gap-2">
                    <ListTodo className="h-4 w-4" />
                    <span className="text-sm font-medium">Tasks</span>
                  </div>
                  {result.tasks.map((t) => (
                    <Link
                      key={t.id}
                      href={`/${accountSlug}/tasks/${t.id}`}
                      className="flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors"
                    >
                      <ListTodo className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{t.title}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {t.status}
                        </p>
                      </div>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}
            {result.documents.length > 0 && (
              <Card>
                <CardContent className="p-0 divide-y divide-border">
                  <div className="px-4 py-2 border-b bg-muted/50 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span className="text-sm font-medium">Documents</span>
                  </div>
                  {result.documents.map((d) => (
                    <Link
                      key={d.id}
                      href={`/${accountSlug}/docs`}
                      className="flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors"
                    >
                      <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                      <p className="font-medium text-sm truncate">{d.title}</p>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}
            {result.agents.length > 0 && (
              <Card>
                <CardContent className="p-0 divide-y divide-border">
                  <div className="px-4 py-2 border-b bg-muted/50 flex items-center gap-2">
                    <Bot className="h-4 w-4" />
                    <span className="text-sm font-medium">Agents</span>
                  </div>
                  {result.agents.map((a) => (
                    <Link
                      key={a.id}
                      href={`/${accountSlug}/agents/${a.id}`}
                      className="flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors"
                    >
                      <Bot className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{a.title}</p>
                        {a.role && (
                          <p className="text-xs text-muted-foreground">
                            {a.role}
                          </p>
                        )}
                      </div>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
