import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

/**
 * Dashboard root - redirects to first account or account creation.
 */
export default async function DashboardPage() {
  const { userId } = await auth();
  
  if (!userId) {
    redirect("/sign-in");
  }
  
  // Redirect to account creation page
  // The page will check if user has accounts and redirect accordingly
  redirect("/new-account");
}
