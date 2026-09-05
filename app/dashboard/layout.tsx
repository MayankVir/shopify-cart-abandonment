import { getStoresForDashboard } from "@/app/actions/store";
import { getMerchantBillingSummary } from "@/app/actions/billing";
import { getPendingInviteCountForMe } from "@/app/actions/store-team";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { isAdminEmail } from "@/lib/admin-gate";
import { getAuthState, getSignedInEmail } from "@/lib/clerk-user";
import { buildSidebarAccountSummary } from "@/lib/sidebar-account";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await getAuthState();
  const email = userId ? await getSignedInEmail() : null;
  const stores = await getStoresForDashboard();
  const pendingInviteCount = userId ? await getPendingInviteCountForMe() : 0;

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
      showAdminLink={isAdminEmail(email)}
      account={account}
      pendingInviteCount={pendingInviteCount}
    >
      {children}
    </DashboardShell>
  );
}
