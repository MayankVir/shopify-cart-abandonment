"use client";

import type { getStoresForDashboard } from "@/app/actions/store";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { AppTopBar } from "@/components/dashboard/app-top-bar";
import { DashboardHydrator } from "@/components/dashboard/dashboard-hydrator";
import {
  NavPendingProvider,
  PendingPageSlot,
} from "@/components/dashboard/nav-pending";
import { StoresProvider } from "@/components/dashboard/stores-context";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

import type { SidebarAccountSummary } from "@/components/dashboard/sidebar-user";

const PREFETCH_MAIN = [
  "/dashboard/analytics",
  "/dashboard/recovery",
  "/dashboard/ndrc",
  "/dashboard/logs",
  "/dashboard/billing",
  "/dashboard/onboarding",
];

const PREFETCH_LIMITED = ["/dashboard/welcome", "/dashboard/onboarding"];

interface DashboardShellProps {
  children: React.ReactNode;
  stores: Awaited<ReturnType<typeof getStoresForDashboard>>;
  showAdminLink?: boolean;
  hasWorkspace?: boolean;
  canSeeTeamAndDrafts?: boolean;
  onboardingSkipped?: boolean;
  account: SidebarAccountSummary | null;
  pendingInviteCount?: number;
}

export function DashboardShell({
  children,
  stores,
  showAdminLink = false,
  hasWorkspace = false,
  canSeeTeamAndDrafts = false,
  onboardingSkipped = false,
  account,
  pendingInviteCount = 0,
}: DashboardShellProps) {
  const locked = !hasWorkspace && !showAdminLink;
  const prefetchHrefs = locked
    ? PREFETCH_LIMITED
    : [
        ...PREFETCH_MAIN,
        ...(canSeeTeamAndDrafts
          ? ["/dashboard/team", "/dashboard/drafts"]
          : []),
        ...(showAdminLink ? ["/dashboard/admin"] : []),
      ];

  return (
    <StoresProvider firstStoreDomain={stores[0]?.storeDomain ?? null}>
    <SidebarProvider>
      <NavPendingProvider prefetchHrefs={prefetchHrefs}>
        <AppSidebar
          showAdminLink={showAdminLink}
          hasWorkspace={hasWorkspace}
          canSeeTeamAndDrafts={canSeeTeamAndDrafts}
          onboardingSkipped={onboardingSkipped}
          account={account}
          pendingInviteCount={pendingInviteCount}
        />
        <SidebarInset>
          <DashboardHydrator initialStores={stores} />
          <AppTopBar stores={stores} />
          <div className="flex flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-page">
              <PendingPageSlot>{children}</PendingPageSlot>
            </div>
          </div>
        </SidebarInset>
      </NavPendingProvider>
    </SidebarProvider>
    </StoresProvider>
  );
}
