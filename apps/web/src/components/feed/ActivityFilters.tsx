"use client";

import { type ActivityType, ACTIVITY_TYPE_LABELS } from "@packages/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/select";
import { Filter } from "lucide-react";

/** Extended labels map including "all" for the filter dropdown */
const FILTER_LABELS: Record<ActivityType | "all", string> = {
  all: "All activity",
  ...ACTIVITY_TYPE_LABELS,
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
        <SelectItem value="all">{FILTER_LABELS.all}</SelectItem>
        {(Object.keys(ACTIVITY_TYPE_LABELS) as ActivityType[]).map((type) => (
          <SelectItem key={type} value={type}>
            {FILTER_LABELS[type]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
