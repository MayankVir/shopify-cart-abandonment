import { create } from "zustand";
import { CallStatus } from "@prisma/client";

export interface CallLogEntry {
  id: string;
  checkoutToken: string;
  customerPhone: string;
  customerEmail: string | null;
  cartValue: number;
  callStatus: CallStatus;
  callScheduled: boolean;
  aiSummary: string | null;
  lastError: string | null;
  sessionId: string | null;
  storeDomain: string;
  checkoutUrl: string;
  recoveryUrl: string;
  draftOrderId: string;
  draftOrderName: string;
  createdAt: string;
  updatedAt: string;
  latestAttempt: {
    id: string;
    transcript: string | null;
    toolCallsJson: unknown;
    failureReason: string | null;
    failureStage: string | null;
    durationSec: number | null;
  } | null;
}

export interface AnalyticsMetrics {
  totalDispatched: number;
  connectedCalls: number;
  failedCalls: number;
  completedCalls: number;
}

interface AnalyticsState {
  selectedStoreDomain: string | null;
  metrics: AnalyticsMetrics;
  callLogs: CallLogEntry[];

  setSelectedStoreDomain: (domain: string | null) => void;
  setMetrics: (metrics: Partial<AnalyticsMetrics>) => void;
  setCallLogs: (logs: CallLogEntry[]) => void;
  addCallLog: (log: CallLogEntry) => void;
  updateCallStatus: (id: string, status: CallStatus, aiSummary?: string) => void;
  getFilteredCallLogs: () => CallLogEntry[];
  getFilteredMetrics: () => AnalyticsMetrics;
  reset: () => void;
}

const INITIAL_METRICS: AnalyticsMetrics = {
  totalDispatched: 0,
  connectedCalls: 0,
  failedCalls: 0,
  completedCalls: 0,
};

const FAILED_STATUSES: CallStatus[] = [
  CallStatus.NO_ANSWER,
  CallStatus.BUSY,
  CallStatus.INVALID_NUMBER,
  CallStatus.HANG_UP,
  CallStatus.VOICEMAIL,
  CallStatus.CART_CREATE_FAILED,
  CallStatus.DRAFT_CREATE_FAILED,
  CallStatus.ENRICH_FAILED,
  CallStatus.DISPATCH_FAILED,
];

function filterLogsForStore(
  logs: CallLogEntry[] | undefined,
  storeDomain: string | null
): CallLogEntry[] {
  const safe = logs ?? [];
  return storeDomain
    ? safe.filter((l) => l.storeDomain === storeDomain)
    : safe;
}

function computeMetricsFromLogs(logs: CallLogEntry[]): AnalyticsMetrics {
  return logs.reduce<AnalyticsMetrics>(
    (acc, log) => {
      if (log.callStatus === CallStatus.DISPATCHED) {
        acc.totalDispatched += 1;
      }
      if (log.callStatus === CallStatus.COMPLETED) {
        acc.connectedCalls += 1;
        acc.completedCalls += 1;
      }
      if (FAILED_STATUSES.includes(log.callStatus)) {
        acc.failedCalls += 1;
      }
      return acc;
    },
    { ...INITIAL_METRICS }
  );
}

export const useAnalyticsStore = create<AnalyticsState>((set, get) => ({
  selectedStoreDomain: null,
  metrics: { ...INITIAL_METRICS },
  callLogs: [],

  setSelectedStoreDomain: (domain) =>
    set((state) => ({
      selectedStoreDomain: domain,
      metrics: computeMetricsFromLogs(
        filterLogsForStore(state.callLogs, domain)
      ),
    })),

  setMetrics: (metrics) =>
    set((state) => ({
      metrics: { ...state.metrics, ...metrics },
    })),

  setCallLogs: (logs) => {
    const callLogs = logs ?? [];
    set({
      callLogs,
      metrics: computeMetricsFromLogs(
        filterLogsForStore(callLogs, get().selectedStoreDomain)
      ),
    });
  },

  addCallLog: (log) =>
    set((state) => {
      const exists = state.callLogs.some((l) => l.id === log.id);
      const callLogs = exists
        ? state.callLogs.map((l) => (l.id === log.id ? log : l))
        : [log, ...state.callLogs];

      const filtered = state.selectedStoreDomain
        ? callLogs.filter((l) => l.storeDomain === state.selectedStoreDomain)
        : callLogs;

      return {
        callLogs,
        metrics: computeMetricsFromLogs(filtered),
      };
    }),

  updateCallStatus: (id, status, aiSummary) =>
    set((state) => {
      const callLogs = state.callLogs.map((log) =>
        log.id === id
          ? {
              ...log,
              callStatus: status,
              aiSummary: aiSummary ?? log.aiSummary,
              updatedAt: new Date().toISOString(),
            }
          : log
      );

      const filtered = state.selectedStoreDomain
        ? callLogs.filter((l) => l.storeDomain === state.selectedStoreDomain)
        : callLogs;

      return {
        callLogs,
        metrics: computeMetricsFromLogs(filtered),
      };
    }),

  getFilteredCallLogs: () => {
    const { callLogs, selectedStoreDomain } = get();
    if (!selectedStoreDomain) return callLogs;
    return callLogs.filter((l) => l.storeDomain === selectedStoreDomain);
  },

  getFilteredMetrics: () => {
    const filtered = get().getFilteredCallLogs();
    return computeMetricsFromLogs(filtered);
  },

  reset: () =>
    set({
      selectedStoreDomain: null,
      metrics: { ...INITIAL_METRICS },
      callLogs: [],
    }),
}));
