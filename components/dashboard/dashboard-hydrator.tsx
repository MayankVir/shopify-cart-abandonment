"use client";

import { useEffect } from "react";
import { CallStatus } from "@prisma/client";
import {
  getCheckoutLogsForStore,
  getStoresForDashboard,
} from "@/app/actions/store";
import { isActiveCall } from "@/lib/call-status";
import { useAnalyticsStore } from "@/store/use-analytics-store";

interface DashboardHydratorProps {
  initialStores: Awaited<ReturnType<typeof getStoresForDashboard>>;
}

const CALL_LOG_POLL_MS = 15_000;
const CALL_LOG_POLL_ACTIVE_MS = 5_000;

export function DashboardHydrator({ initialStores }: DashboardHydratorProps) {
  const setSelectedStoreDomain = useAnalyticsStore(
    (s) => s.setSelectedStoreDomain
  );
  const selectedStoreDomain = useAnalyticsStore((s) => s.selectedStoreDomain);
  const setCallLogs = useAnalyticsStore((s) => s.setCallLogs);
  const callLogs = useAnalyticsStore((s) => s.callLogs);

  const hasInFlightCalls = callLogs.some((log) =>
    isActiveCall(log.callStatus as CallStatus)
  );

  useEffect(() => {
    if (!selectedStoreDomain && initialStores[0]) {
      setSelectedStoreDomain(initialStores[0].storeDomain);
    }
  }, [initialStores, selectedStoreDomain, setSelectedStoreDomain]);

  useEffect(() => {
    if (!selectedStoreDomain) return;

    let active = true;

    async function loadLogs() {
      try {
        const logs = await getCheckoutLogsForStore(selectedStoreDomain!);
        if (active) {
          setCallLogs(Array.isArray(logs) ? logs : []);
        }
      } catch (error) {
        console.error("Failed to load checkout logs:", error);
      }
    }

    loadLogs();
    const intervalMs = hasInFlightCalls
      ? CALL_LOG_POLL_ACTIVE_MS
      : CALL_LOG_POLL_MS;
    const interval = setInterval(loadLogs, intervalMs);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedStoreDomain, setCallLogs, hasInFlightCalls]);

  return null;
}
