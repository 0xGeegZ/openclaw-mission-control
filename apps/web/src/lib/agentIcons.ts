import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Code2,
  Crown,
  FileText,
  Palette,
  PenLine,
  TestTube,
  Users,
  Wrench,
} from "lucide-react";

/**
 * Map of allowed agent icon names to Lucide components.
 * Use this for lookups in render (not getAgentIconComponent) to satisfy react-hooks/static-components.
 * Unknown or empty names are not in the map; callers should fall back to initials or Bot.
 */
export const AGENT_ICON_MAP: Record<string, LucideIcon> = {
  Bot,
  Code2,
  Crown,
  FileText,
  Palette,
  PenLine,
  TestTube,
  Users,
  Wrench,
};

/** Sorted allowlist of icon names for dropdowns and validation. */
export const AGENT_ICON_NAMES = Object.keys(AGENT_ICON_MAP).sort();

/**
 * Returns the Lucide component for an icon name, or Bot for unknown/empty.
 * Use in forms or select options; in render paths use AGENT_ICON_MAP lookup instead.
 */
export function getAgentIconComponent(name: string | undefined): LucideIcon {
  if (!name || !AGENT_ICON_MAP[name]) {
    return Bot;
  }
  return AGENT_ICON_MAP[name];
}
