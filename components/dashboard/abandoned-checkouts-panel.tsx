"use client";

import { Fragment, useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  CalendarClock,
  Loader2,
  MoreHorizontal,
  Phone,
  PhoneOff,
  RefreshCw,
  Settings2,
} from "lucide-react";
import {
  getAbandonedCheckoutsForStore,
  getStoreRecoverySettings,
  bulkScheduleCheckoutsAction,
  bulkStopRecoveryCallAction,
  initiateRecoveryCall,
  stopRecoveryCallAction,
  syncAbandonedCheckouts,
  updateStoreAutoCallsEnabled,
  type AbandonedCheckoutRow,
  type SheetPageInfo,
} from "@/app/actions/abandoned-checkouts";
import { formatTimeUntilCall } from "@/lib/shopify-admin";
import {
  canEditSchedule,
  canInitiateCall,
  canScheduleCallback,
  canSelectCheckout,
  canStopCall,
  type AutoCallEnrollmentSelection,
  displayCheckoutStatus,
  isActiveCall,
} from "@/lib/call-status";
import { useAnalyticsStore } from "@/store/use-analytics-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckoutDetailDrawer } from "@/components/dashboard/checkout-detail-drawer";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { EditCheckoutScheduleDialog } from "@/components/dashboard/edit-checkout-schedule-dialog";
import { AutoCallEnrollmentDialog } from "@/components/dashboard/auto-call-enrollment-dialog";
import {
  RecoverySettings,
  type RecoverySettingsPatch,
  type StoreRecoverySettings,
} from "@/components/dashboard/recovery-settings";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatDurationMs } from "@/lib/call-pipeline-events";
import {
  formatCurrency,
  formatDateLabel,
  formatDateTimeLabel,
  formatPhoneNumber,
} from "@/lib/utils";
import { CallStatus } from "@prisma/client";

function formatScheduledWhen(scheduledCallAt: string | null): string | null {
  if (!scheduledCallAt) return null;
  return formatDateTimeLabel(scheduledCallAt);
}

function abandonmentDateLabel(shopifyCreatedAt: string | null): string {
  return shopifyCreatedAt ? formatDateLabel(shopifyCreatedAt) : "No date";
}

