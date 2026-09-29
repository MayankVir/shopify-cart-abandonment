"use client";

import { CallStatus } from "@prisma/client";
import {
  AlertCircle,
  ChevronRight,
  Clock,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  Phone,
  PhoneCall,
  PhoneMissed,
  RefreshCw,
  ShoppingCart,
} from "lucide-react";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import {
  fetchTtaiSessionDetailsForCallLog,
  getCheckoutLogDetail,
  writeCallFeedbackForCallLog,
} from "@/app/actions/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useFilteredCallLogs } from "@/hooks/use-filtered-call-logs";
import { TtaiCallDetails } from "@/components/dashboard/ttai-call-details";
import { isTtaiWebhookStore } from "@/lib/ttai-webhook";
import { CallLogEntry, useAnalyticsStore } from "@/store/use-analytics-store";
import { STATUS_VARIANT, formatCallStatus } from "@/lib/call-status";
import {
  cn,
  formatCurrency,
  formatDateLabel,
  formatDateTimeLabel,
  formatPhoneNumber,
  formatShortUrl,
  formatTimeLabel,
} from "@/lib/utils";

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

/** "22 Sept 2026" + "04:50 PM", joined as "22 Sept 2026, 04:50 PM". */
function formatCallTime(iso: string): {
  primary: string;
  secondary: string;
  full: string;
} {
  const date = new Date(iso);
  return {
    primary: formatDateLabel(date),
    secondary: formatTimeLabel(date),
    full: formatDateTimeLabel(date),
  };
}

/** "auto" or "2 attempts · auto" — keeps retry count visible on a per-checkout row. */
function attemptSummary(log: CallLogEntry): string {
  const trigger = log.latestAttempt?.trigger;
  if (log.attemptCount > 1) {
    return `${log.attemptCount} attempts${trigger ? ` · ${trigger}` : ""}`;
  }
  return trigger ?? "";
}

function statusIcon(status: CallStatus) {
  if (status === CallStatus.COMPLETED) {
    return PhoneCall;
  }
  if (
    status === CallStatus.NO_ANSWER ||
    status === CallStatus.BUSY ||
    status === CallStatus.VOICEMAIL ||
    status === CallStatus.HANG_UP
  ) {
    return PhoneMissed;
  }
  return Phone;
}

