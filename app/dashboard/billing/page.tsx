import { getStoresForDashboard } from "@/app/actions/store";
import { BillingPanel } from "@/components/dashboard/billing-panel";
import { DashboardHydrator } from "@/components/dashboard/dashboard-hydrator";
import { StoreSelector } from "@/components/dashboard/store-selector";

export default async function BillingPage() {
  const stores = await getStoresForDashboard();

  return (
    <div className="space-y-8">
      <DashboardHydrator initialStores={stores} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
          <p className="mt-1 text-muted-foreground">
            Track call minutes consumed via Tough Tongue AI sessions
          </p>
        </div>
        <StoreSelector stores={stores} />
      </div>

      <BillingPanel />
    </div>
  );
}
