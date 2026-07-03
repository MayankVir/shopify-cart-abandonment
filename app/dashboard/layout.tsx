import { currentUser } from "@clerk/nextjs/server";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { AppTopBar } from "@/components/dashboard/app-top-bar";
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

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar showAdminLink={isAdminEmail(email)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopBar />
        <main className="flex-1 overflow-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-page">{children}</div>
        </main>
      </div>
    </div>
  );
}
