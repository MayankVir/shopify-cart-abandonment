"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { StoreAnalyticsView } from "@/app/actions/analytics";
import { getStoresForDashboard } from "@/app/actions/store";
import { AnalyticsDateRangeSelect } from "@/components/dashboard/analytics-date-range-select";
import {
  AnalyticsEmptyState,
  AnalyticsMetricsGrid,
} from "@/components/dashboard/analytics-metrics-grid";
import { CallLogPanel } from "@/components/dashboard/call-log-panel";
import { StoreSelector } from "@/components/dashboard/store-selector";
import { TtaiTimeSeriesPanel } from "@/components/dashboard/ttai-time-series-panel";
import { useStoreAnalytics } from "@/hooks/use-store-analytics";
import { type AnalyticsDateRange } from "@/lib/analytics";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDuration } from "@/lib/analytics";
import { STATUS_VARIANT, formatCallStatus } from "@/lib/call-status";
import { formatCurrency, formatPhoneNumber } from "@/lib/utils";

interface AnalyticsPageContentProps {
  stores: Awaited<ReturnType<typeof getStoresForDashboard>>;
}

export function AnalyticsPageContent({ stores }: AnalyticsPageContentProps) {
  const [dateRange, setDateRange] = useState<AnalyticsDateRange>("30d");
  const { data, isLoading, selectedStoreDomain } = useStoreAnalytics(dateRange);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="mt-1 text-muted-foreground">
            Call volume and minutes from TTAI unified analytics
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <AnalyticsDateRangeSelect value={dateRange} onChange={setDateRange} />
          <StoreSelector stores={stores} />
        </div>
      </div>

      {selectedStoreDomain ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={data.source === "ttai" ? "success" : "secondary"}>
              {data.source === "ttai" ? "TTAI unified analytics" : "Local DB"}
            </Badge>
            {data.scenarioName && (
              <span className="text-sm text-muted-foreground">
                Scenario: {data.scenarioName}
                {data.avgScore != null ? ` · avg score ${data.avgScore}` : ""}
              </span>
            )}
            {data.ttaiError && (
              <span className="text-xs text-amber-400">{data.ttaiError}</span>
            )}
          </div>

          {isLoading && data.attempts.length === 0 ? (
            <Card className="border-border/60">
              <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading analytics…
              </CardContent>
            </Card>
          ) : (
            <>
              <AnalyticsMetricsGrid summary={data.summary} />
              <TtaiTimeSeriesPanel
                points={data.timeSeries}
                scenarioName={data.scenarioName}
              />
              <CallAttemptsTable attempts={data.attempts} summary={data.summary} />
              <CallLogPanel />
            </>
          )}
        </>
      ) : (
        <AnalyticsEmptyState />
      )}
    </div>
  );
}

function CallAttemptsTable({
  attempts,
  summary,
}: {
  attempts: StoreAnalyticsView["attempts"];
  summary: StoreAnalyticsView["summary"];
}) {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle>Call log</CardTitle>
        <CardDescription>
          {summary.totalCalls} calls · {summary.totalMinutes} min consumed
        </CardDescription>
      </CardHeader>
      <CardContent>
        {attempts.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No calls yet for this store.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Cart</TableHead>
                  <TableHead>Trigger</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attempts.map((attempt) => (
                  <TableRow key={attempt.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {new Date(attempt.startedAt).toLocaleString([], {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {formatPhoneNumber(attempt.customerPhone) || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[attempt.status]}>
                        {formatCallStatus(attempt.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDuration(attempt.durationSec)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatCurrency(attempt.cartValue)}
                    </TableCell>
                    <TableCell className="text-sm capitalize text-muted-foreground">
                      {attempt.trigger}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
