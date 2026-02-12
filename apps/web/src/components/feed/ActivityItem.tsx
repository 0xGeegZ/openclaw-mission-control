"use client";

import { Doc } from "@packages/backend/convex/_generated/dataModel";
import { getActivityDescription } from "@packages/backend/convex/lib/activity";
import { ACTIVITY_TYPE, type ActivityType } from "@packages/shared";
import { useRelativeTime } from "@/lib/hooks/useRelativeTime";
import { Avatar, AvatarFallback } from "@packages/ui/components/avatar";
import {
  User,
  Bot,
  Settings,
  CheckCircle2,
  MessageSquare,
  UserPlus,
  FileText,
  AlertCircle,
  Pencil,
  UserMinus,
  Shield,
} from "lucide-react";
import { cn } from "@packages/ui/lib/utils";
import Link from "next/link";
import { getTaskDetailSheetHref } from "@/lib/utils";

interface ActivityItemProps {
  activity: Doc<"activities">;
  accountSlug: string;
}

const actorConfig: Record<
  string,
  { icon: typeof User; bgClass: string; iconClass: string }
> = {
  user: { icon: User, bgClass: "bg-primary/10", iconClass: "text-primary" },
  agent: {
    icon: Bot,
    bgClass: "bg-violet-500/10",
    iconClass: "text-violet-500",
  },
  system: {
    icon: Settings,
    bgClass: "bg-muted",
    iconClass: "text-muted-foreground",
  },
};

/** Icons and colors per activity type; keys match ACTIVITY_TYPE for consistency. */
const activityTypeConfig: Record<
  ActivityType,
  { icon: typeof CheckCircle2; color: string }
> = {
  [ACTIVITY_TYPE.ACCOUNT_CREATED]: { icon: Settings, color: "text-blue-500" },
  [ACTIVITY_TYPE.ACCOUNT_UPDATED]: { icon: Pencil, color: "text-blue-500" },
  [ACTIVITY_TYPE.TASK_CREATED]: { icon: FileText, color: "text-emerald-500" },
  [ACTIVITY_TYPE.TASK_UPDATED]: { icon: Pencil, color: "text-blue-500" },
  [ACTIVITY_TYPE.TASK_STATUS_CHANGED]: {
    icon: CheckCircle2,
    color: "text-emerald-500",
  },
  [ACTIVITY_TYPE.MESSAGE_CREATED]: {
    icon: MessageSquare,
    color: "text-primary",
  },
  [ACTIVITY_TYPE.DOCUMENT_CREATED]: { icon: FileText, color: "text-emerald-500" },
  [ACTIVITY_TYPE.DOCUMENT_UPDATED]: { icon: Pencil, color: "text-blue-500" },
  [ACTIVITY_TYPE.AGENT_STATUS_CHANGED]: { icon: Bot, color: "text-amber-500" },
  [ACTIVITY_TYPE.RUNTIME_STATUS_CHANGED]: {
    icon: AlertCircle,
    color: "text-destructive",
  },
  [ACTIVITY_TYPE.MEMBER_ADDED]: { icon: UserPlus, color: "text-violet-500" },
  [ACTIVITY_TYPE.MEMBER_REMOVED]: { icon: UserMinus, color: "text-violet-500" },
  [ACTIVITY_TYPE.MEMBER_UPDATED]: { icon: UserPlus, color: "text-violet-500" },
  [ACTIVITY_TYPE.ROLE_CHANGED]: { icon: Shield, color: "text-muted-foreground" },
};

/**
 * Build a task detail href when the activity is task-related.
 */
function getActivityTaskHref(
  activity: Doc<"activities">,
  accountSlug: string,
): string | null {
  if (!accountSlug) return null;
  if (activity.targetType === "task") {
    return getTaskDetailSheetHref(accountSlug, activity.targetId);
  }
  if (
    activity.meta &&
    typeof activity.meta === "object" &&
    "taskId" in activity.meta
  ) {
    const taskId = (activity.meta as { taskId?: unknown }).taskId;
    if (typeof taskId === "string") {
      return getTaskDetailSheetHref(accountSlug, taskId);
    }
  }
  return null;
}

/**
 * Single activity item in feed. Relative time updates on a 60s tick so "1 min ago" advances without refresh.
 */
export function ActivityItem({ activity, accountSlug }: ActivityItemProps) {
  const relativeTime = useRelativeTime(activity.createdAt, { addSuffix: true });
  const config = actorConfig[activity.actorType] || actorConfig.system;
  const Icon = config.icon;
  const typeConfig = activityTypeConfig[activity.type];
  const TypeIcon = typeConfig?.icon;
  const taskHref = getActivityTaskHref(activity, accountSlug);
  const containerClassName = cn(
    "group flex gap-3.5 px-4 py-4 hover:bg-muted/30 transition-all duration-200",
    taskHref && "cursor-pointer",
  );
  const content = (
    <>
      <div className="flex flex-col items-center">
        {/* Avatar with activity type indicator */}
        <div className="relative">
          <Avatar
            className={cn(
              "h-10 w-10 ring-2 ring-background shadow-sm",
              config.bgClass,
            )}
          >
            <AvatarFallback className={cn(config.bgClass, config.iconClass)}>
              <Icon className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          {/* Activity type badge */}
          {TypeIcon && (
            <div
              className={cn(
                "absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-background ring-2 ring-background flex items-center justify-center shadow-sm",
              )}
            >
              <TypeIcon className={cn("h-3 w-3", typeConfig.color)} />
            </div>
          )}
        </div>
        {/* Timeline connector */}
        <div className="flex-1 w-px bg-gradient-to-b from-border to-transparent mt-3 min-h-[20px]" />
      </div>

      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-sm leading-relaxed">
          <span className="font-semibold text-foreground">
            {activity.actorName}
          </span>{" "}
          <span className="text-muted-foreground">
            {getActivityDescription(
              activity.type,
              activity.actorName,
              activity.targetName,
              activity.meta,
            )}
          </span>
        </p>

        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[11px] text-muted-foreground/60 tabular-nums">
            {relativeTime}
          </span>
        </div>
      </div>
    </>
  );

  if (taskHref) {
    const ariaLabel = activity.targetName
      ? `Open task ${activity.targetName}`
      : "Open task";
    return (
      <Link
        href={taskHref}
        className={containerClassName}
        aria-label={ariaLabel}
      >
        {content}
      </Link>
    );
  }

  return <div className={containerClassName}>{content}</div>;
}
