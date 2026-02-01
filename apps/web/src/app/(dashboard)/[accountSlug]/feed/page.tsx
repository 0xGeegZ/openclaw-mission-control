"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useAccount } from "@/lib/hooks/useAccount";
import { ActivityItem } from "@/components/feed/ActivityItem";

interface FeedPageProps {
  params: Promise<{ accountSlug: string }>;
}

/**
 * Activity feed page.
 */
export default function FeedPage({ params }: FeedPageProps) {
  const { accountSlug } = use(params);
  const { accountId } = useAccount();
  
  const activities = useQuery(
    api.activities.list,
    accountId ? { accountId, limit: 50 } : "skip"
  );
  
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Activity Feed</h1>
      
      {activities === undefined ? (
        <div className="text-center text-muted-foreground py-8">
          Loading activities...
        </div>
      ) : activities.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          No activity yet.
        </div>
      ) : (
        <div className="space-y-0">
          {activities.map((activity) => (
            <ActivityItem 
              key={activity._id} 
              activity={activity} 
              accountSlug={accountSlug} 
            />
          ))}
        </div>
      )}
    </div>
  );
}
