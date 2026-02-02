"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useAuth, SignInButton } from "@clerk/nextjs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@packages/ui/components/card";
import { Button } from "@packages/ui/components/button";
import { Skeleton } from "@packages/ui/components/skeleton";
import { CheckCircle, XCircle, Loader2, LogIn } from "lucide-react";

interface AcceptInvitePageProps {
  params: Promise<{ token: string }>;
}

export default function AcceptInvitePage({ params }: AcceptInvitePageProps) {
  const { token } = use(params);
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const invitation = useQuery(
    api.invitations.getByToken,
    token ? { token } : "skip"
  );
  
  const acceptInvitation = useMutation(api.invitations.accept);

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    setError(null);
    
    try {
      const result = await acceptInvitation({ token });
      setSuccess(true);
      // Redirect to the workspace after a short delay
      setTimeout(() => {
        router.push(`/${result.accountSlug}`);
      }, 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to accept invitation");
    } finally {
      setAccepting(false);
    }
  };

  // Loading state for auth
  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Not signed in - prompt to sign in
  if (!isSignedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Sign In Required</CardTitle>
            <CardDescription>
              Please sign in to accept this workspace invitation
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <SignInButton mode="modal">
              <Button size="lg">
                <LogIn className="mr-2 h-4 w-4" />
                Sign In
              </Button>
            </SignInButton>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading invitation data
  if (invitation === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <Skeleton className="h-6 w-48 mx-auto" />
            <Skeleton className="h-4 w-64 mx-auto mt-2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Invalid or expired invitation
  if (invitation === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <XCircle className="h-12 w-12 text-destructive" />
            </div>
            <CardTitle>Invalid Invitation</CardTitle>
            <CardDescription>
              This invitation link is invalid, has expired, or has already been used.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" onClick={() => router.push("/dashboard")}>
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-12 w-12 text-green-500" />
            </div>
            <CardTitle>Welcome to {invitation.accountName}!</CardTitle>
            <CardDescription>
              You have successfully joined the workspace. Redirecting...
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show invitation details and accept button
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Workspace Invitation</CardTitle>
          <CardDescription>
            You have been invited to join <strong>{invitation.accountName}</strong> as a{" "}
            <span className="capitalize">{invitation.role}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm text-center">
              {error}
            </div>
          )}
          
          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              onClick={handleAccept}
              disabled={accepting}
              className="w-full"
            >
              {accepting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Accepting...
                </>
              ) : (
                "Accept Invitation"
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={() => router.push("/dashboard")}
              disabled={accepting}
              className="w-full"
            >
              Decline
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
