# Module 09: UI Layout & Navigation

> Implement dashboard shell, sidebar, and navigation.

---

## ESSENTIAL CONTEXT — READ FIRST

**Before implementing this module, you MUST read:**

1. **`docs/mission-control-initial-article.md`** — Dashboard concept (Section 5)
2. **`docs/mission-control-cursor-core-instructions.md`** — UI requirements
3. **`.cursor/rules/01-project-overview.mdc`** — Tech stack and import patterns
4. **`.cursor/rules/02-ui-components.mdc`** — Component patterns, shadcn usage

**Key understanding:**
- Multi-account support (account switcher)
- Responsive design (desktop sidebar, mobile sheet)
- Real-time notification count
- Clerk for user authentication (`UserButton`)

---

## 1. Context & Goal

We are implementing the core UI layout for Mission Control's dashboard. This provides the foundation for all feature UIs.

**What we're building:**
- Dashboard layout with sidebar navigation
- Account switcher (multi-account support)
- User menu with sign out
- Navigation links to main sections
- Notification indicator
- Responsive design (desktop + mobile)

**Key constraints:**
- Use shadcn/ui components
- Tailwind CSS v4 for styling
- Server components where possible
- Real-time notification count
- Clean, modern design

---

## 2. Codebase Research Summary

### Files to Reference

- `apps/web/app/layout.tsx` - Root layout with Clerk
- `packages/ui/src/components/` - shadcn components
- `packages/ui/src/lib/utils.ts` - cn utility

### Clerk Components Available

```typescript
import { 
  SignedIn, 
  SignedOut, 
  UserButton,
  SignInButton,
} from "@clerk/nextjs";
```

### shadcn Components Needed

```bash
# Install these components
npx shadcn@latest add button avatar dropdown-menu separator sheet scroll-area badge
```

---

## 3. High-level Design

### Layout Structure

```
┌────────────────────────────────────────────────────────────┐
│ Header (mobile) - Logo + Menu Button                       │
├──────────────┬─────────────────────────────────────────────┤
│              │                                             │
│   Sidebar    │              Main Content                   │
│              │                                             │
│  - Account   │         (Page content from                  │
│    Switcher  │          nested routes)                     │
│              │                                             │
│  - Nav Links │                                             │
│    • Tasks   │                                             │
│    • Agents  │                                             │
│    • Docs    │                                             │
│    • Feed    │                                             │
│              │                                             │
│  - User Menu │                                             │
│              │                                             │
└──────────────┴─────────────────────────────────────────────┘
```

### Route Structure

```
app/
├── (auth)/
│   ├── sign-in/[[...sign-in]]/page.tsx
│   └── sign-up/[[...sign-up]]/page.tsx
├── (dashboard)/
│   ├── layout.tsx              ← Dashboard layout
│   ├── page.tsx                ← Dashboard home (redirect to tasks)
│   ├── [accountSlug]/
│   │   ├── layout.tsx          ← Account context provider
│   │   ├── tasks/
│   │   │   ├── page.tsx        ← Kanban board
│   │   │   └── [taskId]/page.tsx
│   │   ├── agents/page.tsx
│   │   ├── docs/page.tsx
│   │   ├── feed/page.tsx
│   │   └── settings/page.tsx
├── layout.tsx                  ← Root layout
└── page.tsx                    ← Landing page
```

---

## 4. File & Module Changes

### Files to Create

| Path | Purpose |
|------|---------|
| `apps/web/app/(dashboard)/layout.tsx` | Dashboard wrapper |
| `apps/web/app/(dashboard)/[accountSlug]/layout.tsx` | Account context |
| `apps/web/app/(dashboard)/[accountSlug]/page.tsx` | Account home |
| `apps/web/components/dashboard/Sidebar.tsx` | Sidebar component |
| `apps/web/components/dashboard/AccountSwitcher.tsx` | Account dropdown |
| `apps/web/components/dashboard/NavLinks.tsx` | Navigation links |
| `apps/web/components/dashboard/NotificationBell.tsx` | Notification indicator |
| `apps/web/components/dashboard/MobileNav.tsx` | Mobile navigation |
| `apps/web/lib/hooks/useAccount.ts` | Account context hook |

### Files to Install (shadcn)

```bash
cd apps/web
npx shadcn@latest add avatar dropdown-menu separator sheet scroll-area badge tooltip
```

---

