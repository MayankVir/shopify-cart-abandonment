"use client";

import { UserButton } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/theme-toggle";

export function AppTopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-2 border-b border-border bg-background/80 px-6 backdrop-blur-md">
      <ThemeToggle />
      <UserButton afterSignOutUrl="/sign-in" />
    </header>
  );
}
