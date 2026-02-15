"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useMutation,
  useQuery,
} from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Button } from "@packages/ui/components/button";
import { Input } from "@packages/ui/components/input";
import { Label } from "@packages/ui/components/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/card";
import { toast } from "sonner";
import { Building2 } from "lucide-react";

/**
 * Account creation page.
 * Allows users to create a new account after signing up.
 * Uses Convex Authenticated so listMyAccounts runs only after the client has a valid token.
 */
export default function NewAccountPage() {
  return (
    <>
      <AuthLoading>
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </AuthLoading>
      <Unauthenticated>
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-muted-foreground">Redirecting to sign in...</p>
        </div>
      </Unauthenticated>
      <Authenticated>
        <NewAccountContent />
      </Authenticated>
    </>
  );
}

/**
 * Inner content that calls auth-required Convex queries.
 * Only rendered when Convex has validated the Clerk token.
 */
function NewAccountContent() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createAccount = useMutation(api.accounts.create);
  const myAccounts = useQuery(api.accounts.listMyAccounts);

  // Redirect to first account if user already has accounts
  useEffect(() => {
    if (myAccounts && myAccounts.length > 0) {
      const firstAccount = myAccounts[0];
      if (firstAccount && firstAccount.slug) {
        router.push(`/${firstAccount.slug}/tasks`);
      }
    }
  }, [myAccounts, router]);

  // Show loading state while checking accounts
  if (myAccounts === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading accounts...</p>
      </div>
    );
  }

  // Don't render form if user has accounts (will redirect)
  if (myAccounts && myAccounts.length > 0) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;

    // Validate slug format
    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(slug)) {
      toast.error("Invalid slug", {
        description:
          "Slug can only contain lowercase letters, numbers, and hyphens",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await createAccount({
        name: name.trim(),
        slug: slug.trim(),
      });

      toast.success("Account created successfully");

      // Redirect to the new account
      router.push(`/${slug.trim()}/tasks`);
    } catch (error) {
      toast.error("Failed to create account", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSlugChange = (value: string) => {
    // Auto-generate slug from name
    const generatedSlug = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    setSlug(generatedSlug);
    setName(value);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Create Your Account</CardTitle>
          <CardDescription>
            Get started by creating your first LobsterControl account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Account Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="My Company"
                required
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                This will be displayed as your account name
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Account Slug</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => {
                  const value = e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "-")
                    .replace(/-+/g, "-");
                  setSlug(value);
                }}
                placeholder="my-company"
                required
                pattern="[a-z0-9-]+"
              />
              <p className="text-xs text-muted-foreground">
                Used in your account URL: lobster-control.app/
                {slug || "..."}
              </p>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || !name.trim() || !slug.trim()}
            >
              {isSubmitting ? "Creating..." : "Create Account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