function CallLogDetailSheet({
  log,
  open,
  onOpenChange,
}: {
  log: CallLogEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [isWritingToSheet, startWriteToSheet] = useTransition();
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detail, setDetail] = useState<CallLogEntry | null>(null);
  const addCallLog = useAnalyticsStore((s) => s.addCallLog);

  useEffect(() => {
    if (!open || !log) {
      setDetail(null);
      return;
    }

    let active = true;
    setIsLoadingDetail(true);
    setDetail(null);
    getCheckoutLogDetail(log.id)
      .then((row) => {
        if (active) setDetail(row);
      })
      .finally(() => {
        if (active) setIsLoadingDetail(false);
      });

    return () => {
      active = false;
    };
  }, [open, log?.id, log?.callStatus]);

  const toolCallsJson = detail?.latestAttempt?.toolCallsJson;
  const hasSessionDetails =
    isTtaiWebhookStore(toolCallsJson) && Boolean(toolCallsJson.sessionDetails);
  const canFetchSessionDetails = Boolean(detail?.sessionId ?? log?.sessionId);

  function handleFetchSessionDetails() {
    if (!log) return;
    startTransition(async () => {
      const result = await fetchTtaiSessionDetailsForCallLog(log.id);
      if (result.log) {
        addCallLog(result.log);
        setDetail(result.log);
      }
      if (result.success) {
        toast.success("Session details loaded from TTAI");
      } else {
        toast.error(result.error ?? "Failed to fetch session details");
      }
    });
  }

  function handleWriteToSheet() {
    if (!log) return;
    startWriteToSheet(async () => {
      const result = await writeCallFeedbackForCallLog(log.id);
      if (result.success) {
        toast.success("Call feedback written to sheet");
      } else {
        toast.error(result.error ?? "Failed to write call feedback to sheet");
      }
    });
  }

  if (!log) return null;

  const when = formatCallTime(log.updatedAt);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-hidden sm:max-w-xl lg:max-w-2xl"
      >
        <SheetHeader className="shrink-0">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <PhoneCall className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <SheetTitle className="truncate">
                {log.customerName ||
                  (log.customerPhone
                    ? formatPhoneNumber(log.customerPhone)
                    : "Unknown caller")}
              </SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {log.customerName && log.customerPhone ? (
                  <>
                    <span className="font-mono">
                      {formatPhoneNumber(log.customerPhone)}
                    </span>
                    <span>·</span>
                  </>
                ) : null}
                <span className="font-medium text-foreground">
                  {formatCurrency(log.cartValue)}
                </span>
                <span>·</span>
                <Badge variant={STATUS_VARIANT[log.callStatus as CallStatus]}>
                  {formatCallStatus(log.callStatus as CallStatus)}
                </Badge>
                {log.isRepeatCustomer && (
                  <Badge variant="secondary">Repeat customer</Badge>
                )}
                {log.latestAttempt?.durationSec != null && (
                  <>
                    <span>·</span>
                    <span>{formatDuration(log.latestAttempt.durationSec)}</span>
                  </>
                )}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoadingDetail ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading call details…
            </p>
          ) : !detail ? (
            <p className="text-sm text-muted-foreground">
              Could not load this call.
            </p>
          ) : (
          <div className="space-y-6">
            <section className="grid gap-3 sm:grid-cols-2">
              <DetailField label="When">{when.full}</DetailField>
              <DetailField label="Attempts">
                {detail.attemptCount || "—"}
                {detail.latestAttempt
                  ? ` · last ${detail.latestAttempt.trigger}`
                  : ""}
              </DetailField>
              <DetailField label="Order ID">
                <span className="font-mono text-xs">{detail.checkoutToken}</span>
              </DetailField>
              <DetailField label="Session ID">
                <span className="break-all font-mono text-xs">
                  {detail.sessionId ?? "—"}
                </span>
              </DetailField>
              <DetailField label="Duration">
                {formatDuration(detail.latestAttempt?.durationSec)}
              </DetailField>
              {detail.draftOrderId && (
                <DetailField label="Draft order">
                  <span className="font-mono text-xs">{detail.draftOrderId}</span>
                </DetailField>
              )}
              {detail.isRepeatCustomer != null && (
                <DetailField label="Repeat customer">
                  {detail.isRepeatCustomer
                    ? detail.repeatCustomerOrderCount != null
                      ? `${detail.repeatCustomerOrderCount} order${
                          detail.repeatCustomerOrderCount === 1 ? "" : "s"
                        } in window${
                          detail.repeatCustomerLastOrderAt
                            ? ` · last ${formatDateLabel(
                                detail.repeatCustomerLastOrderAt
                              )}`
                            : ""
                        }`
                      : "Yes"
                    : "No"}
                </DetailField>
              )}
              {detail.checkoutUrl && (
                <DetailField label="Cart checkout" className="sm:col-span-2">
                  <a
                    href={detail.checkoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={detail.checkoutUrl}
                    className="inline-flex max-w-full items-center gap-1 text-primary underline-offset-4 hover:underline"
                  >
                    {formatShortUrl(detail.checkoutUrl)}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </DetailField>
              )}
            </section>

            {detail.lastError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {detail.lastError}
              </div>
            )}

            {detail.latestAttempt?.failureStage && (
              <p className="text-sm text-muted-foreground">
                Failed at stage:{" "}
                <span className="font-medium text-foreground">
                  {detail.latestAttempt.failureStage}
                </span>
              </p>
            )}

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium">Session details</h3>
                <div className="flex flex-wrap items-center gap-2">
                  {canFetchSessionDetails ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={handleFetchSessionDetails}
                    >
                      {isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      {hasSessionDetails
                        ? "Refresh from TTAI"
                        : "Fetch from TTAI"}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      No session ID available
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isWritingToSheet}
                    onClick={handleWriteToSheet}
                  >
                    {isWritingToSheet ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                    )}
                    Write to sheet
                  </Button>
                </div>
              </div>

              <TtaiCallDetails
                transcript={detail.latestAttempt?.transcript}
                aiSummary={detail.aiSummary}
                toolCallsJson={detail.latestAttempt?.toolCallsJson}
              />
            </section>
          </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function CallLogRow({
  log,
  selected,
  onSelect,
}: {
  log: CallLogEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const StatusIcon = statusIcon(log.callStatus as CallStatus);
  const when = formatCallTime(log.latestAttempt?.startedAt ?? log.updatedAt);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl border px-3 py-3.5 text-left transition-all sm:gap-4 sm:px-4",
        selected
          ? "border-primary/40 bg-primary/5 shadow-sm ring-1 ring-primary/20"
          : "border-border/60 bg-card/40 hover:border-border hover:bg-muted/40 hover:shadow-sm"
      )}
    >
      <ChevronRight
        className={cn(
          "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
          selected ? "translate-x-0.5 text-primary" : "group-hover:translate-x-0.5"
        )}
      />

      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
          log.callStatus === CallStatus.COMPLETED
            ? "bg-emerald-500/10 text-emerald-500"
            : "bg-muted text-muted-foreground group-hover:bg-muted/80"
        )}
      >
        <StatusIcon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {log.customerName ||
            (log.customerPhone ? formatPhoneNumber(log.customerPhone) : "—")}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          <span className="font-mono">
            {log.customerName && log.customerPhone
              ? formatPhoneNumber(log.customerPhone)
              : log.checkoutToken}
          </span>
          {attemptSummary(log) ? ` · ${attemptSummary(log)}` : ""}
        </p>
      </div>

      <div className="hidden w-24 shrink-0 sm:block">
        <p className="flex items-center gap-1.5 text-sm font-semibold tabular-nums">
          <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
          {formatCurrency(log.cartValue)}
        </p>
      </div>

      <div className="hidden w-36 shrink-0 items-center gap-2 sm:flex">
        <Badge variant={STATUS_VARIANT[log.callStatus as CallStatus]}>
          {formatCallStatus(log.callStatus as CallStatus)}
        </Badge>
        {log.isRepeatCustomer && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Repeat
          </span>
        )}
      </div>

      <div className="hidden w-20 shrink-0 text-right sm:block">
        <p className="flex items-center justify-end gap-1 text-sm tabular-nums text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {formatDuration(log.latestAttempt?.durationSec)}
        </p>
      </div>

      <div className="hidden w-28 shrink-0 text-right sm:block">
        <p className="whitespace-nowrap text-sm font-medium">{when.primary}</p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {when.secondary}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1 sm:hidden">
        <Badge variant={STATUS_VARIANT[log.callStatus as CallStatus]}>
          {formatCallStatus(log.callStatus as CallStatus)}
        </Badge>
        <span className="text-xs text-muted-foreground">{when.primary}</span>
      </div>
    </button>
  );
}

