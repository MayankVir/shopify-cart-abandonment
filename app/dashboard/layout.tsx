import { headers } from "next/headers";
import { getStoresForDashboard } from "@/app/actions/store";
import { getMerchantBillingSummary } from "@/app/actions/billing";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { isAdminEmail } from "@/lib/admin-gate";
import { getAuthState, getSignedInEmail } from "@/lib/clerk-user";
import {
  enforceDashboardPath,
  getDashboardAccess,
} from "@/lib/dashboard-access";
import { buildSidebarAccountSummary } from "@/lib/sidebar-account";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await getAuthState();
  const email = userId ? await getSignedInEmail() : null;
  const access = userId ? await getDashboardAccess() : null;
  const pathname = headers().get("x-pathname");
  if (access && pathname) {
    enforceDashboardPath(pathname, access);
  }

  const stores = await getStoresForDashboard();
  const billing = userId ? await getMerchantBillingSummary() : null;
  const account = billing
    ? buildSidebarAccountSummary({
        creditBalanceMinutes: billing.creditBalanceMinutes,
        ratePerMinuteUsd: billing.ratePerMinuteUsd,
        currency: billing.currency,
        storeCount: stores.length,
        freeMinutesGranted: billing.freeMinutesGranted,
        isAdmin: isAdminEmail(email),
      })
    : null;

  return (
    <DashboardShell
      stores={stores}
      showAdminLink={access?.isPlatformAdmin ?? isAdminEmail(email)}
      hasWorkspace={access?.hasWorkspace ?? false}
      canSeeTeamAndDrafts={access?.canSeeTeamAndDrafts ?? false}
      onboardingSkipped={access?.onboardingSkipped ?? false}
      account={account}
      pendingInviteCount={access?.pendingInviteCount ?? 0}
    >
      {children}
    </DashboardShell>
  );
}
