import { Skeleton } from "@packages/ui/components/skeleton";

/**
 * Shown while account layout and page are loading (Suspense fallback).
 */
export default function AccountLoading() {
  return (
    <div className="flex flex-col h-full p-6 gap-4 animate-in fade-in duration-200">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