function ScheduleCell({
  scheduledCallAt,
  callStatus,
  callScheduled,
}: {
  scheduledCallAt: string | null;
  callStatus: CallStatus;
  callScheduled: boolean;
}) {
  const [, tick] = useState(0);

  useEffect(() => {
    if (callStatus !== CallStatus.PENDING || !callScheduled) return;
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [callStatus, callScheduled]);

  if (callStatus !== CallStatus.PENDING || !callScheduled) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  const when = formatScheduledWhen(scheduledCallAt);
  const { label, isReady } = formatTimeUntilCall(
    scheduledCallAt ? new Date(scheduledCallAt) : null,
  );

  return (
    <div className="min-w-0">
      <p
        className={`truncate text-sm font-medium leading-5 ${
          isReady ? "text-emerald-400" : "text-foreground"
        }`}
      >
        {isReady ? "Due now" : label}
      </p>
      {when ? (
        <p className="truncate text-xs leading-4 text-muted-foreground">{when}</p>
      ) : null}
    </div>
  );
}

function CheckoutRow({
  checkout,
  selectable,
  selected,
  autoCallsEnabled,
  onSelectedChange,
  onOpenDetails,
  onSchedule,
  onRefresh,
}: {
  checkout: AbandonedCheckoutRow;
  selectable: boolean;
  selected: boolean;
  autoCallsEnabled: boolean;
  onSelectedChange: (selected: boolean) => void;
  onOpenDetails: () => void;
  onSchedule: () => void;
  onRefresh: () => void;
}) {
  const [isCalling, startCall] = useTransition();
  const status = displayCheckoutStatus(
    checkout.callStatus,
    checkout.callScheduled,
    checkout.lastError,
  );
  const customerLabel =
    checkout.customerName ||
    checkout.customerPhone ||
    checkout.customerEmail ||
    "customer";
  const showRowCall =
    !autoCallsEnabled &&
    canInitiateCall(checkout.callStatus) &&
    Boolean(checkout.customerPhone);
  const showRowSchedule =
    !checkout.callScheduled &&
    canEditSchedule(checkout.callStatus, checkout.customerPhone);

  function handleCallNow() {
    startCall(async () => {
      const result = await initiateRecoveryCall(checkout.id);
      if (result.skipped) {
        toast.info(result.skipReason ?? "Call skipped");
        onRefresh();
        return;
      }
      if (!result.success) {
        toast.error(result.error ?? "Failed to initiate call");
        return;
      }
      toast.success(
        result.checkoutUrl
          ? `Call dispatched in ${formatDurationMs(result.dispatchDurationMs)} — cart checkout URL ready`
          : `Recovery call dispatched in ${formatDurationMs(result.dispatchDurationMs)}`,
      );
      onRefresh();
    });
  }

  const live = isCalling || isActiveCall(checkout.callStatus);

  return (
    <TableRow
      data-state={selected ? "selected" : undefined}
      className={
        live
          ? "bg-sky-500/10 shadow-[inset_3px_0_0_0] shadow-sky-400 hover:bg-sky-500/15 data-[state=selected]:bg-sky-500/15"
          : undefined
      }
    >
      <TableCell className="px-3 py-2">
        <Checkbox
          checked={selected}
          disabled={!selectable}
          onCheckedChange={(checked) => onSelectedChange(checked === true)}
          aria-label={`Select checkout for ${customerLabel}`}
        />
      </TableCell>
      <TableCell className="px-3 py-2">
        <div className="min-w-0 max-w-[16rem]">
          <p className="truncate text-sm font-medium leading-5">
            {checkout.customerName || (
              <span className="font-normal text-muted-foreground">Unnamed</span>
            )}
          </p>
          <p className="truncate font-mono text-xs leading-4 text-muted-foreground">
            {checkout.customerPhone
              ? formatPhoneNumber(checkout.customerPhone)
              : "No phone"}
          </p>
        </div>
      </TableCell>
      <TableCell className="px-3 py-2 text-sm tabular-nums text-muted-foreground">
        {checkout.shopifyCreatedAt
          ? formatDateTimeLabel(checkout.shopifyCreatedAt)
          : "—"}
      </TableCell>
      <TableCell className="px-3 py-2 text-sm font-medium tabular-nums">
        {formatCurrency(checkout.cartValue)}
      </TableCell>
      <TableCell className="px-3 py-2">
        <ScheduleCell
          scheduledCallAt={checkout.scheduledCallAt}
          callStatus={checkout.callStatus}
          callScheduled={checkout.callScheduled}
        />
      </TableCell>
      <TableCell className="px-3 py-2">
        <StatusBadge
          label={status.label}
          variant={status.variant}
          detail={status.detail}
        />
      </TableCell>
      <TableCell className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          {showRowSchedule ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={onSchedule}
            >
              <CalendarClock className="h-3.5 w-3.5" />
              Schedule
            </Button>
          ) : null}
          {showRowCall ? (
            <Button
              size="sm"
              className="h-8"
              onClick={handleCallNow}
              disabled={isCalling}
            >
              {isCalling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Phone className="h-3.5 w-3.5" />
              )}
              Call now
            </Button>
          ) : null}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={onOpenDetails}
            aria-label={`Details for ${customerLabel}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function AbandonedCheckoutsPanel() {
  const selectedStoreDomain = useAnalyticsStore((s) => s.selectedStoreDomain);
  const callLogs = useAnalyticsStore((s) => s.callLogs);
  const [checkouts, setCheckouts] = useState<AbandonedCheckoutRow[]>([]);
  const [completedCheckouts, setCompletedCheckouts] = useState<
    AbandonedCheckoutRow[]
  >([]);
  const [shownCompletedDates, setShownCompletedDates] = useState<Set<string>>(
    () => new Set(),
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [isSyncing, startSync] = useTransition();
  const [showSettings, setShowSettings] = useState(false);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isBulkStopping, startBulkStop] = useTransition();
  const [isBulkScheduling, startBulkSchedule] = useTransition();
  const [showBulkSchedule, setShowBulkSchedule] = useState(false);
  const [bulkScheduleValue, setBulkScheduleValue] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [shopifyPageInfo, setShopifyPageInfo] = useState<{
    hasNextPage: boolean;
    endCursor: string | null;
  } | null>(null);
  const [sheetPageInfo, setSheetPageInfo] = useState<SheetPageInfo | null>(
    null,
  );
  const [isLoadingCheckouts, setIsLoadingCheckouts] = useState(false);
  const [hasLoadedCheckouts, setHasLoadedCheckouts] = useState(false);
  const [recoverySettings, setRecoverySettings] =
    useState<StoreRecoverySettings | null>(null);
  const [settingsReady, setSettingsReady] = useState(false);
  const [autoCallsEnabled, setAutoCallsEnabled] = useState(false);
  const [isTogglingAutoCalls, startToggleAutoCalls] = useTransition();
  const [showAutoCallEnrollment, setShowAutoCallEnrollment] = useState(false);
  const [editingCheckout, setEditingCheckout] =
    useState<AbandonedCheckoutRow | null>(null);
  const [detailCheckout, setDetailCheckout] =
    useState<AbandonedCheckoutRow | null>(null);
  const [isDetailCalling, startDetailCall] = useTransition();
  const [isDetailStopping, startDetailStop] = useTransition();

  const displayedCheckouts = [
    ...checkouts,
    ...completedCheckouts.filter((checkout) =>
      shownCompletedDates.has(abandonmentDateLabel(checkout.shopifyCreatedAt)),
    ),
  ].sort((a, b) => {
    const aTime = a.shopifyCreatedAt ? new Date(a.shopifyCreatedAt).getTime() : 0;
    const bTime = b.shopifyCreatedAt ? new Date(b.shopifyCreatedAt).getTime() : 0;
    return bTime - aTime;
  });
  const selectableCheckouts = checkouts.filter((checkout) =>
    canSelectCheckout(
      checkout.callStatus,
      checkout.callScheduled,
      checkout.customerPhone,
    ),
  );
  const selectedCount = selectedIds.size;
  const selectedCanRemove = checkouts.some(
    (checkout) =>
      selectedIds.has(checkout.id) &&
      canStopCall(checkout.callStatus, checkout.callScheduled),
  );
  const selectedCanSchedule = checkouts.some(
    (checkout) =>
      selectedIds.has(checkout.id) &&
      canEditSchedule(checkout.callStatus, checkout.customerPhone),
  );
  const allSelectableSelected =
    selectableCheckouts.length > 0 &&
    selectableCheckouts.every((checkout) => selectedIds.has(checkout.id));
  const someSelectableSelected =
    selectableCheckouts.some((checkout) => selectedIds.has(checkout.id)) &&
    !allSelectableSelected;
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
        const result = await getAbandonedCheckoutsForStore(selectedStoreDomain);
        if (!result.success) return;

        setCheckouts(result.checkouts);
        setCompletedCheckouts(result.completedCheckouts ?? []);
        setTotalCount(result.totalCount);
        setHasLoadedCheckouts(true);
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
    setTotalCount(0);
    setShopifyPageInfo(null);
    setSheetPageInfo(null);
    setCheckouts([]);
    setCompletedCheckouts([]);
    setShownCompletedDates(new Set());
    setIsLoadingCheckouts(true);
    setHasLoadedCheckouts(false);
    setDetailCheckout(null);
    setEditingCheckout(null);
  }, [selectedStoreDomain]);

  useEffect(() => {
    if (!detailCheckout) return;
    const next = checkouts.find((checkout) => checkout.id === detailCheckout.id);
    if (next && next !== detailCheckout) {
      setDetailCheckout(next);
    }
  }, [checkouts, detailCheckout]);

  function toggleCheckoutSelection(checkoutId: string, selected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) next.add(checkoutId);
      else next.delete(checkoutId);
      return next;
    });
  }

  function toggleCompletedDate(dateLabel: string) {
    setShownCompletedDates((current) => {
      const next = new Set(current);
      if (next.has(dateLabel)) next.delete(dateLabel);
      else next.add(dateLabel);
      return next;
    });
  }

  function toggleDateSelection(dateLabel: string, selected: boolean) {
    const ids = checkouts
      .filter(
        (checkout) =>
          abandonmentDateLabel(checkout.shopifyCreatedAt) === dateLabel &&
          canSelectCheckout(
            checkout.callStatus,
            checkout.callScheduled,
            checkout.customerPhone,
          ),
      )
      .map((checkout) => checkout.id);

    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function toggleSelectAllStoppable() {
    if (allSelectableSelected) {
      setSelectedIds(new Set());
      return;
    }

    setSelectedIds(new Set(selectableCheckouts.map((checkout) => checkout.id)));
  }

  const runSync = useCallback(
    (options?: { shopifyAfter?: string | null; sheetPage?: number }) => {
      if (!selectedStoreDomain) return;

      startSync(async () => {
        const result = await syncAbandonedCheckouts(selectedStoreDomain, {
          shopifyAfter: options?.shopifyAfter,
          sheetPage: options?.sheetPage ?? 0,
        });
        if (!result.success) {
          toast.error(result.error ?? "Failed to sync checkouts", {
            duration: 12_000,
          });
          return;
        }
        setCheckouts(result.checkouts);
        setCompletedCheckouts(result.completedCheckouts ?? []);
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

  function syncNextShopifyPage() {
    if (!shopifyPageInfo?.endCursor) return;
    runSync({ shopifyAfter: shopifyPageInfo.endCursor });
  }

  function syncNextSheetPage() {
    if (!sheetPageInfo?.hasNextPage) return;
    runSync({ sheetPage: sheetPageInfo.page + 1 });
  }

  const sheetRowRangeLabel = sheetPageInfo?.rowRangeLabel ?? null;

  function handleDetailCall() {
    if (!detailCheckout) return;
    startDetailCall(async () => {
      const result = await initiateRecoveryCall(detailCheckout.id);
      if (result.skipped) {
        toast.info(result.skipReason ?? "Call skipped");
        void refreshOpenCheckouts({ silent: true });
        return;
      }
      if (!result.success) {
        toast.error(result.error ?? "Failed to initiate call");
        return;
      }
      toast.success(
        result.checkoutUrl
          ? `Call dispatched in ${formatDurationMs(result.dispatchDurationMs)} — cart checkout URL ready`
          : `Recovery call dispatched in ${formatDurationMs(result.dispatchDurationMs)}`,
      );
      void refreshOpenCheckouts({ silent: true });
    });
  }

  function handleDetailStop() {
    if (!detailCheckout) return;
    startDetailStop(async () => {
      const result = await stopRecoveryCallAction(detailCheckout.id);
      if (!result.success) {
        toast.error(result.error ?? "Failed to stop call");
        return;
      }
      toast.success(
        isActiveCall(detailCheckout.callStatus)
          ? "Call stopped"
          : "Schedule removed",
      );
      void refreshOpenCheckouts({ silent: true });
    });
  }

  function openBulkSchedule() {
    const pad = (value: number) => String(value).padStart(2, "0");
    const next = new Date(Date.now() + 15 * 60 * 1000);
    setBulkScheduleValue(
      `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(next.getHours())}:${pad(next.getMinutes())}`,
    );
    setShowBulkSchedule(true);
  }

  function handleBulkSchedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStoreDomain || selectedCount === 0 || !bulkScheduleValue) return;

    const next = new Date(bulkScheduleValue);
    if (Number.isNaN(next.getTime())) {
      toast.error("Enter a valid date and time");
      return;
    }

    startBulkSchedule(async () => {
      const result = await bulkScheduleCheckoutsAction(
        selectedStoreDomain,
        Array.from(selectedIds),
        next.toISOString(),
      );
      if (!result.success && result.scheduled === 0) {
        toast.error(result.error ?? "Failed to schedule calls");
        return;
      }
      if (result.failed > 0) {
        toast.warning(
          `Scheduled ${result.scheduled}. ${result.failed} could not be scheduled.`,
        );
      } else {
        toast.success(
          result.scheduled === 1
            ? "Call scheduled"
            : `Scheduled ${result.scheduled} calls`,
        );
      }
      setShowBulkSchedule(false);
      setSelectedIds(new Set());
      void refreshOpenCheckouts({ silent: true });
    });
  }

  function handleBulkCancelSchedule() {
    if (!selectedStoreDomain || selectedCount === 0) return;

    startBulkStop(async () => {
      const result = await bulkStopRecoveryCallAction(
        selectedStoreDomain,
        Array.from(selectedIds),
      );

      if (!result.success && result.stopped === 0) {
        toast.error(
          result.error ?? result.errors[0] ?? "Failed to remove schedules",
        );
        return;
      }

      if (result.failed > 0) {
        toast.warning(
          `Removed ${result.stopped} schedule(s). ${result.failed} could not be updated.`,
        );
      } else {
        toast.success(
          result.stopped === 1
            ? "Schedule removed"
            : `Removed ${result.stopped} schedules`,
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
    if (!selectedStoreDomain || !hasLoadedCheckouts) return;

    let active = true;
    getStoreRecoverySettings(selectedStoreDomain).then((settings) => {
      if (!active) return;
      setRecoverySettings(settings);
      if (settings) {
        setAutoCallsEnabled(settings.autoCallsEnabled);
      }
      setSettingsReady(true);
    });

    return () => {
      active = false;
    };
  }, [selectedStoreDomain, hasLoadedCheckouts]);

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

  useEffect(() => {
    if (!selectedStoreDomain || !autoCallsEnabled) return;

    const interval = setInterval(() => {
      runSync();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [selectedStoreDomain, autoCallsEnabled, runSync]);

  function handleRecoverySettingsChange(patch: RecoverySettingsPatch) {
    setRecoverySettings((current) =>
      current ? { ...current, ...patch } : current,
    );
    setAutoCallsEnabled(patch.autoCallsEnabled);
    // Saving can re-queue or settle busy retries, so the rows may have moved.
    void refreshOpenCheckouts({ silent: true });
  }

  function commitAutoCalls(
    enabled: boolean,
    enrollment?: AutoCallEnrollmentSelection,
  ) {
    if (!selectedStoreDomain || isTogglingAutoCalls) return;
    startToggleAutoCalls(async () => {
      const result = await updateStoreAutoCallsEnabled(
        selectedStoreDomain,
        enabled,
        enrollment,
      );
      if (!result.success) {
        toast.error(result.error ?? "Failed to update auto-call");
        return;
      }
      setShowAutoCallEnrollment(false);
      setAutoCallsEnabled(enabled);
      setRecoverySettings((current) =>
        current ? { ...current, autoCallsEnabled: enabled } : current,
      );
      toast.success(
        enabled
          ? result.enrolled
            ? `Auto-call on. Queued ${result.enrolled} checkout${result.enrolled === 1 ? "" : "s"} for the next calling slot.`
            : "Auto-call on. No matching checkouts with a phone number to queue."
          : "Auto-call off. Pending schedules were cancelled.",
      );
      void refreshOpenCheckouts({ silent: true });
    });
  }

  function handleAutoCallToggle(enabled: boolean) {
    if (!selectedStoreDomain || isTogglingAutoCalls) return;
    if (enabled) {
      setShowAutoCallEnrollment(true);
      return;
    }
    commitAutoCalls(false);
  }

  if (!selectedStoreDomain) return null;

  return (
    <Card className="overflow-hidden border-border/60">
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <span className="text-xs text-muted-foreground">
            {lastSyncedAt
              ? `Last sync: ${formatDateTimeLabel(lastSyncedAt)}`
              : "Not synced yet"}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-1 flex items-center gap-2">
              <Switch
                id="toolbar-auto-calls"
                checked={autoCallsEnabled}
                disabled={isTogglingAutoCalls}
                onCheckedChange={handleAutoCallToggle}
              />
              <Label
                htmlFor="toolbar-auto-calls"
                className="text-xs font-medium"
              >
                Auto-call
              </Label>
              {isTogglingAutoCalls ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {autoCallsEnabled ? "Turning off…" : "Turning on…"}
                </span>
              ) : null}
            </div>
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
          settings={recoverySettings}
          settingsReady={settingsReady}
          open={showSettings}
          onOpenChange={setShowSettings}
          onSettingsChange={handleRecoverySettingsChange}
        />
        <Dialog open={showBulkSchedule} onOpenChange={setShowBulkSchedule}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Schedule selected calls</DialogTitle>
              <DialogDescription>
                {selectedCount === 1
                  ? "Choose when to call this checkout. It is dialed even if auto-call is off."
                  : `Choose when to call ${selectedCount} checkouts. They are dialed even if auto-call is off.`}
              </DialogDescription>
            </DialogHeader>
            <form id="bulk-schedule-form" onSubmit={handleBulkSchedule} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="bulk-scheduled-at">Call time</Label>
                <Input
                  id="bulk-scheduled-at"
                  type="datetime-local"
                  value={bulkScheduleValue}
                  onChange={(event) => setBulkScheduleValue(event.target.value)}
                  required
                />
              </div>
            </form>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowBulkSchedule(false)}
                disabled={isBulkScheduling}
              >
                Cancel
              </Button>
              <Button type="submit" form="bulk-schedule-form" disabled={isBulkScheduling}>
                {isBulkScheduling ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Schedule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <AutoCallEnrollmentDialog
          open={showAutoCallEnrollment}
          pending={isTogglingAutoCalls}
          onOpenChange={(open) => {
            if (!isTogglingAutoCalls) setShowAutoCallEnrollment(open);
          }}
          onConfirm={(selection) => commitAutoCalls(true, selection)}
        />
        <EditCheckoutScheduleDialog
          checkout={editingCheckout}
          open={editingCheckout !== null}
          onOpenChange={(open) => {
            if (!open) setEditingCheckout(null);
          }}
          onSaved={(scheduledCallAt) => {
            setDetailCheckout((current) => {
              if (!current || current.id !== editingCheckout?.id) return current;
              const wasCompleted = current.callStatus === CallStatus.COMPLETED;
              return {
                ...current,
                callStatus: CallStatus.PENDING,
                callScheduled: true,
                scheduledCallAt: scheduledCallAt ?? current.scheduledCallAt,
                lastError: wasCompleted ? null : current.lastError,
              };
            });
            setSelectedIds(new Set());
            void refreshOpenCheckouts({ silent: true });
          }}
        />
        <CheckoutDetailDrawer
          checkout={detailCheckout}
          open={detailCheckout !== null}
          onOpenChange={(open) => {
            if (!open) setDetailCheckout(null);
          }}
          onSaved={() => {
            void refreshOpenCheckouts({ silent: true });
          }}
          onEditSchedule={() => {
            if (detailCheckout) setEditingCheckout(detailCheckout);
          }}
          onRemoveSchedule={handleDetailStop}
          onCallNow={handleDetailCall}
          canEditScheduleTime={
            detailCheckout
              ? canScheduleCallback(
                  detailCheckout.callStatus,
                  detailCheckout.customerPhone,
                )
              : false
          }
          canRemoveSchedule={
            detailCheckout
              ? canStopCall(
                  detailCheckout.callStatus,
                  detailCheckout.callScheduled,
                )
              : false
          }
          canCallNow={
            detailCheckout
              ? autoCallsEnabled &&
                canInitiateCall(detailCheckout.callStatus) &&
                Boolean(detailCheckout.customerPhone) &&
                !(
                  detailCheckout.callStatus === CallStatus.PENDING &&
                  detailCheckout.callScheduled
                )
              : false
          }
          isCalling={isDetailCalling}
          isStopping={isDetailStopping}
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
                  onClick={openBulkSchedule}
                  disabled={isBulkScheduling || isBulkStopping || !selectedCanSchedule}
                >
                  {isBulkScheduling ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <CalendarClock className="mr-1 h-3 w-3" />
                  )}
                  Schedule
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleBulkCancelSchedule}
                  disabled={isBulkStopping || isBulkScheduling || !selectedCanRemove}
                >
                  {isBulkStopping ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <PhoneOff className="mr-1 h-3 w-3" />
                  )}
                  Remove schedule
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
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-9 w-10 px-3">
                      <Checkbox
                        checked={
                          someSelectableSelected
                            ? "indeterminate"
                            : allSelectableSelected
                        }
                        disabled={selectableCheckouts.length === 0}
                        onCheckedChange={toggleSelectAllStoppable}
                        aria-label="Select all checkouts that can be scheduled or updated"
                      />
                    </TableHead>
                    <TableHead className="h-9 px-3 text-[11px] uppercase tracking-wide">
                      Customer
                    </TableHead>
                    <TableHead className="h-9 px-3 text-[11px] uppercase tracking-wide">
                      Abandoned
                    </TableHead>
                    <TableHead className="h-9 px-3 text-[11px] uppercase tracking-wide">
                      Value
                    </TableHead>
                    <TableHead className="h-9 px-3 text-[11px] uppercase tracking-wide">
                      Schedule
                    </TableHead>
                    <TableHead className="h-9 px-3 text-[11px] uppercase tracking-wide">
                      Status
                    </TableHead>
                    <TableHead className="h-9 px-3 text-right text-[11px] uppercase tracking-wide">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedCheckouts.map((checkout, index) => {
                    const dateLabel = abandonmentDateLabel(checkout.shopifyCreatedAt);
                    const previous = index > 0 ? displayedCheckouts[index - 1] : null;
                    const previousLabel = previous
                      ? abandonmentDateLabel(previous.shopifyCreatedAt)
                      : null;
                    const dateCheckouts = checkouts.filter(
                      (row) =>
                        abandonmentDateLabel(row.shopifyCreatedAt) === dateLabel &&
                        canSelectCheckout(
                          row.callStatus,
                          row.callScheduled,
                          row.customerPhone,
                        ),
                    );
                    const selectedOnDate = dateCheckouts.filter((row) =>
                      selectedIds.has(row.id),
                    ).length;
                    const allOnDateSelected =
                      dateCheckouts.length > 0 &&
                      selectedOnDate === dateCheckouts.length;

                    return (
                      <Fragment key={checkout.id}>
                        {dateLabel !== previousLabel ? (
                          <TableRow className="border-0 hover:bg-transparent">
                            <TableCell className="border-0 bg-foreground/10 px-3 py-2.5">
                              <Checkbox
                                checked={
                                  selectedOnDate > 0 && !allOnDateSelected
                                    ? "indeterminate"
                                    : allOnDateSelected
                                }
                                disabled={dateCheckouts.length === 0}
                                onCheckedChange={(checked) =>
                                  toggleDateSelection(dateLabel, checked === true)
                                }
                                aria-label={`Select all checkouts from ${dateLabel}`}
                              />
                            </TableCell>
                            <TableCell
                              colSpan={6}
                              className="border-0 bg-foreground/10 px-3 py-2.5"
                            >
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="text-sm font-semibold uppercase tracking-wide text-foreground">
                                  {dateLabel}
                                </span>
                                {completedCheckouts.some(
                                  (row) =>
                                    abandonmentDateLabel(row.shopifyCreatedAt) ===
                                    dateLabel,
                                ) ? (
                                  <button
                                    type="button"
                                    className="text-xs font-medium text-foreground/70 underline-offset-2 hover:text-foreground hover:underline"
                                    onClick={() => toggleCompletedDate(dateLabel)}
                                  >
                                    {shownCompletedDates.has(dateLabel)
                                      ? "Hide completed"
                                      : `Show completed (${
                                          completedCheckouts.filter(
                                            (row) =>
                                              abandonmentDateLabel(
                                                row.shopifyCreatedAt,
                                              ) === dateLabel,
                                          ).length
                                        })`}
                                  </button>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                        <CheckoutRow
                          checkout={checkout}
                          selectable={canSelectCheckout(
                            checkout.callStatus,
                            checkout.callScheduled,
                            checkout.customerPhone,
                          )}
                          selected={selectedIds.has(checkout.id)}
                          autoCallsEnabled={autoCallsEnabled}
                          onSelectedChange={(selected) =>
                            toggleCheckoutSelection(checkout.id, selected)
                          }
                          onOpenDetails={() => setDetailCheckout(checkout)}
                          onSchedule={() => setEditingCheckout(checkout)}
                          onRefresh={() => {
                            void refreshOpenCheckouts({ silent: true });
                          }}
                        />
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
              <div className="space-y-0.5">
                <span className="text-xs text-muted-foreground">
                  {checkouts.length < totalCount
                    ? `Showing first ${checkouts.length} of ${totalCount} in queue`
                    : `${totalCount} in queue`}
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
