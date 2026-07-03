import { AbandonedCheckoutsPanel } from "@/components/dashboard/abandoned-checkouts-panel";

export default function RecoveryPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Recovery</h1>
        <p className="mt-1 text-muted-foreground">
          Sync abandoned checkouts and dispatch recovery calls
        </p>
      </div>

      <AbandonedCheckoutsPanel />
    </div>
  );
}
