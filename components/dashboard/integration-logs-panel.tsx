"use client";

import { Fragment, useCallback, useEffect, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import {
  getIntegrationEventOutcomes,
  getIntegrationEvents,
  type IntegrationEventDirection,
  type IntegrationEventRow,
} from "@/app/actions/integration-events";
import { useAnalyticsStore } from "@/store/use-analytics-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/dashboard/status-badge";
import type { BadgeVariant } from "@/lib/call-status";
import { formatDateTimeLabel } from "@/lib/utils";

const PAGE_SIZE = 50;
const ALL_OUTCOMES = "all";

const SOURCE_LABELS: Record<string, string> = {
  ttai: "TTAI webhook",
  shopify_checkout_update: "Shopify webhook",
  ttai_session_poll: "Session poll",
};

/** Outcomes that mean the event changed a call's state. */
const APPLIED_OUTCOMES = new Set([
  "updated",
  "ndrc_updated",
  "poll_resolved",
]);

/** Outcomes where the provider was refused or something broke on our side. */
const FAILED_OUTCOMES = new Set([
  "rejected_signature",
  "rejected_unauthorized",
  "rejected_mismatch",
  "rejected_merge",
  "invalid_json",
  "missing_identity",
  "error",
  "poll_fetch_failed",
]);

function outcomeVariant(outcome: string): BadgeVariant {
  if (APPLIED_OUTCOMES.has(outcome)) return "success";
  if (FAILED_OUTCOMES.has(outcome)) return "destructive";
  if (outcome === "ignored_no_attempt") return "warning";
  return "muted";
}

function humanize(value: string): string {
  if (!value) return "—";
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function IntegrationLogsPanel() {
  const selectedStoreDomain = useAnalyticsStore((s) => s.selectedStoreDomain);

  const [events, setEvents] = useState<IntegrationEventRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [includesUnmatched, setIncludesUnmatched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [direction, setDirection] = useState<IntegrationEventDirection>("all");
  const [outcome, setOutcome] = useState<string>(ALL_OUTCOMES);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, startLoadMore] = useTransition();

  const load = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!selectedStoreDomain) return;
      if (!silent) setIsLoading(true);

      try {
        const result = await getIntegrationEvents({
          storeDomain: selectedStoreDomain,
          direction,
          outcome: outcome === ALL_OUTCOMES ? undefined : outcome,
          search: search || undefined,
          limit: PAGE_SIZE,
        });

        if (!result.success) {
          setError(result.error ?? "Could not load logs");
          setEvents([]);
          setHasMore(false);
          return;
        }

        setError(null);
        setEvents(result.events);
        setHasMore(result.hasMore);
        setIncludesUnmatched(result.includesUnmatched);
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [selectedStoreDomain, direction, outcome, search]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedStoreDomain) return;
    let active = true;
    getIntegrationEventOutcomes(selectedStoreDomain).then((list) => {
      if (active) setOutcomes(list);
    });
    return () => {
      active = false;
    };
  }, [selectedStoreDomain]);

  function handleLoadMore() {
    const oldest = events[events.length - 1];
    if (!selectedStoreDomain || !oldest) return;

    startLoadMore(async () => {
      const result = await getIntegrationEvents({
        storeDomain: selectedStoreDomain,
        direction,
        outcome: outcome === ALL_OUTCOMES ? undefined : outcome,
        search: search || undefined,
        limit: PAGE_SIZE,
        before: oldest.receivedAt,
      });
      if (!result.success) return;
      setEvents((current) => [...current, ...result.events]);
      setHasMore(result.hasMore);
    });
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput.trim());
  }

  if (!selectedStoreDomain) {
    return (
      <Card className="border-border/60">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Select a store to see its integration events.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-border/60">
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          <Select
            value={direction}
            onValueChange={(value) =>
              setDirection(value as IntegrationEventDirection)
            }
          >
            <SelectTrigger className="h-8 w-[11rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All traffic</SelectItem>
              <SelectItem value="inbound">Inbound webhooks</SelectItem>
              <SelectItem value="poll">Session polls</SelectItem>
            </SelectContent>
          </Select>

          <Select value={outcome} onValueChange={setOutcome}>
            <SelectTrigger className="h-8 w-[13rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_OUTCOMES}>All outcomes</SelectItem>
              {outcomes.map((value) => (
                <SelectItem key={value} value={value}>
                  {humanize(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <Input
              className="h-8 w-[20rem]"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Session, call, checkout, or delivery ID"
              aria-label="Search by ID"
            />
            <Button type="submit" size="sm" variant="outline" className="h-8">
              Search
            </Button>
          </form>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto h-8"
            onClick={() => void load()}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
        </div>

        {error ? (
          <p className="px-4 py-10 text-center text-sm text-destructive">
            {error}
          </p>
        ) : isLoading && events.length === 0 ? (
          <p className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading events…
          </p>
        ) : events.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No integration events match these filters yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 px-3" />
                <TableHead className="px-3">When</TableHead>
                <TableHead className="px-3">Source</TableHead>
                <TableHead className="px-3">Event</TableHead>
                <TableHead className="px-3">Outcome</TableHead>
                <TableHead className="px-3">Session</TableHead>
                <TableHead className="px-3 text-right">Took</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => {
                const expanded = expandedId === event.id;
                return (
                  <Fragment key={event.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() =>
                        setExpandedId(expanded ? null : event.id)
                      }
                    >
                      <TableCell className="px-3 py-2 text-muted-foreground">
                        {expanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-3 py-2 text-sm">
                        {formatDateTimeLabel(event.receivedAt)}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-sm">
                        {SOURCE_LABELS[event.source] ?? event.source}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-sm text-muted-foreground">
                        {event.eventType || "—"}
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        <StatusBadge
                          label={humanize(event.outcome)}
                          variant={outcomeVariant(event.outcome)}
                          detail={event.note ?? undefined}
                        />
                      </TableCell>
                      <TableCell className="max-w-[14rem] truncate px-3 py-2 font-mono text-xs text-muted-foreground">
                        {event.sessionId ?? event.callId ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-3 py-2 text-right text-sm tabular-nums text-muted-foreground">
                        {event.processingMs != null
                          ? `${event.processingMs} ms`
                          : "—"}
                        {event.httpStatus != null ? ` · ${event.httpStatus}` : ""}
                      </TableCell>
                    </TableRow>

                    {expanded ? (
                      <TableRow>
                        <TableCell colSpan={7} className="bg-muted/30 px-3 py-3">
                          <div className="space-y-2">
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span>
                                Checkout:{" "}
                                <span className="font-mono">
                                  {event.checkoutId ?? "—"}
                                </span>
                              </span>
                              <span>
                                Attempt:{" "}
                                <span className="font-mono">
                                  {event.callAttemptId ?? "—"}
                                </span>
                              </span>
                              <span>
                                Delivery:{" "}
                                <span className="font-mono">
                                  {event.deliveryId ?? "—"}
                                </span>
                              </span>
                              <span>Payload: {formatBytes(event.payloadBytes)}</span>
                              <span>Store: {event.storeDomain ?? "unmatched"}</span>
                            </div>
                            {event.note ? (
                              <p className="text-xs text-foreground">{event.note}</p>
                            ) : null}
                            <pre className="max-h-80 overflow-auto rounded-md bg-background p-3 text-xs leading-relaxed">
                              {JSON.stringify(event.payload, null, 2)}
                            </pre>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5">
          <span className="text-xs text-muted-foreground">
            {events.length} event{events.length === 1 ? "" : "s"}
            {includesUnmatched ? " · includes unmatched webhooks" : ""}
          </span>
          {hasMore ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Loading…
                </>
              ) : (
                "Load older"
              )}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
