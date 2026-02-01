"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  CheckSquare, 
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
