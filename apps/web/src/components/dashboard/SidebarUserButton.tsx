"use client";

import { UserButton } from "@clerk/nextjs";

/**
 * Clerk UserButton for the sidebar. Rendered only on the client to avoid
 * hydration mismatch (Clerk’s server output differs from its client output).
 */
export function SidebarUserButton() {
  return (
    <UserButton
      afterSignOutUrl="/"
      appearance={{
        elements: {
          avatarBox: "h-9 w-9",
        },
      }}
    />
  );
}
