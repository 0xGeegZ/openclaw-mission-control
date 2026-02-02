import { ReactNode } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { MobileNav } from "@/components/dashboard/MobileNav";
import { SyncAccountTheme } from "@/components/dashboard/SyncAccountTheme";
import { AccountProvider } from "@/components/providers/AccountProvider";
import { SidebarProvider } from "@/components/providers/SidebarProvider";

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
      <SyncAccountTheme />
      <SidebarProvider>
        <div className="flex h-screen">
          {/* Desktop sidebar */}
          <aside className="hidden lg:block shrink-0 z-40">
            <Sidebar accountSlug={accountSlug} />
          </aside>
          
          {/* Main content area */}
          <div className="flex flex-1 flex-col overflow-hidden min-w-0">
            {/* Mobile nav */}
            <MobileNav accountSlug={accountSlug} />
            
            {/* Page content */}
            <main className="flex-1 overflow-auto">
              {children}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </AccountProvider>
  );
}
