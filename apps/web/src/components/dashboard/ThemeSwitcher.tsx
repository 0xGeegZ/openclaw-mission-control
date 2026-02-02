"use client";

import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@packages/ui/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@packages/ui/components/tooltip";

interface ThemeSwitcherProps {
  isCollapsed?: boolean;
}

const themes = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function ThemeSwitcher({ isCollapsed = false }: ThemeSwitcherProps) {
  const { theme, setTheme } = useTheme();

  if (isCollapsed) {
    // Cycle through themes on click when collapsed
    const cycleTheme = () => {
      const currentIndex = themes.findIndex((t) => t.value === theme);
      const nextIndex = (currentIndex + 1) % themes.length;
      setTheme(themes[nextIndex].value);
    };

    const currentTheme = themes.find((t) => t.value === theme) || themes[2];
    const CurrentIcon = currentTheme.icon;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={cycleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            aria-label={`Current theme: ${currentTheme.label}. Click to change.`}
          >
            <CurrentIcon className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          Theme: {currentTheme.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
      {themes.map(({ value, label, icon: Icon }) => (
        <Tooltip key={value}>
          <TooltipTrigger asChild>
            <button
              onClick={() => setTheme(value)}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                theme === value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-label={`Set ${label} theme`}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {label}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
