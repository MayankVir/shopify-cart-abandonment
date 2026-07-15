"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  Loader2,
  Phone,
  PhoneOff,
  RefreshCw,
  Settings2,
} from "lucide-react";
import {
  getAbandonedCheckoutsForStore,
  getCallAttemptsForCheckout,
  bulkStopRecoveryCallAction,
  initiateRecoveryCall,
  stopRecoveryCallAction,
  syncAbandonedCheckouts,
  type AbandonedCheckoutRow,
  type CallAttemptRow,
  type SheetPageInfo,
} from "@/app/actions/abandoned-checkouts";
import { formatTimeUntilCall } from "@/lib/shopify-admin";
import {
  STATUS_VARIANT,
  canInitiateCall,
  canStopCall,
  formatCallStatus,
  isActiveCall,
} from "@/lib/call-status";
import { useAnalyticsStore } from "@/store/use-analytics-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Collapsible, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RecoverySettings } from "@/components/dashboard/recovery-settings";
import { TtaiCallDetails } from "@/components/dashboard/ttai-call-details";
import { formatCurrency, formatPhoneNumber } from "@/lib/utils";
import { CallStatus } from "@prisma/client";

function TimeToCallCell({
  scheduledCallAt,
  callStatus,
}: {
  scheduledCallAt: string | null;
  callStatus: CallStatus;
}) {
  const [, tick] = useState(0);

  useEffect(() => {
    if (callStatus !== CallStatus.PENDING) return;
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [callStatus]);

  if (isActiveCall(callStatus)) {
    return <span className="text-sm text-blue-400">Calling now…</span>;
  }

  if (callStatus !== CallStatus.PENDING) {
    return (
      <span className="text-sm text-muted-foreground">
        {formatCallStatus(callStatus)}
      </span>
    );
  }

  const { label, isReady } = formatTimeUntilCall(
    scheduledCallAt ? new Date(scheduledCallAt) : null,
  );
  const scheduledDate = scheduledCallAt ? new Date(scheduledCallAt) : null;

  return (
    <div className="space-y-0.5">
      <span
        className={`text-sm font-medium ${isReady ? "text-emerald-400" : "text-amber-400"}`}
      >
        {isReady ? "Ready to call" : `In ${label}`}
      </span>
      {scheduledDate && !isReady && (
        <p className="text-xs text-muted-foreground">
          {scheduledDate.toLocaleString([], {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </p>
      )}
    </div>
  );
}

function CheckoutDetail({
  checkout,
  attempts,
}: {
  checkout: AbandonedCheckoutRow;
  attempts: CallAttemptRow[];
}) {
  return (
    <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3 text-sm">
      {checkout.lastError && (
        <p className="flex items-start gap-2 text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {checkout.lastError}
        </p>
      )}
      {checkout.draftOrderId && (
        <p>
          <span className="text-muted-foreground">Draft order: </span>
          <span className="font-mono text-xs">
            {checkout.draftOrderName || checkout.draftOrderId}
          </span>
        </p>
      )}
      {checkout.checkoutUrl && (
        <p>
          <span className="text-muted-foreground">Live cart checkout: </span>
          <a
            href={checkout.checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            Open checkout
          </a>
        </p>
      )}
      {attempts.map((a) => (
        <div key={a.id} className="space-y-2 border-t border-border/40 pt-3">
          <p className="text-xs text-muted-foreground">
            {a.trigger} · {formatCallStatus(a.status)} ·{" "}
            {new Date(a.startedAt).toLocaleString()}
          </p>
          {a.failureReason && (
            <p className="text-xs text-destructive">{a.failureReason}</p>
          )}
          <TtaiCallDetails
            transcript={a.transcript}
            aiSummary={undefined}
            toolCallsJson={a.toolCallsJson}
          />
        </div>
      ))}
    </div>
  );
}

function CheckoutRow({
  checkout,
  onRefresh,
  selectable,
  selected,
  onSelectedChange,
}: {
  checkout: AbandonedCheckoutRow;
  onRefresh: () => void;
  selectable: boolean;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [isStopping, startStopTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [attempts, setAttempts] = useState<CallAttemptRow[]>([]);

  useEffect(() => {
    if (!open) return;
    getCallAttemptsForCheckout(checkout.id).then(setAttempts);
  }, [open, checkout.id, checkout.callStatus]);

  function handleStopCall() {
    startStopTransition(async () => {
      const result = await stopRecoveryCallAction(checkout.id);
      if (!result.success) {
        toast.error(result.error ?? "Failed to stop call");
        return;
      }
      toast.success(
        isActiveCall(checkout.callStatus)
          ? "Call stopped"
          : "Scheduled call cancelled",
      );
      onRefresh();
    });
  }

  function handleCall() {
    startTransition(async () => {
      const result = await initiateRecoveryCall(checkout.id);
      if (!result.success) {
        toast.error(result.error ?? "Failed to initiate call");
        return;
      }
      toast.success(
        result.checkoutUrl
          ? "Call dispatched — cart checkout URL ready"
          : "Recovery call dispatched",
      );
      onRefresh();
    });
  }

  const showCallButton =
    canInitiateCall(checkout.callStatus) && checkout.customerPhone;
  const showStopButton = canStopCall(
    checkout.callStatus,
    checkout.callScheduled,
  );

  return (
    <>
      <TableRow data-state={selected ? "selected" : undefined}>
        <TableCell>
          <Checkbox
            checked={selected}
            disabled={!selectable}
            onCheckedChange={(checked) => onSelectedChange(checked === true)}
            aria-label={`Select checkout for ${checkout.customerPhone || checkout.customerEmail || "customer"}`}
          />
        </TableCell>
        <TableCell>
          <div className="space-y-0.5">
            <p className="font-mono text-sm">
              {checkout.customerPhone
                ? formatPhoneNumber(checkout.customerPhone)
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {checkout.customerEmail ?? "No email"}
            </p>
          </div>
        </TableCell>
        <TableCell className="font-medium">
          {formatCurrency(checkout.cartValue)}
        </TableCell>
        <TableCell className="max-w-[220px]">
          <p className="truncate text-sm" title={checkout.address || undefined}>
            {checkout.address || (
              <span className="text-muted-foreground">—</span>
            )}
          </p>
        </TableCell>
        <TableCell>
          <TimeToCallCell
            scheduledCallAt={checkout.scheduledCallAt}
            callStatus={checkout.callStatus}
          />
        </TableCell>
        <TableCell>
          <Badge variant={STATUS_VARIANT[checkout.callStatus]}>
            {formatCallStatus(checkout.callStatus)}
          </Badge>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-2">
            {showStopButton && (
              <Button
                size="sm"
                variant="destructive"
                onClick={handleStopCall}
                disabled={isStopping || isPending}
              >
                {isStopping ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <PhoneOff className="mr-1 h-3 w-3" />
                )}
                {isActiveCall(checkout.callStatus)
                  ? "Stop call"
                  : "Cancel schedule"}
              </Button>
            )}
            {showCallButton ? (
              <Button
                size="sm"
                onClick={handleCall}
                disabled={isPending || isStopping}
              >
                {isPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Phone className="mr-1 h-3 w-3" />
                )}
                Call now
              </Button>
            ) : !showStopButton ? (
              <Collapsible open={open} onOpenChange={setOpen}>
                <CollapsibleTrigger asChild>
                  <Button size="sm" variant="ghost">
                    Details
                  </Button>
                </CollapsibleTrigger>
              </Collapsible>
            ) : null}
          </div>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={8}>
            <CheckoutDetail checkout={checkout} attempts={attempts} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export function AbandonedCheckoutsPanel() {
  const selectedStoreDomain = useAnalyticsStore((s) => s.selectedStoreDomain);
  const callLogs = useAnalyticsStore((s) => s.callLogs);
  const [checkouts, setCheckouts] = useState<AbandonedCheckoutRow[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [isSyncing, startSync] = useTransition();
  const [showSettings, setShowSettings] = useState(false);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isBulkStopping, startBulkStop] = useTransition();
  const [dbPage, setDbPage] = useState(0);
  const [hasMoreDb, setHasMoreDb] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [shopifyPageInfo, setShopifyPageInfo] = useState<{
    hasNextPage: boolean;
    endCursor: string | null;
  } | null>(null);
  const [sheetPageInfo, setSheetPageInfo] = useState<SheetPageInfo | null>(
    null,
  );
  const [isLoadingMore, startLoadMore] = useTransition();
  const [isLoadingCheckouts, setIsLoadingCheckouts] = useState(false);

  const stoppableCheckouts = checkouts.filter((checkout) =>
    canStopCall(checkout.callStatus, checkout.callScheduled),
  );
  const selectedCount = selectedIds.size;
  const allStoppableSelected =
    stoppableCheckouts.length > 0 &&
    stoppableCheckouts.every((checkout) => selectedIds.has(checkout.id));
  const someStoppableSelected =
    stoppableCheckouts.some((checkout) => selectedIds.has(checkout.id)) &&
    !allStoppableSelected;
  const hasActiveCalls = checkouts.some((checkout) =>
    isActiveCall(checkout.callStatus),
  );
  const hasInFlightFromLogs = callLogs.some((log) =>
    isActiveCall(log.callStatus),
  );
  const shouldLiveRefreshOpenCheckouts = hasActiveCalls || hasInFlightFromLogs;

  const refreshOpenCheckouts = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!selectedStoreDomain) return;

      if (!silent) {
        setIsLoadingCheckouts(true);
      }

      try {
        const result = await getAbandonedCheckoutsForStore(
          selectedStoreDomain,
          0,
        );
        if (!result.success) return;

        setCheckouts(result.checkouts);
        setDbPage(result.page);
        setHasMoreDb(result.hasMore);
        setTotalCount(result.totalCount);
      } finally {
        if (!silent) {
          setIsLoadingCheckouts(false);
        }
      }
    },
    [selectedStoreDomain],
  );

  useEffect(() => {
    setSelectedIds(new Set());
    setDbPage(0);
    setHasMoreDb(false);
    setTotalCount(0);
    setShopifyPageInfo(null);
    setSheetPageInfo(null);
    setCheckouts([]);
    setIsLoadingCheckouts(true);
  }, [selectedStoreDomain]);

  function toggleCheckoutSelection(checkoutId: string, selected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) next.add(checkoutId);
      else next.delete(checkoutId);
      return next;
    });
  }

  function toggleSelectAllStoppable() {
    if (allStoppableSelected) {
      setSelectedIds(new Set());
      return;
    }

    setSelectedIds(new Set(stoppableCheckouts.map((checkout) => checkout.id)));
  }

  const runSync = useCallback(
    (options?: { shopifyAfter?: string | null; sheetPage?: number }) => {
      if (!selectedStoreDomain) return;

      startSync(async () => {
        const result = await syncAbandonedCheckouts(selectedStoreDomain, {
          shopifyAfter: options?.shopifyAfter,
          sheetPage: options?.sheetPage ?? 0,
          dbPage: 0,
        });
        if (!result.success) {
          toast.error(result.error ?? "Failed to sync checkouts", {
            duration: 12_000,
          });
          return;
        }
        setCheckouts(result.checkouts);
        setDbPage(result.page ?? 0);
        setHasMoreDb(result.hasMore ?? false);
        setTotalCount(result.totalCount ?? result.checkouts.length);
        setShopifyPageInfo(result.shopifyPageInfo ?? null);
        setSheetPageInfo(result.sheetPageInfo ?? null);
        setLastSyncedAt(result.syncedAt);
        setSyncWarning(result.warning ?? null);
        if (result.warning) {
          toast.warning(result.warning, { duration: 10_000 });
        }
      });
    },
    [selectedStoreDomain],
  );

  function loadMoreDb() {
    if (!selectedStoreDomain) return;

    const nextPage = dbPage + 1;
    startLoadMore(async () => {
      const result = await getAbandonedCheckoutsForStore(
        selectedStoreDomain,
        nextPage,
      );
      if (!result.success) {
        toast.error(result.error ?? "Failed to load checkouts");
        return;
      }
      setCheckouts((current) => [...current, ...result.checkouts]);
      setDbPage(result.page);
      setHasMoreDb(result.hasMore);
      setTotalCount(result.totalCount);
    });
  }

  function syncNextShopifyPage() {
    if (!shopifyPageInfo?.endCursor) return;
    runSync({ shopifyAfter: shopifyPageInfo.endCursor });
  }

  function syncNextSheetPage() {
    if (!sheetPageInfo?.hasNextPage) return;
    runSync({ sheetPage: sheetPageInfo.page + 1 });
  }

  const sheetRowRangeLabel = sheetPageInfo?.rowRangeLabel ?? null;

  function handleBulkCancelSchedule() {
    if (!selectedStoreDomain || selectedCount === 0) return;

    startBulkStop(async () => {
      const result = await bulkStopRecoveryCallAction(
        selectedStoreDomain,
        Array.from(selectedIds),
      );

      if (!result.success && result.stopped === 0) {
        toast.error(
          result.error ?? result.errors[0] ?? "Failed to cancel schedules",
        );
        return;
      }

      if (result.failed > 0) {
        toast.warning(
          `Cancelled ${result.stopped} schedule(s). ${result.failed} could not be updated.`,
        );
      } else {
        toast.success(
          result.stopped === 1
            ? "Scheduled call cancelled"
            : `Cancelled ${result.stopped} scheduled calls`,
        );
      }

      setSelectedIds(new Set());
      runSync();
    });
  }

  useEffect(() => {
    if (!selectedStoreDomain) return;
    void refreshOpenCheckouts();
  }, [selectedStoreDomain, refreshOpenCheckouts]);

  useEffect(() => {
    if (!selectedStoreDomain) return;
    void refreshOpenCheckouts({ silent: true });
  }, [callLogs, selectedStoreDomain, refreshOpenCheckouts]);

  useEffect(() => {
    if (!selectedStoreDomain || !shouldLiveRefreshOpenCheckouts) return;

    const interval = setInterval(() => {
      void refreshOpenCheckouts({ silent: true });
    }, 5_000);

    return () => clearInterval(interval);
  }, [
    selectedStoreDomain,
    shouldLiveRefreshOpenCheckouts,
    refreshOpenCheckouts,
  ]);

  if (!selectedStoreDomain) return null;

  return (
    <Card className="overflow-hidden border-border/60">
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <span className="text-xs text-muted-foreground">
            {lastSyncedAt
              ? `Last sync: ${new Date(lastSyncedAt).toLocaleString()}`
              : "Not synced yet"}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettings(true)}
            >
              <Settings2 className="mr-1 h-3 w-3" />
              Settings
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => runSync()}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3 w-3" />
              )}
              Sync now
            </Button>
          </div>
        </div>
        <RecoverySettings
          storeDomain={selectedStoreDomain}
          open={showSettings}
          onOpenChange={setShowSettings}
        />
        {syncWarning && (
          <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-100">
            {syncWarning}
          </div>
        )}
        {isLoadingCheckouts ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Loading abandoned checkouts…
            </p>
          </div>
        ) : checkouts.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {isSyncing
                ? "Syncing checkouts…"
                : syncWarning
                  ? "No checkouts synced yet. Fix the sync issue above, then click Sync now."
                  : "No open abandoned checkouts. Click Sync now to pull from your sheet or Shopify."}
            </p>
          </div>
        ) : (
          <div>
            {selectedCount > 0 && (
              <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/30 px-4 py-2.5">
                <span className="text-sm text-muted-foreground">
                  {selectedCount} selected
                </span>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleBulkCancelSchedule}
                  disabled={isBulkStopping}
                >
                  {isBulkStopping ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <PhoneOff className="mr-1 h-3 w-3" />
                  )}
                  Cancel schedule
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedIds(new Set())}
                  disabled={isBulkStopping}
                >
                  Clear selection
                </Button>
              </div>
            )}
            <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={
                          someStoppableSelected
                            ? "indeterminate"
                            : allStoppableSelected
                        }
                        disabled={stoppableCheckouts.length === 0}
                        onCheckedChange={toggleSelectAllStoppable}
                        aria-label="Select all cancellable schedules"
                      />
                    </TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Time to call</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checkouts.map((checkout) => {
                    const selectable = canStopCall(
                      checkout.callStatus,
                      checkout.callScheduled,
                    );

                    return (
                      <CheckoutRow
                        key={checkout.id}
                        checkout={checkout}
                        onRefresh={runSync}
                        selectable={selectable}
                        selected={selectedIds.has(checkout.id)}
                        onSelectedChange={(selected) =>
                          toggleCheckoutSelection(checkout.id, selected)
                        }
                      />
                    );
                  })}
                </TableBody>
              </Table>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
              <div className="space-y-0.5">
                <span className="text-xs text-muted-foreground">
                  Showing {checkouts.length} of {totalCount} in queue
                </span>
                {sheetPageInfo && (
                  <p className="text-xs text-muted-foreground">
                    Sheet sync: batch {sheetPageInfo.page + 1}
                    {sheetRowRangeLabel ? ` (${sheetRowRangeLabel})` : ""}
                    {sheetPageInfo.hasNextPage
                      ? " · more rows available"
                      : " · end of sheet"}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {hasMoreDb && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadMoreDb}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : null}
                    Load more
                  </Button>
                )}
                {sheetPageInfo?.hasNextPage && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={syncNextSheetPage}
                    disabled={isSyncing}
                  >
                    {isSyncing ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1 h-3 w-3" />
                    )}
                    Fetch next 10 from sheet
                  </Button>
                )}
                {shopifyPageInfo?.hasNextPage && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={syncNextShopifyPage}
                    disabled={isSyncing}
                  >
                    {isSyncing ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1 h-3 w-3" />
                    )}
                    Sync next 5 from Shopify
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
