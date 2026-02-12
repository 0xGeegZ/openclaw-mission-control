"use client";

import type { ActivityType } from "@packages/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/select";
import { Filter } from "lucide-react";

const ACTIVITY_TYPE_LABELS: Record<ActivityType | "all", string> = {
  all: "All activity",
  account_created: "Account created",
  account_updated: "Account updated",
  task_created: "Task created",
  task_updated: "Task updated",
  task_status_changed: "Status changed",
  message_created: "Comment",
  document_created: "Document created",
  document_updated: "Document updated",
  agent_status_changed: "Agent status",
  runtime_status_changed: "Runtime status",
  member_added: "Member added",
  member_removed: "Member removed",
  member_updated: "Member updated",
  role_changed: "Role changed",
};

export type ActivityFilterType = ActivityType | "all";

interface ActivityFiltersProps {
  value: ActivityFilterType;
  onValueChange: (value: ActivityFilterType) => void;
}

/**
 * Filter dropdown for activity feed by type.
 */
export function ActivityFilters({ value, onValueChange }: ActivityFiltersProps) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onValueChange(v as ActivityFilterType)}
    >
      <SelectTrigger className="w-[180px] gap-2">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        <SelectValue placeholder="Filter by type" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{ACTIVITY_TYPE_LABELS.all}</SelectItem>
        {(Object.keys(ACTIVITY_TYPE_LABELS) as (ActivityType | "all")[])
          .filter((k) => k !== "all")
          .map((type) => (
            <SelectItem key={type} value={type}>
              {ACTIVITY_TYPE_LABELS[type]}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
