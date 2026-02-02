"use client";

import { ReactNode, useState, useCallback } from "react";
import { SidebarContext } from "@/lib/hooks/useSidebar";

const SIDEBAR_STORAGE_KEY = "sidebar-collapsed";

interface SidebarProviderProps {
  children: ReactNode;
  defaultCollapsed?: boolean;
}

/**
 * Provides sidebar state to dashboard pages.
 * Persists collapsed state to localStorage.
 */
export function SidebarProvider({ 
  children, 
  defaultCollapsed = false 
}: SidebarProviderProps) {
  const [isCollapsed, setIsCollapsedState] = useState(() => {
    // Initialize from localStorage on client side
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (stored !== null) {
        return stored === "true";
      }
    }
    return defaultCollapsed;
  });
  
  // Persist to localStorage whenever state changes
  const setIsCollapsed = useCallback((collapsed: boolean) => {
    setIsCollapsedState(collapsed);
    if (typeof window !== "undefined") {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
    }
  }, []);
  
  const toggleSidebar = useCallback(() => {
    setIsCollapsedState((prev) => {
      const newValue = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(newValue));
      }
      return newValue;
    });
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
