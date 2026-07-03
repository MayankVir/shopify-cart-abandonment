import { currentUser } from "@clerk/nextjs/server";
import { getStoresForDashboard } from "@/app/actions/store";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { isAdminEmail } from "@/lib/admin-gate";

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

  return (
    <DashboardShell stores={stores} showAdminLink={isAdminEmail(email)}>
      {children}
    </DashboardShell>
  );
}