## 5. Step-by-Step Tasks

### Step 1: Install Required shadcn Components

```bash
cd apps/web
npx shadcn@latest add avatar dropdown-menu separator sheet scroll-area badge tooltip skeleton
```

### Step 2: Create Account Context Hook

Create `apps/web/lib/hooks/useAccount.ts`:

```typescript
"use client";

import { createContext, useContext } from "react";
import { Doc, Id } from "@packages/backend/convex/_generated/dataModel";

/**
 * Account context for dashboard pages.
 */
export interface AccountContextValue {
  account: Doc<"accounts"> | null;
  accountId: Id<"accounts"> | null;
  isLoading: boolean;
}

export const AccountContext = createContext<AccountContextValue>({
  account: null,
  accountId: null,
  isLoading: true,
});

/**
 * Hook to access current account context.
 * Must be used within AccountProvider.
 */
export function useAccount(): AccountContextValue {
  const context = useContext(AccountContext);
  if (!context) {
    throw new Error("useAccount must be used within AccountProvider");
  }
  return context;
}

/**
 * Hook to require account (throws if not loaded).
 */
export function useRequireAccount(): Omit<AccountContextValue, "isLoading"> & { 
  account: Doc<"accounts">; 
  accountId: Id<"accounts">;
} {
  const { account, accountId, isLoading } = useAccount();
  
  if (isLoading) {
    throw new Error("Account is still loading");
  }
  
  if (!account || !accountId) {
    throw new Error("No account selected");
  }
  
  return { account, accountId, isLoading: false };
}
```

### Step 3: Create Account Provider

Create `apps/web/components/providers/AccountProvider.tsx`:

```typescript
"use client";

import { ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { AccountContext } from "@/lib/hooks/useAccount";

interface AccountProviderProps {
  accountSlug: string;
  children: ReactNode;
}

/**
 * Provides account context to dashboard pages.
 */
export function AccountProvider({ accountSlug, children }: AccountProviderProps) {
  const account = useQuery(api.accounts.getBySlug, { slug: accountSlug });
  
  const value = {
    account: account ?? null,
    accountId: account?._id ?? null,
    isLoading: account === undefined,
  };
  
  return (
    <AccountContext.Provider value={value}>
      {children}
    </AccountContext.Provider>
  );
}
```

### Step 4: Create Sidebar Component

Create `apps/web/components/dashboard/Sidebar.tsx`:

```typescript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  CheckSquare, 
  Users, 
  FileText, 
  Activity,
  Settings,
  Bot,
} from "lucide-react";
import { cn } from "@packages/ui/lib/utils";
import { AccountSwitcher } from "./AccountSwitcher";
import { NotificationBell } from "./NotificationBell";
import { UserButton } from "@clerk/nextjs";

interface SidebarProps {
  accountSlug: string;
}

const navItems = [
  { href: "tasks", label: "Tasks", icon: CheckSquare },
  { href: "agents", label: "Agents", icon: Bot },
  { href: "docs", label: "Documents", icon: FileText },
  { href: "feed", label: "Activity", icon: Activity },
  { href: "settings", label: "Settings", icon: Settings },
];

/**
 * Dashboard sidebar with navigation.
 */
export function Sidebar({ accountSlug }: SidebarProps) {
  const pathname = usePathname();
  
  return (
    <div className="flex h-full w-64 flex-col border-r bg-card">
      {/* Logo/Brand */}
      <div className="flex h-16 items-center border-b px-4">
        <Link href={`/${accountSlug}/tasks`} className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <LayoutDashboard className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold">Mission Control</span>
        </Link>
      </div>
      
      {/* Account Switcher */}
      <div className="border-b p-4">
        <AccountSwitcher currentSlug={accountSlug} />
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const href = `/${accountSlug}/${item.href}`;
          const isActive = pathname.startsWith(href);
          const Icon = item.icon;
          
          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive 
                  ? "bg-primary text-primary-foreground" 
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      
      {/* Bottom section */}
      <div className="border-t p-4">
        <div className="flex items-center justify-between">
          <UserButton 
            afterSignOutUrl="/"
            appearance={{
              elements: {
                avatarBox: "h-8 w-8",
              },
            }}
          />
          <NotificationBell accountSlug={accountSlug} />
        </div>
      </div>
    </div>
  );
}
```

### Step 5: Create Account Switcher

