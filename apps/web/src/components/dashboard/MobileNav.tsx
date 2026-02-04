"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, LayoutDashboard, X } from "lucide-react";
import { Button } from "@packages/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@packages/ui/components/sheet";
import { Sidebar } from "./Sidebar";

interface MobileNavProps {
  accountSlug: string;
}

/**
 * Mobile navigation with slide-out sidebar.
 */
export function MobileNav({ accountSlug }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card/95 backdrop-blur-sm px-3 lg:hidden sticky top-0 z-50">
      <Link
        href={`/${accountSlug}/tasks`}
        className="flex items-center gap-2 group"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary transition-transform group-hover:scale-105 group-active:scale-95">
          <LayoutDashboard className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-semibold text-foreground text-sm truncate max-w-[180px]">
          Mission Control
        </span>
      </Link>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-9 w-9 shrink-0"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            <span className="sr-only">Toggle menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent 
          side="left" 
          className="p-0 w-[280px] max-w-[85vw]" 
          showCloseButton={false}
        >
          <Sidebar accountSlug={accountSlug} />
        </SheetContent>
      </Sheet>
    </header>
  );
}
