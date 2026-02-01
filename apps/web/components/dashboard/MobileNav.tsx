"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, LayoutDashboard } from "lucide-react";
import { Button } from "@packages/ui/components/button";
import { Sheet, SheetContent, SheetTrigger } from "@packages/ui/components/sheet";
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
    <div className="flex h-16 items-center justify-between border-b px-4 lg:hidden">
      <Link href={`/${accountSlug}/tasks`} className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <LayoutDashboard className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-semibold">Mission Control</span>
      </Link>
      
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-64">
          <Sidebar accountSlug={accountSlug} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