Create `apps/web/components/dashboard/AccountSwitcher.tsx`:

```typescript
"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@packages/ui/lib/utils";
import { Button } from "@packages/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@packages/ui/components/dropdown-menu";

interface AccountSwitcherProps {
  currentSlug: string;
}

/**
 * Dropdown to switch between accounts.
 */
export function AccountSwitcher({ currentSlug }: AccountSwitcherProps) {
  const router = useRouter();
  const accounts = useQuery(api.accounts.listMyAccounts);
  
  const currentAccount = accounts?.find(a => a.slug === currentSlug);
  
  if (!accounts) {
    return (
      <Button variant="outline" className="w-full justify-between" disabled>
        <span className="truncate">Loading...</span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
    );
  }
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          <span className="truncate">{currentAccount?.name ?? "Select account"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start">
        {accounts.map((account) => (
          <DropdownMenuItem
            key={account._id}
            onClick={() => router.push(`/${account.slug}/tasks`)}
            className="flex items-center justify-between"
          >
            <span className="truncate">{account.name}</span>
            {account.slug === currentSlug && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/new-account")}>
          <Plus className="mr-2 h-4 w-4" />
          Create Account
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### Step 6: Create Notification Bell

Create `apps/web/components/dashboard/NotificationBell.tsx`:

```typescript
"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Bell } from "lucide-react";
import { Button } from "@packages/ui/components/button";
import { Badge } from "@packages/ui/components/badge";
import { useAccount } from "@/lib/hooks/useAccount";

interface NotificationBellProps {
  accountSlug: string;
}

/**
 * Notification bell with unread count badge.
 */
export function NotificationBell({ accountSlug }: NotificationBellProps) {
  const { accountId } = useAccount();
  
  const unreadCount = useQuery(
    api.notifications.getUnreadCount,
    accountId ? { accountId } : "skip"
  );
  
  return (
    <Button variant="ghost" size="icon" asChild className="relative">
      <Link href={`/${accountSlug}/notifications`}>
        <Bell className="h-4 w-4" />
        {unreadCount && unreadCount > 0 && (
          <Badge 
            variant="destructive" 
            className="absolute -right-1 -top-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </Badge>
        )}
        <span className="sr-only">Notifications</span>
      </Link>
    </Button>
  );
}
```

### Step 7: Create Mobile Navigation

Create `apps/web/components/dashboard/MobileNav.tsx`:

```typescript
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LayoutDashboard } from "lucide-react";
import { Button } from "@packages/ui/components/button";
import { Sheet, SheetContent, SheetTrigger } from "@packages/ui/components/sheet";
import { Sidebar } from "./Sidebar";

interface MobileNavProps {
  accountSlug: string;
}

/**
 * Mobile navigation with slide-out sidebar.
 */
export function MobileNav({ accountSlug }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  
  return (
    <div className="flex h-16 items-center justify-between border-b px-4 lg:hidden">
      <Link href={`/${accountSlug}/tasks`} className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <LayoutDashboard className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-semibold">Mission Control</span>
      </Link>
      
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-64">
          <Sidebar accountSlug={accountSlug} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
```

### Step 8: Create Dashboard Layout

Create `apps/web/app/(dashboard)/layout.tsx`:

```typescript
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
```

### Step 9: Create Account Layout

Create `apps/web/app/(dashboard)/[accountSlug]/layout.tsx`:

```typescript
import { ReactNode } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { MobileNav } from "@/components/dashboard/MobileNav";
import { AccountProvider } from "@/components/providers/AccountProvider";

interface AccountLayoutProps {
  children: ReactNode;
  params: Promise<{ accountSlug: string }>;
}

/**
 * Layout for account-scoped pages.
 * Provides account context and navigation.
 */
export default async function AccountLayout({ 
  children, 
  params 
}: AccountLayoutProps) {
  const { accountSlug } = await params;
  
  return (
    <AccountProvider accountSlug={accountSlug}>
      <div className="flex h-screen">
        {/* Desktop sidebar */}
        <div className="hidden lg:block">
          <Sidebar accountSlug={accountSlug} />
        </div>
        
        {/* Main content area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Mobile nav */}
          <MobileNav accountSlug={accountSlug} />
          
          {/* Page content */}
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </AccountProvider>
  );
}
```

### Step 10: Create Account Home Page

Create `apps/web/app/(dashboard)/[accountSlug]/page.tsx`:

```typescript
import { redirect } from "next/navigation";

interface AccountPageProps {
  params: Promise<{ accountSlug: string }>;
}

/**
 * Account home page - redirects to tasks.
 */
export default async function AccountPage({ params }: AccountPageProps) {
  const { accountSlug } = await params;
  redirect(`/${accountSlug}/tasks`);
}
```

### Step 11: Create Dashboard Home Page

Create `apps/web/app/(dashboard)/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@packages/backend/convex/_generated/api";

/**
 * Dashboard root - redirects to first account or account creation.
 */
export default async function DashboardPage() {
  const { userId } = await auth();
  
  if (!userId) {
    redirect("/sign-in");
  }
  
  // Fetch user's accounts
  // Note: This requires setting up Convex server-side auth
  // For now, redirect to a default or show account selection
  
  // Placeholder: redirect to account creation
  redirect("/new-account");
}
```

### Step 12: Create Placeholder Pages

Create placeholder pages for other sections:

**`apps/web/app/(dashboard)/[accountSlug]/tasks/page.tsx`:**
```typescript
/**
 * Tasks page (Kanban board).
 * Full implementation in Module 10.
 */
export default function TasksPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Tasks</h1>
      <p className="text-muted-foreground">Kanban board coming in Module 10.</p>
    </div>
  );
}
```

**`apps/web/app/(dashboard)/[accountSlug]/agents/page.tsx`:**
```typescript
/**
 * Agents page (roster).
 * Full implementation in Module 12.
 */
