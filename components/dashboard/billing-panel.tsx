"use client";

import { useState } from "react";
import { CreditCard, Clock, PhoneCall } from "lucide-react";
import { AnalyticsDateRangeSelect } from "@/components/dashboard/analytics-date-range-select";
import { TtaiTimeSeriesPanel } from "@/components/dashboard/ttai-time-series-panel";
import { useStoreAnalytics } from "@/hooks/use-store-analytics";
import { type AnalyticsDateRange } from "@/lib/analytics";
import { useAnalyticsStore } from "@/store/use-analytics-store";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMinutes } from "@/lib/analytics";

const RATE_PER_MINUTE_INR = 5;

export function BillingPanel() {
  const [dateRange, setDateRange] = useState<AnalyticsDateRange>("30d");
  const selectedStoreDomain = useAnalyticsStore((s) => s.selectedStoreDomain);
  const { data } = useStoreAnalytics(dateRange);

  if (!selectedStoreDomain) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Select a store to view billing usage
        </CardContent>
      </Card>
    );
  }

  const estimatedCost = (data.summary.totalMinutes * RATE_PER_MINUTE_INR).toFixed(
    2
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Badge variant={data.source === "ttai" ? "success" : "secondary"}>
          {data.source === "ttai"
            ? "TTAI unified analytics"
            : "Local DB fallback"}
        </Badge>
        <AnalyticsDateRangeSelect value={dateRange} onChange={setDateRange} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Sessions
            </CardTitle>
            <PhoneCall className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.summary.totalCalls}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              From TTAI unified analytics
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Minutes Consumed
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatMinutes(data.summary.totalDurationSec)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {data.summary.totalMinutes} min billed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Estimated Usage
            </CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">₹{estimatedCost}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              @ ₹{RATE_PER_MINUTE_INR}/min (placeholder rate)
            </p>
          </CardContent>
        </Card>
      </div>

      <TtaiTimeSeriesPanel
        points={data.timeSeries}
        scenarioName={data.scenarioName}
      />
    </div>
  );
}
