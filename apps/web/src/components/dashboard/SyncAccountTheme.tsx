"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useAccount } from "@/lib/hooks/useAccount";

/**
 * Syncs account.settings.theme to next-themes when account loads.
 * Ensures workspace theme preference is applied across the dashboard.
 */
export function SyncAccountTheme() {
  const { account } = useAccount();
  const { setTheme } = useTheme();
  const theme = (account as { settings?: { theme?: string } } | undefined)?.settings?.theme;

  useEffect(() => {
    if (theme && (theme === "light" || theme === "dark" || theme === "system")) {
      setTheme(theme);
    }
  }, [theme, setTheme]);

  return null;
}
