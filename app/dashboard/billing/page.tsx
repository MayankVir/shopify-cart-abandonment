import { Suspense } from "react";
import { BillingPanel } from "@/components/dashboard/billing-panel";
import { PageSpinner } from "@/components/dashboard/page-spinner";

export default function BillingPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your call minute balance and view usage
        </p>
      </div>

      <Suspense fallback={<PageSpinner />}>
        <BillingPanel />
      </Suspense>
    </div>
  );
}