interface CallLogPanelProps {
  /** Totals for the header; comes from the analytics view when available. */
  summary?: { totalCalls: number; totalMinutes: number };
  /** Inclusive start instant. Older calls are hidden. */
  since?: string;
  /** Inclusive end instant. Later calls are hidden. */
  until?: string;
}

export function CallLogPanel({ summary, since, until }: CallLogPanelProps = {}) {
  const allCallLogs = useFilteredCallLogs();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const callLogs = useMemo(() => {
    const from = since ? new Date(since).getTime() : null;
    const to = until ? new Date(until).getTime() : null;
    if (from == null && to == null) return allCallLogs;
    return allCallLogs.filter((log) => {
      const at = new Date(log.latestAttempt?.startedAt ?? log.updatedAt).getTime();
      if (from != null && at < from) return false;
      if (to != null && at > to) return false;
      return true;
    });
  }, [allCallLogs, since, until]);

  const selectedLog = useMemo(
    () => callLogs.find((log) => log.id === selectedId) ?? null,
    [callLogs, selectedId]
  );

  return (
    <>
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle>Call log</CardTitle>
          <CardDescription>
            {summary
              ? `${summary.totalCalls} calls · ${summary.totalMinutes} min consumed · `
              : ""}
            Click a call to open full transcript, evaluation, and session details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {callLogs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-16 text-center">
              <Phone className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">No call activity yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Dispatched calls will appear here with full detail.
              </p>
            </div>
          ) : (
            <>
              <div className="hidden items-center gap-3 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:flex sm:gap-4 sm:px-4">
                <span className="w-4 shrink-0" aria-hidden />
                <span className="w-10 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">Customer</span>
                <span className="w-24 shrink-0">Cart value</span>
                <span className="w-36 shrink-0">Status</span>
                <span className="w-20 shrink-0 text-right">Duration</span>
                <span className="w-28 shrink-0 text-right">When</span>
              </div>

              <div className="space-y-2">
                {callLogs.map((log) => (
                  <CallLogRow
                    key={log.id}
                    log={log}
                    selected={selectedId === log.id}
                    onSelect={() => setSelectedId(log.id)}
                  />
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <CallLogDetailSheet
        log={selectedLog}
        open={selectedLog != null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </>
  );
}
