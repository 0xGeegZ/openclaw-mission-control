import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { softPopClerkTheme } from "@/lib/clerk-theme";

/**
 * Sign-up page for new user registration.
 * Uses Soft Pop design system styling.
 */
export default function SignUpPage() {
  return (
    <div className="w-full max-w-md">
      {/* Welcome message */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Create your account
        </h1>
        <p className="text-muted-foreground mt-2">
          Get started with Mission Control in seconds
        </p>
      </div>
      
      <SignUp
        appearance={softPopClerkTheme}
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        forceRedirectUrl="/dashboard"
      />
      
      {/* Additional link */}
      <p className="text-center text-sm text-muted-foreground mt-6">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-primary hover:text-primary/80 font-medium transition-colors">
          Sign in instead
        </Link>
      </p>
      
      {/* Trust indicators */}
      <div className="flex items-center justify-center gap-6 mt-8 pt-6 border-t border-border/30">
        <div className="text-center">
          <div className="text-2xl font-bold text-foreground">Free</div>
          <div className="text-xs text-muted-foreground">to get started</div>
        </div>
        <div className="h-8 w-px bg-border/50" />
        <div className="text-center">
          <div className="text-2xl font-bold text-foreground">Secure</div>
          <div className="text-xs text-muted-foreground">by design</div>
        </div>
        <div className="h-8 w-px bg-border/50" />
        <div className="text-center">
          <div className="text-2xl font-bold text-foreground">Fast</div>
          <div className="text-xs text-muted-foreground">setup</div>
        </div>
      </div>
    </div>
  );
}
