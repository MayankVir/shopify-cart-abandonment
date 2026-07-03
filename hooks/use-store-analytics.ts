"use client";

import { useEffect, useState } from "react";
import {
  getStoreAnalyticsView,
  type StoreAnalyticsView,
} from "@/app/actions/analytics";
import { type AnalyticsDateRange } from "@/lib/analytics";
import { useAnalyticsStore } from "@/store/use-analytics-store";

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
  const selectedStoreDomain = useAnalyticsStore((s) => s.selectedStoreDomain);
  const [data, setData] = useState<StoreAnalyticsView>(EMPTY_VIEW);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!selectedStoreDomain) {
      setData(EMPTY_VIEW);
      return;
    }

    let active = true;
    setIsLoading(true);

    getStoreAnalyticsView(selectedStoreDomain, dateRange).then((result) => {
      if (!active) return;
      setData(result);
      setIsLoading(false);
    });

    const interval = setInterval(() => {
      getStoreAnalyticsView(selectedStoreDomain, dateRange).then((result) => {
        if (active) setData(result);
      });
    }, 30_000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedStoreDomain, dateRange]);

  return { data, isLoading, selectedStoreDomain };
}