export default function AgentsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Agents</h1>
      <p className="text-muted-foreground">Agent roster coming in Module 12.</p>
    </div>
  );
}
```

**`apps/web/app/(dashboard)/[accountSlug]/docs/page.tsx`:**
```typescript
/**
 * Documents page.
 * Full implementation in Module 11 or later.
 */
export default function DocsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Documents</h1>
      <p className="text-muted-foreground">Documents list coming soon.</p>
    </div>
  );
}
```

**`apps/web/app/(dashboard)/[accountSlug]/feed/page.tsx`:**
```typescript
/**
 * Activity feed page.
 * Full implementation in Module 12.
 */
export default function FeedPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Activity Feed</h1>
      <p className="text-muted-foreground">Activity feed coming in Module 12.</p>
    </div>
  );
}
```

### Step 13: Verify Build

```bash
cd apps/web
yarn typecheck
yarn dev
```

### Step 14: Commit Changes

```bash
git add .
git commit -m "feat(ui): implement dashboard layout and navigation

- Add responsive sidebar with navigation
- Add account switcher dropdown
- Add notification bell with badge
- Add mobile navigation sheet
- Create account context provider
- Set up dashboard route structure
"
```

---

## 6. Edge Cases & Risks

### Edge Cases

| Case | Handling |
|------|----------|
| No accounts | Redirect to account creation |
| Invalid account slug | Show 404 or redirect |
| Notification loading | Show skeleton/placeholder |
| Mobile view | Use sheet for sidebar |

---

## 7. Testing Strategy

### Manual Verification

- [ ] Sidebar renders correctly
- [ ] Navigation links work
- [ ] Account switcher shows accounts
- [ ] Account switcher switches accounts
- [ ] Notification bell shows count
- [ ] Mobile nav works on small screens
- [ ] User button shows/works

---

## 9. TODO Checklist

### Components

- [ ] Install shadcn components
- [ ] Create `Sidebar.tsx`
- [ ] Create `AccountSwitcher.tsx`
- [ ] Create `NotificationBell.tsx`
- [ ] Create `MobileNav.tsx`

### Hooks/Providers

- [ ] Create `useAccount.ts` hook
- [ ] Create `AccountProvider.tsx`

### Layouts

- [ ] Create dashboard layout
- [ ] Create account layout
- [ ] Create dashboard home page
- [ ] Create account home page

### Placeholder Pages

- [ ] Create tasks page placeholder
- [ ] Create agents page placeholder
- [ ] Create docs page placeholder
- [ ] Create feed page placeholder

### Verification

- [ ] Type check passes
- [ ] Dev server runs
- [ ] Navigation works
- [ ] Commit changes

---

## Completion Criteria

This module is complete when:

1. Sidebar renders with navigation
2. Account switcher works
3. Mobile navigation works
4. Routes are structured correctly
5. Type check passes
6. Git commit made
