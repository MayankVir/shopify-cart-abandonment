"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  getCallAnalyticsForStore,
  type CallAttemptRow,
  type CallAnalyticsSummary,
} from "@/app/actions/analytics";
import { useAnalyticsStore } from "@/store/use-analytics-store";
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

const EMPTY_SUMMARY: CallAnalyticsSummary = {
  totalCalls: 0,
  completedCalls: 0,
  failedCalls: 0,
  totalDurationSec: 0,
  totalMinutes: 0,
  callsWithDuration: 0,
};

export function AnalyticsDataPanel() {
  const selectedStoreDomain = useAnalyticsStore((s) => s.selectedStoreDomain);
  const [summary, setSummary] = useState<CallAnalyticsSummary>(EMPTY_SUMMARY);
  const [attempts, setAttempts] = useState<CallAttemptRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!selectedStoreDomain) {
      setSummary(EMPTY_SUMMARY);
      setAttempts([]);
      return;
    }

    let active = true;
    setIsLoading(true);

    getCallAnalyticsForStore(selectedStoreDomain).then((result) => {
      if (!active) return;
      setSummary(result.summary);
      setAttempts(result.attempts);
      setIsLoading(false);
    });

    const interval = setInterval(() => {
      getCallAnalyticsForStore(selectedStoreDomain).then((result) => {
        if (active) {
          setSummary(result.summary);
          setAttempts(result.attempts);
        }
      });
    }, 15_000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedStoreDomain]);

  if (!selectedStoreDomain) {
    return null;
  }

  if (isLoading && attempts.length === 0) {
    return (
      <Card className="border-border/60">
        <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading call analytics…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle>Call log</CardTitle>
        <CardDescription>
          {summary.totalCalls} calls · {summary.totalMinutes} min consumed
          {summary.callsWithDuration < summary.totalCalls &&
            ` · ${summary.totalCalls - summary.callsWithDuration} pending duration`}
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

export function useAnalyticsSummary() {
  const selectedStoreDomain = useAnalyticsStore((s) => s.selectedStoreDomain);
  const [summary, setSummary] = useState<CallAnalyticsSummary>(EMPTY_SUMMARY);

  useEffect(() => {
    if (!selectedStoreDomain) {
      setSummary(EMPTY_SUMMARY);
      return;
    }

    let active = true;
    getCallAnalyticsForStore(selectedStoreDomain).then((result) => {
      if (active) setSummary(result.summary);
    });

    return () => {
      active = false;
    };
  }, [selectedStoreDomain]);

  return summary;
}
