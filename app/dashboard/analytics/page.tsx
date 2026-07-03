import { getStoresForDashboard } from "@/app/actions/store";
import { AnalyticsPageContent } from "@/components/dashboard/analytics-page-content";
import { DashboardHydrator } from "@/components/dashboard/dashboard-hydrator";

export default async function AnalyticsPage() {
  const stores = await getStoresForDashboard();

  return (
    <>
      <DashboardHydrator initialStores={stores} />
      <AnalyticsPageContent stores={stores} />
    </>
  );
}
