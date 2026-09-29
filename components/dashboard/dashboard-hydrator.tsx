"use client";

import { useEffect } from "react";
import {
  getCheckoutLogsForStore,
  getStoresForDashboard,
} from "@/app/actions/store";
import { useAnalyticsStore } from "@/store/use-analytics-store";

interface DashboardHydratorProps {
  initialStores: Awaited<ReturnType<typeof getStoresForDashboard>>;
}

const CALL_LOG_POLL_MS = 30_000;

export function DashboardHydrator({ initialStores }: DashboardHydratorProps) {
  const setSelectedStoreDomain = useAnalyticsStore(
    (s) => s.setSelectedStoreDomain
  );
  const selectedStoreDomain = useAnalyticsStore((s) => s.selectedStoreDomain);
  const setCallLogs = useAnalyticsStore((s) => s.setCallLogs);

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
    const interval = setInterval(loadLogs, CALL_LOG_POLL_MS);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedStoreDomain, setCallLogs]);

  return null;
}
