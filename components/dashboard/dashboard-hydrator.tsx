"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  getCheckoutLogsForStore,
  getStoresForDashboard,
} from "@/app/actions/store";
import { isActiveCall } from "@/lib/call-status";
import { useVisibleInterval } from "@/hooks/use-visible-interval";
import { useAnalyticsStore } from "@/store/use-analytics-store";

interface DashboardHydratorProps {
  initialStores: Awaited<ReturnType<typeof getStoresForDashboard>>;
}

/** Poll quickly only while a call is in flight; otherwise stay quiet. */
const CALL_LOG_POLL_ACTIVE_MS = 30_000;
const CALL_LOG_POLL_IDLE_MS = 120_000;

export function DashboardHydrator({ initialStores }: DashboardHydratorProps) {
  const setSelectedStoreDomain = useAnalyticsStore(
    (s) => s.setSelectedStoreDomain
  );
  const selectedStoreDomain = useAnalyticsStore((s) => s.selectedStoreDomain);
  const setCallLogs = useAnalyticsStore((s) => s.setCallLogs);
  const hasActiveCall = useAnalyticsStore((s) =>
    s.callLogs.some((log) => isActiveCall(log.callStatus))
  );
  const activeDomain = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedStoreDomain && initialStores[0]) {
      setSelectedStoreDomain(initialStores[0].storeDomain);
    }
  }, [initialStores, selectedStoreDomain, setSelectedStoreDomain]);

  const loadLogs = useCallback(async () => {
    const domain = selectedStoreDomain;
    if (!domain) return;
    try {
      const logs = await getCheckoutLogsForStore(domain);
      // Ignore a late response if the user switched stores meanwhile.
      if (activeDomain.current === domain) {
        setCallLogs(Array.isArray(logs) ? logs : []);
      }
    } catch (error) {
      console.error("Failed to load checkout logs:", error);
    }
  }, [selectedStoreDomain, setCallLogs]);

  // Initial load when the store changes.
  useEffect(() => {
    activeDomain.current = selectedStoreDomain;
    void loadLogs();
  }, [selectedStoreDomain, loadLogs]);

  // Background refresh: paused while the tab is hidden.
  useVisibleInterval(
    loadLogs,
    selectedStoreDomain
      ? hasActiveCall
        ? CALL_LOG_POLL_ACTIVE_MS
        : CALL_LOG_POLL_IDLE_MS
      : null
  );

  return null;
}
