import { NdrcPanel } from "@/components/dashboard/ndrc-panel";

export default function NdrcPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">NDRC</h1>
        <p className="mt-1 text-muted-foreground">
          Sync non-delivered orders and dispatch confirmation calls to reduce
          RTO
        </p>
      </div>

      <NdrcPanel />
    </div>
  );
}
