import { BillingPanel } from "@/components/dashboard/billing-panel";

export default function BillingPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
        <p className="mt-1 text-muted-foreground">
          Track call minutes consumed via Tough Tongue AI sessions
        </p>
      </div>

      <BillingPanel />
    </div>
  );
}
