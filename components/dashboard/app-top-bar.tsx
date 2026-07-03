"use client";

import type { getStoresForDashboard } from "@/app/actions/store";
import { StoreSelector } from "@/components/dashboard/store-selector";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

interface AppTopBarProps {
  stores: Awaited<ReturnType<typeof getStoresForDashboard>>;
}

export function AppTopBar({ stores }: AppTopBarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4 sm:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <div className="flex min-w-0 flex-1 items-center">
        <StoreSelector stores={stores} />
      </div>
      <ThemeToggle />
    </header>
  );
}
