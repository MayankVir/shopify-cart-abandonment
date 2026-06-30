import { requireAdmin } from "@/lib/admin-gate";
import { getAllStoresForAdmin } from "@/app/actions/store";
import { AdminStoresTable } from "@/components/admin/admin-stores-table";
import { AppHeader } from "@/components/app-header";

export default async function AdminPage() {
  await requireAdmin();
  const stores = await getAllStoresForAdmin();

  return (
    <div className="min-h-screen bg-background">
      <AppHeader showAdminLink />
      <main className="mx-auto max-w-page space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Platform Admin</h1>
          <p className="mt-1 text-muted-foreground">
            Manage TTAI voice scenario and trunk bindings for all registered merchants
          </p>
        </div>
        <AdminStoresTable stores={stores} />
      </main>
    </div>
  );
}
