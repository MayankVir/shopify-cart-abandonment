import { currentUser } from "@clerk/nextjs/server";
import { AppHeader } from "@/components/app-header";
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
    <div className="min-h-screen bg-background">
      <AppHeader showAdminLink={isAdminEmail(email)} />
      <main className="mx-auto max-w-page px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
