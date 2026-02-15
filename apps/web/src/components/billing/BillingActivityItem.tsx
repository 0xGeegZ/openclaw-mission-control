"use client";

import { format } from "date-fns";
import {
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  DollarSign,
  Calendar,
  Clock,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@packages/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/card";
import type { Doc } from "@packages/backend/convex/_generated/dataModel";

type BillingAction = Doc<"billingActions">;

interface BillingActivityItemProps {
  action: BillingAction;
}

/**
 * BillingActivityItem - Display a single billing action in the activity timeline.
 * Shows action type, description, timestamp, and expandable details.
 */
export function BillingActivityItem({ action }: BillingActivityItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Get icon and styling based on action type
  const getActionIcon = () => {
    switch (action.actionType) {
      case "plan_upgraded":
        return <TrendingUp className="h-5 w-5 text-green-600" />;
      case "plan_downgraded":
        return <TrendingDown className="h-5 w-5 text-orange-600" />;
      case "plan_renewed":
        return <Calendar className="h-5 w-5 text-blue-600" />;
      case "plan_cancelled":
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case "payment_failed":
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case "invoice_paid":
        return <DollarSign className="h-5 w-5 text-green-600" />;
      case "usage_limit_exceeded":
        return <AlertCircle className="h-5 w-5 text-yellow-600" />;
      case "customer_portal_accessed":
        return <Clock className="h-5 w-5 text-slate-600" />;
      default:
        return <Clock className="h-5 w-5 text-slate-400" />;
    }
  };

  // Format action type for display
  const getActionLabel = () => {
    return action.actionType
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Get background color based on action type
  const getItemBgColor = () => {
    switch (action.actionType) {
      case "plan_upgraded":
        return "bg-green-50";
      case "plan_downgraded":
        return "bg-orange-50";
      case "plan_renewed":
        return "bg-blue-50";
      case "plan_cancelled":
      case "payment_failed":
        return "bg-red-50";
      case "invoice_paid":
        return "bg-green-50";
      case "usage_limit_exceeded":
        return "bg-yellow-50";
      default:
        return "bg-slate-50";
    }
  };

  // Format timestamp
  const formattedDate = format(new Date(action.timestamp), "MMM d, yyyy");
  const formattedTime = format(new Date(action.timestamp), "h:mm a");

  // Determine if details should be shown
  const hasDetails =
    action.details && Object.keys(action.details).length > 0;
  const hasMetadata =
    action.metadata && Object.keys(action.metadata).length > 0;

  return (
    <Card className={`border-l-4 ${getItemBgColor()}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">{getActionIcon()}</div>
            <div className="flex-1">
              <CardTitle className="text-base">{getActionLabel()}</CardTitle>
              {action.description && (
                <CardDescription className="text-sm mt-1">
                  {action.description}
                </CardDescription>
              )}
            </div>
          </div>
          {(hasDetails || hasMetadata) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex-shrink-0"
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Timestamp */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>
            {formattedDate} at {formattedTime}
          </span>
        </div>

        {/* Expanded Details Section */}
        {isExpanded && (hasDetails || hasMetadata) && (
          <div className="mt-4 pt-4 border-t space-y-4">
            {/* Details */}
            {hasDetails && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  Details
                </h4>
                <div className="grid gap-2 text-sm">
                  {action.details?.old_plan && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Previous Plan:
                      </span>
                      <span className="font-medium capitalize">
                        {action.details.old_plan}
                      </span>
                    </div>
                  )}
                  {action.details?.new_plan && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">New Plan:</span>
                      <span className="font-medium capitalize">
                        {action.details.new_plan}
                      </span>
                    </div>
                  )}
                  {action.details?.amount && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Amount:</span>
                      <span className="font-medium">
                        ${(action.details.amount / 100).toFixed(2)}{" "}
                        {action.details.amount_currency?.toUpperCase() || "USD"}
                      </span>
                    </div>
                  )}
                  {action.details?.invoice_id && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Invoice ID:
                      </span>
                      <code className="text-xs bg-slate-100 px-2 py-1 rounded">
                        {action.details.invoice_id}
                      </code>
                    </div>
                  )}
                  {action.details?.stripe_subscription_id && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Subscription ID:
                      </span>
                      <code className="text-xs bg-slate-100 px-2 py-1 rounded">
                        {action.details.stripe_subscription_id.slice(0, 12)}...
                      </code>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Metadata */}
            {hasMetadata && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  Additional Info
                </h4>
                <div className="grid gap-2 text-sm">
                  {action.metadata?.reason && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Reason:</span>
                      <span className="font-medium">{action.metadata.reason}</span>
                    </div>
                  )}
                  {action.metadata?.feedback_text && (
                    <div className="space-y-1">
                      <span className="text-muted-foreground block">
                        Feedback:
                      </span>
                      <p className="text-xs bg-slate-100 p-2 rounded italic">
                        {action.metadata.feedback_text}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
