"use client";

import type { getStoresForDashboard } from "@/app/actions/store";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { AppTopBar } from "@/components/dashboard/app-top-bar";
import { DashboardHydrator } from "@/components/dashboard/dashboard-hydrator";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

interface DashboardShellProps {
  children: React.ReactNode;
  stores: Awaited<ReturnType<typeof getStoresForDashboard>>;
  showAdminLink?: boolean;
}

export function DashboardShell({
  children,
  stores,
  showAdminLink = false,
}: DashboardShellProps) {
  return (
    <SidebarProvider>
      <AppSidebar showAdminLink={showAdminLink} />
      <SidebarInset>
        <DashboardHydrator initialStores={stores} />
        <AppTopBar stores={stores} />
        <div className="flex flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-page">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
