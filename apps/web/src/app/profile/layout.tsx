import { ClerkLoaded, SignedIn, SignedOut, RedirectToSignIn } from "@clerk/nextjs";

export const metadata = {
  title: "Profile | OpenClaw",
  description: "Manage your account settings and preferences",
};

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
      <SignedIn>
        <ClerkLoaded>
          {children}
        </ClerkLoaded>
      </SignedIn>
    </>
  );
}
