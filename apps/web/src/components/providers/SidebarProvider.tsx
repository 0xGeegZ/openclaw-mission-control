"use client";

import { ReactNode, useState, useCallback } from "react";
import { SidebarContext } from "@/lib/hooks/useSidebar";

interface SidebarProviderProps {
  children: ReactNode;
  defaultCollapsed?: boolean;
}

/**
 * Provides sidebar state to dashboard pages.
 */
export function SidebarProvider({ 
  children, 
  defaultCollapsed = false 
}: SidebarProviderProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  
  const toggleSidebar = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);
  
  const value = {
    isCollapsed,
    setIsCollapsed,
    toggleSidebar,
  };
  
  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  );
}
