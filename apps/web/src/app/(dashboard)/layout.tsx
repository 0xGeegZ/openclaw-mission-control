import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

interface DashboardLayoutProps {
  children: ReactNode;
}

/**
 * Root layout for dashboard pages.
 * Ensures user is authenticated.
 */
export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const { userId } = await auth();
  
  if (!userId) {
    redirect("/sign-in");
  }
  
  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  );
}
