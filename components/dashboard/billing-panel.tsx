"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CreditCard, Clock, Loader2, PhoneCall, Wallet } from "lucide-react";
import { AnalyticsDateRangeSelect } from "@/components/dashboard/analytics-date-range-select";
import { TtaiTimeSeriesPanel } from "@/components/dashboard/ttai-time-series-panel";
import { useStoreAnalytics } from "@/hooks/use-store-analytics";
import { type AnalyticsDateRange } from "@/lib/analytics";
import { useAnalyticsStore } from "@/store/use-analytics-store";
import {
  getMerchantBillingOverview,
  previewTopUpMinutes,
  startTopUpCheckout,
  syncBillingTopUps,
} from "@/app/actions/billing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatMinutes } from "@/lib/analytics";

const PRESET_AMOUNTS = [10, 30, 50, 100];

export function BillingPanel() {
  const searchParams = useSearchParams();
  const [dateRange, setDateRange] = useState<AnalyticsDateRange>("30d");
  const selectedStoreDomain = useAnalyticsStore((s) => s.selectedStoreDomain);
  const { data } = useStoreAnalytics(dateRange);
  const [billing, setBilling] = useState<Awaited<
    ReturnType<typeof getMerchantBillingOverview>
  > | null>(null);
  const [amountUsd, setAmountUsd] = useState("30");
  const [previewMinutes, setPreviewMinutes] = useState<number | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const topUpStatus = searchParams.get("topup");

  const loadBilling = () => {
    getMerchantBillingOverview().then(setBilling);
  };

  const syncPending = async () => {
    setSyncing(true);
    await syncBillingTopUps();
    loadBilling();
    setSyncing(false);
  };

  useEffect(() => {
    loadBilling();
  }, []);

  useEffect(() => {
    if (topUpStatus !== "success") return;

    setSyncing(true);
    syncBillingTopUps()
      .then(() => loadBilling())
      .finally(() => setSyncing(false));
  }, [topUpStatus]);

  useEffect(() => {
    const parsed = Number(amountUsd);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setPreviewMinutes(null);
      return;
    }

    const timer = setTimeout(() => {
      previewTopUpMinutes(parsed).then(setPreviewMinutes);
    }, 200);

    return () => clearTimeout(timer);
  }, [amountUsd]);

  const rate = billing?.ratePerMinuteUsd ?? 0.08;
  const estimatedCost = (data.summary.totalMinutes * rate).toFixed(2);
  const creditBalance = billing?.creditBalanceMinutes ?? 0;

  const statusMessage = useMemo(() => {
    if (topUpStatus === "success") {
      return "Payment received. Your minutes will appear shortly after confirmation.";
    }
    if (topUpStatus === "cancelled") {
      return "Checkout was cancelled. No charge was made.";
    }
    return null;
  }, [topUpStatus]);

  async function handleTopUp() {
    setCheckoutError(null);
    setCheckoutLoading(true);

    const parsed = Number(amountUsd);
    const result = await startTopUpCheckout(parsed);

    setCheckoutLoading(false);

    if (!result.success || !result.checkoutUrl) {
      setCheckoutError(result.error ?? "Could not start checkout");
      return;
    }

    window.location.href = result.checkoutUrl;
  }

  return (
    <div className="space-y-6">
      {statusMessage ? (
        <div
          className={`rounded-md border px-3 py-2 text-xs ${
            topUpStatus === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          }`}
        >
          {statusMessage}
        </div>
      ) : null}

      <Card>
        <CardHeader className="space-y-1 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base font-semibold">Add minutes</CardTitle>
            <Badge variant="outline" className="font-mono text-xs">
              {creditBalance.toFixed(2)} min · ${rate.toFixed(2)}/min
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Shared balance across all stores. Min $5, max $500.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex flex-wrap gap-1.5">
              {PRESET_AMOUNTS.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  variant={amountUsd === String(preset) ? "default" : "outline"}
                  size="sm"
                  className="h-8 min-w-[3.25rem] px-2.5 text-xs"
                  onClick={() => setAmountUsd(String(preset))}
                >
                  ${preset}
                </Button>
              ))}
            </div>

            <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
              <div className="relative w-[7.5rem]">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  id="topup-amount"
                  type="number"
                  min={5}
                  max={500}
                  step="1"
                  value={amountUsd}
                  onChange={(e) => setAmountUsd(e.target.value)}
                  className="h-9 pl-7 pr-2 text-sm"
                />
              </div>

              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {previewMinutes != null
                  ? `→ ${previewMinutes.toFixed(0)} min`
                  : "$5–$500"}
              </span>

              <Button
                type="button"
                onClick={handleTopUp}
                disabled={checkoutLoading || !billing?.paymentsEnabled}
                size="sm"
                className="h-9 shrink-0"
              >
                {checkoutLoading ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Redirecting…
                  </>
                ) : (
                  "Pay"
                )}
              </Button>
            </div>
          </div>

          {checkoutError ? (
            <p className="text-xs text-destructive">{checkoutError}</p>
          ) : null}

          {!billing?.paymentsEnabled ? (
            <p className="text-xs text-muted-foreground">
              Payments not configured. Contact support or use admin grants.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant={data.source === "ttai" ? "success" : "secondary"}>
            {data.source === "ttai"
              ? "TTAI unified analytics"
              : "Local DB fallback"}
          </Badge>
          <Badge variant="outline">
            Account balance: {creditBalance.toFixed(2)} min
          </Badge>
        </div>
        <AnalyticsDateRangeSelect value={dateRange} onChange={setDateRange} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Account Minutes
            </CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{creditBalance.toFixed(2)}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Shared across all your stores
            </p>
          </CardContent>
        </Card>

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
              {selectedStoreDomain ? "Selected store" : "Select a store"}
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
              {data.summary.totalMinutes} min in period
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
            <div className="text-3xl font-bold">${estimatedCost}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              @ ${rate.toFixed(2)}/min USD
            </p>
          </CardContent>
        </Card>
      </div>

      {billing?.recentTopUps?.length ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Recent top-ups</CardTitle>
            {billing.recentTopUps.some((t) => t.status === "PENDING") ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={syncing}
                onClick={syncPending}
              >
                {syncing ? (
                  <>
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    Syncing…
                  </>
                ) : (
                  "Sync pending"
                )}
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {billing.recentTopUps.map((topUp) => (
                <li
                  key={topUp.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <span>
                    ${topUp.amountUsd.toFixed(2)} →{" "}
                    {topUp.minutesToGrant.toFixed(2)} min
                  </span>
                  <Badge
                    variant={
                      topUp.status === "COMPLETED" ? "success" : "secondary"
                    }
                  >
                    {topUp.status.toLowerCase()}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <TtaiTimeSeriesPanel
        points={data.timeSeries}
        scenarioName={data.scenarioName}
      />
    </div>
  );
}
