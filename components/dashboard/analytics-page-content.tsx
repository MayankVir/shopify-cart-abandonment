"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { AnalyticsDateRangeSelect } from "@/components/dashboard/analytics-date-range-select";
import {
  AnalyticsEmptyState,
  AnalyticsMetricsGrid,
} from "@/components/dashboard/analytics-metrics-grid";
import { CallLogPanel } from "@/components/dashboard/call-log-panel";
import { TtaiTimeSeriesPanel } from "@/components/dashboard/ttai-time-series-panel";
import { useStoreAnalytics } from "@/hooks/use-store-analytics";
import {
  analyticsDateRangeToIso,
  type AnalyticsDateRange,
} from "@/lib/analytics";
import { Card, CardContent } from "@/components/ui/card";

export function AnalyticsPageContent() {
  const [dateRange, setDateRange] = useState<AnalyticsDateRange>("30d");
  const { data, isLoading, selectedStoreDomain } = useStoreAnalytics(dateRange);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="mt-1 text-muted-foreground">
            Call volume and minutes from TTAI unified analytics
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <AnalyticsDateRangeSelect value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      {selectedStoreDomain ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
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
              <CallLogPanel
                summary={data.summary}
                since={analyticsDateRangeToIso(dateRange).startDate}
              />
            </>
          )}
        </>
      ) : (
        <AnalyticsEmptyState />
      )}
    </div>
  );
}

