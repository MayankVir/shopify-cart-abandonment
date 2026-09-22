import { IntegrationLogsPanel } from "@/components/dashboard/integration-logs-panel";

export default function LogsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Logs</h1>
        <p className="mt-1 text-muted-foreground">
          Every webhook we received and every session poll we made, with what
          the handler did about it.
        </p>
      </div>

      <IntegrationLogsPanel />
    </div>
  );
}
