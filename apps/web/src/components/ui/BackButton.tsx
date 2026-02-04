"use client";

import { useRouter } from "next/navigation";
import { Button } from "@packages/ui/components/button";
import { ArrowLeft } from "lucide-react";

interface BackButtonProps {
  className?: string;
  variant?:
    | "default"
    | "outline"
    | "ghost"
    | "link"
    | "destructive"
    | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  children?: React.ReactNode;
}

/**
 * Button that navigates to the previous history entry.
 * Use on 404/error pages where a "Go Back" action is appropriate.
 */
export function BackButton({
  className,
  variant = "outline",
  size = "default",
  children = (
    <>
      <ArrowLeft className="h-4 w-4 mr-2" />
      Go Back
    </>
  ),
}: BackButtonProps) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={() => router.back()}
      aria-label="Go back to previous page"
    >
      {children}
    </Button>
  );
}
