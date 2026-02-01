"use client";

import { createContext, useContext } from "react";

/**
 * Sidebar context for managing collapsed state.
 */
export interface SidebarContextValue {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
}

export const SidebarContext = createContext<SidebarContextValue | null>(null);

/**
 * Hook to access sidebar context.
 * Must be used within SidebarProvider.
 */
export function useSidebar(): SidebarContextValue {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within SidebarProvider");
  }
  return context;
}
