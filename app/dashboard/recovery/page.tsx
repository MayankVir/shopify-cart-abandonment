import { getStoresForDashboard } from "@/app/actions/store";
import { AbandonedCheckoutsPanel } from "@/components/dashboard/abandoned-checkouts-panel";
import { DashboardHydrator } from "@/components/dashboard/dashboard-hydrator";
import { StoreSelector } from "@/components/dashboard/store-selector";

export default async function RecoveryPage() {
  const stores = await getStoresForDashboard();

  return (
    <div className="space-y-8">
      <DashboardHydrator initialStores={stores} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Recovery</h1>
          <p className="mt-1 text-muted-foreground">
            Sync abandoned checkouts and dispatch recovery calls
          </p>
        </div>
        <StoreSelector stores={stores} />
      </div>

      <AbandonedCheckoutsPanel />
    </div>
  );
}
