import { ReactNode } from "react";

/**
 * Splash layout for public marketing pages.
 * No authentication required.
 */
export default function SplashLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  );
}
