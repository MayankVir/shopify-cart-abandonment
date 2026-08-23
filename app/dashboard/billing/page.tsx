import { Suspense } from "react";
import { BillingPanel } from "@/components/dashboard/billing-panel";
import {
  ChartCardSkeleton,
  MetricsGridSkeleton,
} from "@/components/dashboard/dashboard-page-skeleton";

export default function BillingPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your call minute balance and view usage
        </p>
      </div>

      <Suspense
        fallback={
          <div className="space-y-6">
            <MetricsGridSkeleton count={4} />
            <ChartCardSkeleton />
          </div>
        }
      >
        <BillingPanel />
      </Suspense>
    </div>
  );
}
