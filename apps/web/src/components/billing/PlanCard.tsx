"use client";

import { Button } from "@packages/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@packages/ui/components/card";
import { Check } from "lucide-react";
import type { PlanTier, PlanFeatures } from "@packages/shared/types/billing";
import { cn } from "@/lib/utils";

interface PlanCardProps {
  plan: PlanFeatures;
  currentPlan?: PlanTier;
  onUpgrade?: () => void;
  isLoading?: boolean;
}

/**
 * PlanCard component for displaying subscription plan options.
 * Shows plan name, price, features, and CTA button.
 */
export function PlanCard({ plan, currentPlan, onUpgrade, isLoading }: PlanCardProps) {
  const isCurrentPlan = currentPlan && plan.name.toLowerCase() === currentPlan;
  const isHighlighted = plan.highlighted;

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all",
        isHighlighted && "border-primary shadow-lg scale-105",
        isCurrentPlan && "border-muted-foreground/30"
      )}
    >
      {isHighlighted && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-primary/80 to-primary" />
      )}

      {isCurrentPlan && (
        <div className="absolute top-3 right-3">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
            <Check className="h-3 w-3" />
            Current Plan
          </span>
        </div>
      )}

      <CardHeader className="pb-4">
        <CardTitle className="text-2xl">{plan.name}</CardTitle>
        <div className="mt-2">
          <span className="text-4xl font-bold tracking-tight">{plan.price}</span>
          {plan.price !== "Custom" && plan.price !== "$0" && (
            <span className="text-muted-foreground ml-1">/month</span>
          )}
        </div>
        <CardDescription className="mt-2">
          {plan.name === "Free" && "Perfect for getting started"}
          {plan.name === "Pro" && "For growing teams and projects"}
          {plan.name === "Enterprise" && "For large teams with custom needs"}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <ul className="space-y-3">
          {plan.features.map((feature, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <Check className="h-5 w-5 shrink-0 text-primary mt-0.5" />
              <span className="text-sm text-foreground/90">{feature}</span>
            </li>
          ))}
        </ul>

        <Button
          className="w-full"
          variant={isHighlighted ? "default" : "outline"}
          disabled={isCurrentPlan || isLoading}
          onClick={onUpgrade}
        >
          {isLoading ? "Loading..." : plan.ctaText}
        </Button>
      </CardContent>
    </Card>
  );
}
