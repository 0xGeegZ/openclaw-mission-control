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
