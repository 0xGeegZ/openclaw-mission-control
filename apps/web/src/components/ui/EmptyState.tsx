"use client";

import { LucideIcon } from "lucide-react";
import { Button } from "@packages/ui/components/button";
import { cn } from "@packages/ui/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  variant?: "default" | "card" | "inline";
  iconColor?: string;
  iconBgColor?: string;
}

/**
 * Reusable empty state component with consistent styling.
 * Use for lists, grids, and content areas when there's no data to display.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  variant = "default",
  iconColor = "text-muted-foreground/50",
  iconBgColor = "bg-muted/50",
}: EmptyStateProps) {
  const ActionIcon = action?.icon;

  if (variant === "inline") {
    return (
      <div className={cn("flex items-center gap-4 p-4 rounded-xl bg-muted/30 border border-dashed border-border/50", className)}>
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", iconBgColor)}>
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        {action && (
          <Button size="sm" onClick={action.onClick} className="shrink-0">
            {ActionIcon && <ActionIcon className="h-3.5 w-3.5 mr-1.5" />}
            {action.label}
          </Button>
        )}
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div className={cn("flex flex-col items-center justify-center py-12 px-6 text-center rounded-xl border border-dashed border-border/50 bg-muted/20", className)}>
        <div className={cn("flex h-14 w-14 items-center justify-center rounded-2xl mb-4 shadow-sm", iconBgColor)}>
          <Icon className={cn("h-7 w-7", iconColor)} />
        </div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground/70 mt-1.5 max-w-xs leading-relaxed">{description}</p>
        {(action || secondaryAction) && (
          <div className="flex items-center gap-2 mt-5">
            {secondaryAction && (
              <Button variant="outline" size="sm" onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </Button>
            )}
            {action && (
              <Button size="sm" onClick={action.onClick}>
                {ActionIcon && <ActionIcon className="h-3.5 w-3.5 mr-1.5" />}
                {action.label}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Default variant - centered with large icon
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 px-6 text-center", className)}>
      <div className={cn("flex h-20 w-20 items-center justify-center rounded-3xl mb-5 shadow-sm bg-gradient-to-br", iconBgColor)}>
        <Icon className={cn("h-10 w-10", iconColor)} />
      </div>
      <h3 className="text-xl font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground/70 mt-2 max-w-sm leading-relaxed">{description}</p>
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3 mt-6">
          {secondaryAction && (
            <Button variant="outline" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
          {action && (
            <Button onClick={action.onClick} className="shadow-sm">
              {ActionIcon && <ActionIcon className="h-4 w-4 mr-2" />}
              {action.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
