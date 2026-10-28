"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getStoreAnalyticsView,
  type StoreAnalyticsView,
} from "@/app/actions/analytics";
import { type AnalyticsDateRange } from "@/lib/analytics";
import { useSelectedStoreDomain } from "@/components/dashboard/stores-context";
import { useVisibleInterval } from "@/hooks/use-visible-interval";

/** Analytics covers up to 30 days of attempts; it does not need to be live. */
const ANALYTICS_REFRESH_MS = 5 * 60 * 1000;

const EMPTY_VIEW: StoreAnalyticsView = {
  source: "local",
  summary: {
    totalCalls: 0,
    completedCalls: 0,
    failedCalls: 0,
    totalDurationSec: 0,
    totalMinutes: 0,
    callsWithDuration: 0,
  },
  timeSeries: [],
  attempts: [],
};

export function useStoreAnalytics(dateRange: AnalyticsDateRange = "30d") {
  const selectedStoreDomain = useSelectedStoreDomain();
  const [data, setData] = useState<StoreAnalyticsView>(EMPTY_VIEW);
  const [isLoading, setIsLoading] = useState(false);

  const latestKey = useRef("");

  useEffect(() => {
    if (!selectedStoreDomain) {
      setData(EMPTY_VIEW);
      return;
    }

    let active = true;
    latestKey.current = `${selectedStoreDomain}|${dateRange}`;
    setIsLoading(true);

    getStoreAnalyticsView(selectedStoreDomain, dateRange).then((result) => {
      if (!active) return;
      setData(result);
      setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [selectedStoreDomain, dateRange]);

  // Background refresh: only while the tab is visible, and only occasionally.
  const refresh = useCallback(() => {
    if (!selectedStoreDomain) return;
    const key = `${selectedStoreDomain}|${dateRange}`;
    getStoreAnalyticsView(selectedStoreDomain, dateRange).then((result) => {
      if (latestKey.current === key) setData(result);
    });
  }, [selectedStoreDomain, dateRange]);

  useVisibleInterval(refresh, selectedStoreDomain ? ANALYTICS_REFRESH_MS : null);

  return { data, isLoading, selectedStoreDomain };
}
