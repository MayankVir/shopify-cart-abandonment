"use client";

import { useMemo } from "react";
import { useAnalyticsStore } from "@/store/use-analytics-store";
import { useSelectedStoreDomain } from "@/components/dashboard/stores-context";

export function useFilteredCallLogs() {
  const callLogs = useAnalyticsStore((s) => s.callLogs);
  const selectedStoreDomain = useSelectedStoreDomain();

  return useMemo(
    () =>
      selectedStoreDomain
        ? callLogs.filter((l) => l.storeDomain === selectedStoreDomain)
        : callLogs,
    [callLogs, selectedStoreDomain]
  );
}
