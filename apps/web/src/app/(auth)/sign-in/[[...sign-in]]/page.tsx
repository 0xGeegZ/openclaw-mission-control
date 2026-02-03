import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { softPopClerkTheme } from "@/lib/clerk-theme";

/**
 * Sign-in page for user authentication.
 * Uses Soft Pop design system styling.
 */
export default function SignInPage() {
  return (
    <div className="w-full max-w-md">
      {/* Welcome message */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Welcome back
        </h1>
        <p className="text-muted-foreground mt-2">
          Sign in to continue to OpenClaw Mission Control
        </p>
      </div>

      <SignIn
        appearance={softPopClerkTheme}
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        forceRedirectUrl="/dashboard"
      />

      {/* Additional link */}
      <p className="text-center text-sm text-muted-foreground mt-6">
        Don&apos;t have an account?{" "}
        <Link
          href="/sign-up"
          className="text-primary hover:text-primary/80 font-medium transition-colors"
        >
          Create one for free
        </Link>
      </p>
    </div>
  );
}
