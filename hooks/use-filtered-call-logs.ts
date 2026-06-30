"use client";

import { useMemo } from "react";
import { useAnalyticsStore } from "@/store/use-analytics-store";

export function useFilteredCallLogs() {
  const callLogs = useAnalyticsStore((s) => s.callLogs);
  const selectedStoreDomain = useAnalyticsStore((s) => s.selectedStoreDomain);

  return useMemo(
    () =>
      selectedStoreDomain
        ? callLogs.filter((l) => l.storeDomain === selectedStoreDomain)
        : callLogs,
    [callLogs, selectedStoreDomain]
  );
}
