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
  getNdrcCallAttempts,
  getNdrcOrdersForStore,
  initiateNdrcCall,
  stopNdrcCallAction,
  syncNdrcOrders,
  type NdrcCallAttemptRow,
  type NdrcOrderRow,
} from "@/app/actions/ndrc-orders";
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
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NdrcSettings } from "@/components/dashboard/ndrc-settings";
import { TtaiCallDetails } from "@/components/dashboard/ttai-call-details";
import { formatCurrency, formatPhoneNumber } from "@/lib/utils";

function OrderDetail({
  order,
  attempts,
}: {
  order: NdrcOrderRow;
  attempts: NdrcCallAttemptRow[];
}) {
  return (
    <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3 text-sm">
      {order.lastError && (
        <p className="flex items-start gap-2 text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {order.lastError}
        </p>
      )}
      {order.awbNumber && (
        <p>
          <span className="text-muted-foreground">AWB: </span>
          <span className="font-mono text-xs">{order.awbNumber}</span>
          {order.courierName ? ` · ${order.courierName}` : ""}
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

function NdrcOrderRowItem({
  order,
  onRefresh,
}: {
  order: NdrcOrderRow;
  onRefresh: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [isStopping, startStopTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [attempts, setAttempts] = useState<NdrcCallAttemptRow[]>([]);

  useEffect(() => {
    if (!open) return;
    getNdrcCallAttempts(order.id).then(setAttempts);
  }, [open, order.id, order.callStatus]);

  useEffect(() => {
    if (!isPending) return;
    const interval = setInterval(() => {
      onRefresh();
    }, 2_000);
    return () => clearInterval(interval);
  }, [isPending, onRefresh]);

  function handleStopCall() {
    startStopTransition(async () => {
      const result = await stopNdrcCallAction(order.id);
      if (!result.success) {
        toast.error(result.error ?? "Failed to stop call");
        return;
      }
      toast.success("Call stopped");
      onRefresh();
    });
  }

  function handleCall() {
    startTransition(async () => {
      const result = await initiateNdrcCall(order.id);
      if (!result.success) {
        toast.error(result.error ?? "Failed to initiate call");
        return;
      }
      toast.success("Confirmation call dispatched");
      onRefresh();
    });
  }

  const showCallButton = canInitiateCall(order.callStatus) && order.customerPhone;
  const showStopButton = canStopCall(order.callStatus, false);

  return (
    <>
      <TableRow>
        <TableCell>
          <p className="font-mono text-sm">{order.orderId}</p>
        </TableCell>
        <TableCell>
          <div className="space-y-0.5">
            <p className="font-mono text-sm">
              {order.customerPhone ? formatPhoneNumber(order.customerPhone) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {order.customerEmail ?? "No email"}
            </p>
          </div>
        </TableCell>
        <TableCell className="font-medium">
          {formatCurrency(order.orderValue)}
        </TableCell>
        <TableCell className="max-w-[220px]">
          <p className="truncate text-sm" title={order.address || undefined}>
            {order.address || <span className="text-muted-foreground">—</span>}
          </p>
        </TableCell>
        <TableCell className="text-center">
          <Badge variant={order.attempts > 0 ? "warning" : "muted"}>
            {order.attempts}
          </Badge>
        </TableCell>
        <TableCell>
          <Badge variant={STATUS_VARIANT[order.callStatus]}>
            {formatCallStatus(order.callStatus)}
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
                Stop call
              </Button>
            )}
            {showCallButton ? (
              <Button size="sm" onClick={handleCall} disabled={isPending || isStopping}>
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
          <TableCell colSpan={7}>
            <OrderDetail order={order} attempts={attempts} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export function NdrcPanel() {
  const selectedStoreDomain = useAnalyticsStore((s) => s.selectedStoreDomain);
  const [orders, setOrders] = useState<NdrcOrderRow[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [isSyncing, startSync] = useTransition();
  const [showSettings, setShowSettings] = useState(false);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoadingMore, startLoadMore] = useTransition();
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  const refreshOrders = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!selectedStoreDomain) return;

      if (!silent) setIsLoadingOrders(true);

      try {
        const result = await getNdrcOrdersForStore(selectedStoreDomain, 0);
        if (!result.success) return;

        setOrders(result.orders);
        setPage(result.page);
        setHasMore(result.hasMore);
        setTotalCount(result.totalCount);
      } finally {
        if (!silent) setIsLoadingOrders(false);
      }
    },
    [selectedStoreDomain]
  );

  useEffect(() => {
    setPage(0);
    setHasMore(false);
    setTotalCount(0);
    setOrders([]);
    setIsLoadingOrders(true);
  }, [selectedStoreDomain]);

  const runSync = useCallback(() => {
    if (!selectedStoreDomain) return;

    startSync(async () => {
      const result = await syncNdrcOrders(selectedStoreDomain);
      if (!result.success) {
        toast.error(result.error ?? "Failed to sync NDRC orders", {
          duration: 12_000,
        });
        return;
      }
      setOrders(result.orders);
      setPage(result.page ?? 0);
      setHasMore(result.hasMore ?? false);
      setTotalCount(result.totalCount ?? result.orders.length);
      setLastSyncedAt(result.syncedAt);
      setSyncWarning(result.warning ?? null);
      if (result.warning) {
        toast.warning(result.warning, { duration: 10_000 });
      }
    });
  }, [selectedStoreDomain]);

  function loadMore() {
    if (!selectedStoreDomain) return;

    const nextPage = page + 1;
    startLoadMore(async () => {
      const result = await getNdrcOrdersForStore(selectedStoreDomain, nextPage);
      if (!result.success) {
        toast.error(result.error ?? "Failed to load orders");
        return;
      }
      setOrders((current) => [...current, ...result.orders]);
      setPage(result.page);
      setHasMore(result.hasMore);
      setTotalCount(result.totalCount);
    });
  }

  useEffect(() => {
    if (!selectedStoreDomain) return;
    void refreshOrders();
  }, [selectedStoreDomain, refreshOrders]);

  const hasActiveCalls = orders.some((order) => isActiveCall(order.callStatus));

  useEffect(() => {
    if (!selectedStoreDomain || !hasActiveCalls) return;

    const interval = setInterval(() => {
      void refreshOrders({ silent: true });
    }, 5_000);

    return () => clearInterval(interval);
  }, [selectedStoreDomain, hasActiveCalls, refreshOrders]);

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
            <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
              <Settings2 className="mr-1 h-3 w-3" />
              Settings
            </Button>
            <Button variant="outline" size="sm" onClick={runSync} disabled={isSyncing}>
              {isSyncing ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3 w-3" />
              )}
              Sync now
            </Button>
          </div>
        </div>
        <NdrcSettings
          storeDomain={selectedStoreDomain}
          open={showSettings}
          onOpenChange={setShowSettings}
        />
        {syncWarning && (
          <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-100">
            {syncWarning}
          </div>
        )}
        {isLoadingOrders ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading NDRC orders…</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {isSyncing
                ? "Syncing orders…"
                : "No NDRC orders synced yet. Add a sheet URL in Settings, then click Sync now."}
            </p>
          </div>
        ) : (
          <div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead className="text-center">Attempts</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <NdrcOrderRowItem
                    key={order.id}
                    order={order}
                    onRefresh={() => {
                      void refreshOrders({ silent: true });
                    }}
                  />
                ))}
              </TableBody>
            </Table>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
              <span className="text-xs text-muted-foreground">
                Showing {orders.length} of {totalCount} orders
              </span>
              {hasMore && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadMore}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : null}
                  Load more
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
