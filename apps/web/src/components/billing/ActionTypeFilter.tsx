"use client";

import { Button } from "@packages/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@packages/ui/components/dropdown-menu";
import { Filter } from "lucide-react";

type ActionType =
  | "plan_upgraded"
  | "plan_downgraded"
  | "plan_renewed"
  | "plan_cancelled"
  | "payment_failed"
  | "invoice_paid"
  | "usage_limit_exceeded"
  | "customer_portal_accessed";

const ACTION_TYPES: { value: ActionType; label: string; description: string }[] =
  [
    {
      value: "plan_upgraded",
      label: "Plan Upgraded",
      description: "Subscription tier increased",
    },
    {
      value: "plan_downgraded",
      label: "Plan Downgraded",
      description: "Subscription tier decreased",
    },
    {
      value: "plan_renewed",
      label: "Plan Renewed",
      description: "Subscription renewal or automatic charge",
    },
    {
      value: "plan_cancelled",
      label: "Plan Cancelled",
      description: "Subscription cancelled",
    },
    {
      value: "payment_failed",
      label: "Payment Failed",
      description: "Payment attempt failed",
    },
    {
      value: "invoice_paid",
      label: "Invoice Paid",
      description: "Invoice successfully paid",
    },
    {
      value: "usage_limit_exceeded",
      label: "Usage Limit Exceeded",
      description: "Usage quota exceeded for a resource",
    },
    {
      value: "customer_portal_accessed",
      label: "Portal Accessed",
      description: "Customer portal opened",
    },
  ];

interface ActionTypeFilterProps {
  selectedFilter?: string;
  onFilterChange: (filter?: string) => void;
}

/**
 * ActionTypeFilter - Dropdown menu for filtering billing activities by action type.
 * Allows users to view specific types of billing events.
 */
export function ActionTypeFilter({
  selectedFilter,
  onFilterChange,
}: ActionTypeFilterProps) {
  const selectedLabel = selectedFilter
    ? ACTION_TYPES.find((t) => t.value === selectedFilter)?.label ||
      "Unknown"
    : "All Activities";

  const handleReset = () => {
    onFilterChange(undefined);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Filter className="h-4 w-4" />
          <span>{selectedLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Filter by Action Type</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Show all option */}
        <DropdownMenuCheckboxItem
          checked={!selectedFilter}
          onCheckedChange={handleReset}
        >
          <div>
            <div className="font-medium text-sm">All Activities</div>
            <div className="text-xs text-muted-foreground">
              Show all billing events
            </div>
          </div>
        </DropdownMenuCheckboxItem>

        <DropdownMenuSeparator />

        {/* Action type options */}
        {ACTION_TYPES.map((actionType) => (
          <DropdownMenuCheckboxItem
            key={actionType.value}
            checked={selectedFilter === actionType.value}
            onCheckedChange={(checked) => {
              if (checked) {
                onFilterChange(actionType.value);
              } else {
                onFilterChange(undefined);
              }
            }}
          >
            <div>
              <div className="font-medium text-sm">{actionType.label}</div>
              <div className="text-xs text-muted-foreground">
                {actionType.description}
              </div>
            </div>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
