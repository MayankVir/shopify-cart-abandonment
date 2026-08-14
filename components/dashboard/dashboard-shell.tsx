"use client";

import type { getStoresForDashboard } from "@/app/actions/store";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { AppTopBar } from "@/components/dashboard/app-top-bar";
import { DashboardHydrator } from "@/components/dashboard/dashboard-hydrator";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

import type { SidebarAccountSummary } from "@/components/dashboard/sidebar-user";

interface DashboardShellProps {
  children: React.ReactNode;
  stores: Awaited<ReturnType<typeof getStoresForDashboard>>;
  showAdminLink?: boolean;
  account: SidebarAccountSummary | null;
}

export function DashboardShell({
  children,
  stores,
  showAdminLink = false,
  account,
}: DashboardShellProps) {
  return (
    <SidebarProvider>
      <AppSidebar showAdminLink={showAdminLink} account={account} />
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
