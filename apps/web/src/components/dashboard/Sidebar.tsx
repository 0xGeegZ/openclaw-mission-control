"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare,
  FileText,
  Activity,
  Settings,
  Bot,
  PanelLeftClose,
  PanelLeft,
  Shield,
  Cpu,
  Server,
  Users,
  Search,
  BarChart3,
} from "lucide-react";
import { cn } from "@packages/ui/lib/utils";
import { AccountSwitcher } from "./AccountSwitcher";
import { NotificationBell } from "./NotificationBell";
import { Separator } from "@packages/ui/components/separator";
import { Button } from "@packages/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@packages/ui/components/tooltip";
import { useSidebar } from "@/lib/hooks/useSidebar";
import { useAccount } from "@/lib/hooks/useAccount";

/** Loaded client-only to avoid hydration mismatch (theme from next-themes is undefined on server). */
const ThemeSwitcher = dynamic(
  () => import("./ThemeSwitcher").then((m) => ({ default: m.ThemeSwitcher })),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex h-9 min-w-28 items-center gap-1 rounded-lg bg-muted p-1"
        aria-hidden
      />
    ),
  },
);

/** Loaded client-only to avoid hydration mismatch (Clerk’s server output differs from client). */
const SidebarUserButton = dynamic(
  () =>
    import("./SidebarUserButton").then((m) => ({
      default: m.SidebarUserButton,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-9 w-9 shrink-0 rounded-full bg-muted" aria-hidden />
    ),
  },
);

interface SidebarProps {
  accountSlug: string;
}

const navItems = [
  {
    href: "tasks",
    label: "Tasks",
    icon: CheckSquare,
    description: "Manage tasks",
    color: "text-emerald-500",
  },
  {
    href: "agents",
    label: "Agents",
    icon: Bot,
    description: "AI agent roster",
    color: "text-violet-500",
  },
  {
    href: "docs",
    label: "Documents",
    icon: FileText,
    description: "Shared documents",
    color: "text-blue-500",
  },
  {
    href: "feed",
    label: "Activity",
    icon: Activity,
    description: "Recent activity",
    color: "text-amber-500",
  },
  {
    href: "search",
    label: "Search",
    icon: Search,
    description: "Search tasks, docs, agents",
    color: "text-slate-500",
  },
  {
    href: "analytics",
    label: "Analytics",
    icon: BarChart3,
    description: "Workspace analytics",
    color: "text-cyan-500",
  },
];

const adminNavItems = [
  {
    href: "admin/openclaw",
    label: "OpenClaw",
    icon: Cpu,
    description: "OpenClaw configuration",
  },
  {
    href: "admin/fleet",
    label: "Fleet",
    icon: Server,
    description: "Runtime fleet and upgrades",
  },
  {
    href: "admin/members",
    label: "Members",
    icon: Users,
    description: "Manage team members",
  },
];

const settingsItem = {
  href: "settings",
  label: "Settings",
  icon: Settings,
  description: "Workspace settings",
};

/**
 * Dashboard sidebar with navigation.
 */
export function Sidebar({ accountSlug }: SidebarProps) {
  const pathname = usePathname();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const { isAdmin } = useAccount();

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300",
          isCollapsed ? "w-16" : "w-64",
        )}
      >
        {/* Logo/Brand */}
        <div className="flex h-16 items-center border-b px-3">
          <div
            className={cn(
              "flex items-center w-full",
              isCollapsed ? "justify-center" : "justify-between",
            )}
          >
            {isCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleSidebar}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary transition-transform hover:scale-105 shrink-0 cursor-pointer group"
                    aria-label="Expand sidebar"
                  >
                    <LayoutDashboard className="h-5 w-5 text-primary-foreground transition-opacity group-hover:opacity-0 absolute" />
                    <PanelLeft className="h-5 w-5 text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  Expand sidebar
                </TooltipContent>
              </Tooltip>
            ) : (
              <>
                <Link
                  href={`/${accountSlug}/tasks`}
                  className="flex items-center gap-2.5 group"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary transition-transform group-hover:scale-105 shrink-0">
                    <LayoutDashboard className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <span className="font-semibold text-foreground whitespace-nowrap">
                    Mission Control
                  </span>
                </Link>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={toggleSidebar}
                      className="h-8 w-8 shrink-0"
                    >
                      <PanelLeftClose className="h-4 w-4" />
                      <span className="sr-only">Collapse sidebar</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    Collapse sidebar
                  </TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </div>

        {/* Account Switcher */}
        {!isCollapsed && (
          <div className="p-4">
            <AccountSwitcher currentSlug={accountSlug} />
          </div>
        )}

        {!isCollapsed && <Separator />}

        {/* Navigation */}
        <nav className="flex-1 px-2 py-4">
          <div className="space-y-1">
            {navItems.map((item) => {
              const href = `/${accountSlug}/${item.href}`;
              const isActive = pathname.startsWith(href);
              const Icon = item.icon;

              return isCollapsed ? (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>
                    <Link
                      href={href}
                      className={cn(
                        "flex items-center justify-center rounded-xl text-sm font-medium transition-all duration-200 h-10 w-10 mx-auto",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-md"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", !isActive && item.color)} />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs font-medium">
                    {item.description}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Link
                  key={item.href}
                  href={href}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200 px-3 py-2.5",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className={cn(
                    "h-4 w-4 shrink-0 transition-colors",
                    isActive ? "" : item.color
                  )} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>

          <Separator className="my-4" />

          {isCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={`/${accountSlug}/${settingsItem.href}`}
                  className={cn(
                    "flex items-center justify-center rounded-xl text-sm font-medium transition-all duration-200 h-10 w-10 mx-auto",
                    pathname.startsWith(`/${accountSlug}/${settingsItem.href}`)
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <settingsItem.icon className="h-4 w-4 shrink-0" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs font-medium">
                {settingsItem.description}
              </TooltipContent>
            </Tooltip>
          ) : (
            <Link
              href={`/${accountSlug}/${settingsItem.href}`}
              className={cn(
                "flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200 px-3 py-2.5",
                pathname.startsWith(`/${accountSlug}/${settingsItem.href}`)
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <settingsItem.icon className="h-4 w-4 shrink-0" />
              {settingsItem.label}
            </Link>
          )}

          {/* Admin Section - only visible to admins/owners */}
          {isAdmin && (
            <>
              <Separator className="my-4" />

              {!isCollapsed && (
                <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">
                  <Shield className="h-3 w-3" />
                  Admin
                </div>
              )}

              <div className="space-y-1 mt-2">
                {adminNavItems.map((item) => {
                  const href = `/${accountSlug}/${item.href}`;
                  const isActive = pathname.startsWith(href);
                  const Icon = item.icon;

                  return isCollapsed ? (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>
                        <Link
                          href={href}
                          className={cn(
                            "flex items-center justify-center rounded-xl text-sm font-medium transition-all duration-200 h-10 w-10 mx-auto",
                            isActive
                              ? "bg-amber-500 text-white shadow-md"
                              : "text-muted-foreground hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400",
                          )}
                        >
                          <Icon className={cn("h-4 w-4 shrink-0", !isActive && "text-amber-500")} />
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs font-medium">
                        {item.description}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Link
                      key={item.href}
                      href={href}
                      className={cn(
                        "flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200 px-3 py-2.5",
                        isActive
                          ? "bg-amber-500 text-white shadow-md"
                          : "text-muted-foreground hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400",
                      )}
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", !isActive && "text-amber-500")} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </nav>

        {/* Bottom section */}
        <div className="border-t p-3">
          <div
            className={cn(
              "flex items-center",
              isCollapsed ? "flex-col gap-3" : "justify-between",
            )}
          >
            {/* When expanded: user first, then theme/notifications */}
            {/* When collapsed: theme/notifications first, then user at bottom */}
            {!isCollapsed && (
              <div className="flex items-center gap-2">
                <SidebarUserButton />
                <Link
                  href={`/${accountSlug}/profile`}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Profile
                </Link>
              </div>
            )}
            <div
              className={cn(
                "flex items-center",
                isCollapsed ? "flex-col gap-2" : "gap-2",
              )}
            >
              <ThemeSwitcher isCollapsed={isCollapsed} />
              <NotificationBell accountSlug={accountSlug} />
            </div>
            {isCollapsed && <SidebarUserButton />}
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}
