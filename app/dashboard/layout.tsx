import { currentUser } from "@clerk/nextjs/server";
import { getStoresForDashboard } from "@/app/actions/store";
import { getMerchantBillingOverview } from "@/app/actions/billing";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { isAdminEmail } from "@/lib/admin-gate";
import { buildSidebarAccountSummary } from "@/lib/sidebar-account";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  const email =
    user?.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
      ?.emailAddress ?? user?.emailAddresses[0]?.emailAddress;
  const stores = await getStoresForDashboard();

  const billing = user ? await getMerchantBillingOverview() : null;
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
    >
      {children}
    </DashboardShell>
  );
}
