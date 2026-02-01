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
import { Separator } from "@packages/ui/components/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@packages/ui/components/tooltip";

interface SidebarProps {
  accountSlug: string;
}

const navItems = [
  { href: "tasks", label: "Tasks", icon: CheckSquare, description: "Manage tasks" },
  { href: "agents", label: "Agents", icon: Bot, description: "AI agent roster" },
  { href: "docs", label: "Documents", icon: FileText, description: "Shared documents" },
  { href: "feed", label: "Activity", icon: Activity, description: "Recent activity" },
];

const settingsItem = { href: "settings", label: "Settings", icon: Settings, description: "Workspace settings" };

/**
 * Dashboard sidebar with navigation.
 */
export function Sidebar({ accountSlug }: SidebarProps) {
  const pathname = usePathname();
  
  return (
    <TooltipProvider delayDuration={0}>
      <aside className="flex h-full w-64 flex-col border-r bg-card">
        {/* Logo/Brand */}
        <div className="flex h-16 items-center border-b px-4">
          <Link href={`/${accountSlug}/tasks`} className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary transition-transform group-hover:scale-105">
              <LayoutDashboard className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground">Mission Control</span>
          </Link>
        </div>
        
        {/* Account Switcher */}
        <div className="p-4">
          <AccountSwitcher currentSlug={accountSlug} />
        </div>
        
        <Separator />
        
        {/* Navigation */}
        <nav className="flex-1 px-3 py-4">
          <div className="space-y-1">
            {navItems.map((item) => {
              const href = `/${accountSlug}/${item.href}`;
              const isActive = pathname.startsWith(href);
              const Icon = item.icon;
              
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>
                    <Link
                      href={href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                        isActive 
                          ? "bg-primary text-primary-foreground shadow-sm" 
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    {item.description}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          
          <Separator className="my-4" />
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href={`/${accountSlug}/${settingsItem.href}`}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                  pathname.startsWith(`/${accountSlug}/${settingsItem.href}`)
                    ? "bg-primary text-primary-foreground shadow-sm" 
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <settingsItem.icon className="h-4 w-4" />
                {settingsItem.label}
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {settingsItem.description}
            </TooltipContent>
          </Tooltip>
        </nav>
        
        {/* Bottom section */}
        <div className="border-t p-4">
          <div className="flex items-center justify-between">
            <UserButton 
              afterSignOutUrl="/"
              appearance={{
                elements: {
                  avatarBox: "h-9 w-9",
                },
              }}
            />
            <NotificationBell accountSlug={accountSlug} />
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}
