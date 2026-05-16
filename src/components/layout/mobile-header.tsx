"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, PenLine } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { Sidebar } from "@/components/layout/sidebar";

export function MobileHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="h-14 px-3 flex items-center gap-3 border-b border-border bg-background md:hidden shrink-0">
      <Sheet open={open} onOpenChange={setOpen}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="메뉴 열기"
        >
          <Menu className="h-5 w-5" />
        </button>

        <SheetContent
          side="left"
          className="p-0 w-64 [&>button]:hidden"
          aria-describedby={undefined}
        >
          <SheetTitle className="sr-only">내비게이션 메뉴</SheetTitle>
          <div className="h-full">
            <Sidebar onNavClick={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <Link
        href="/dashboard"
        className="flex items-center gap-2 text-foreground"
      >
        <PenLine className="h-5 w-5 text-primary" />
        <span className="font-semibold text-sm">IndiePost AI</span>
      </Link>
    </header>
  );
}
