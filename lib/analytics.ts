import {
  durationSecFromTtaiSession,
  type TtaiSessionDetails,
} from "@/lib/ttai";

function sessionDetailsFromToolCalls(
  toolCallsJson: unknown
): TtaiSessionDetails | undefined {
  if (!toolCallsJson || typeof toolCallsJson !== "object") return undefined;
  const store = toolCallsJson as { sessionDetails?: TtaiSessionDetails };
  return store.sessionDetails;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export function formatMinutes(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0 min";
  const minutes = totalSeconds / 60;
  if (minutes < 1) return `${Math.round(totalSeconds)}s`;
  return `${minutes.toFixed(1)} min`;
}

export type AnalyticsDateRange = "7d" | "30d" | "90d" | "all";

export function analyticsDateRangeToIso(range: AnalyticsDateRange): {
  startDate?: string;
  endDate?: string;
} {
  if (range === "all") return {};

  const end = new Date();
  const start = new Date();
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  start.setDate(end.getDate() - days);

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export function durationSecFromAttempt(attempt: {
  durationSec: number | null;
  startedAt: Date;
  endedAt: Date | null;
  toolCallsJson: unknown;
}): number {
  if (attempt.durationSec != null && attempt.durationSec > 0) {
    return attempt.durationSec;
  }

  const fromSession = durationSecFromTtaiSession(
    sessionDetailsFromToolCalls(attempt.toolCallsJson)
  );
  if (fromSession != null && fromSession > 0) {
    return fromSession;
  }

  if (attempt.endedAt) {
    return Math.max(
      0,
      Math.round(
        (attempt.endedAt.getTime() - attempt.startedAt.getTime()) / 1000
      )
    );
  }

  return 0;
}
