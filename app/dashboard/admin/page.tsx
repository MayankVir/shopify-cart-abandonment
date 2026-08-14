import { requireAdmin } from "@/lib/admin-gate";
import { getAllStoresForAdmin } from "@/app/actions/store";
import { AdminStoresTable } from "@/components/admin/admin-stores-table";
import {
  AdminBillingSettings,
  AdminGrantHistory,
  AdminGrantMinutes,
} from "@/components/admin/admin-billing-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default async function AdminPage() {
  await requireAdmin();
  const stores = await getAllStoresForAdmin();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Platform Admin</h1>
        <p className="mt-1 text-muted-foreground">
          Manage billing, TTAI bindings, and merchant accounts
        </p>
      </div>

      <Tabs defaultValue="billing">
        <TabsList>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="grants">Grant Minutes</TabsTrigger>
          <TabsTrigger value="history">Grant History</TabsTrigger>
          <TabsTrigger value="ttai">TTAI Bindings</TabsTrigger>
        </TabsList>

        <TabsContent value="billing" className="mt-6">
          <AdminBillingSettings />
        </TabsContent>

        <TabsContent value="grants" className="mt-6">
          <AdminGrantMinutes />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <AdminGrantHistory />
        </TabsContent>

        <TabsContent value="ttai" className="mt-6">
          <AdminStoresTable stores={stores} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
