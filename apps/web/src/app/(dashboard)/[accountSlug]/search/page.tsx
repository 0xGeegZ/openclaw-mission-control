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
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="relative mb-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-muted to-muted/50 shadow-sm">
                <Search className="h-8 w-8 text-muted-foreground/50" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-foreground">Search your workspace</h3>
            <p className="text-sm text-muted-foreground/70 mt-2 max-w-sm leading-relaxed">
              Find tasks, documents, and agents by entering at least 2 characters.
            </p>
          </div>
        ) : result === undefined ? (
          <div className="space-y-4 max-w-2xl animate-in fade-in duration-300">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} style={{ animationDelay: `${i * 60}ms` }}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-48 rounded-md" />
                      <Skeleton className="h-3 w-24 rounded-md opacity-60" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !hasResults ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="relative mb-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/10 to-amber-500/5 shadow-sm">
                <Search className="h-8 w-8 text-amber-500/60" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-foreground">No results found</h3>
            <p className="text-sm text-muted-foreground/70 mt-2 max-w-sm leading-relaxed">
              No matches for "<span className="font-medium text-foreground">{query.trim()}</span>". Try different keywords or check your spelling.
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
