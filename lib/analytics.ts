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

export type AnalyticsDateRange = "1d" | "7d" | "30d" | "90d" | "all";

const RANGE_DAYS: Record<Exclude<AnalyticsDateRange, "all">, number> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function calendarDateInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addCalendarDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** UTC instant for a wall-clock time on a calendar day in `timeZone`. */
export function zonedDateTime(ymd: string, time: string, timeZone: string): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  const [hour, minute, second] = time.split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = desired;
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 2; i++) {
    const map: Record<string, string> = {};
    for (const part of dtf.formatToParts(new Date(guess))) {
      if (part.type !== "literal") map[part.type] = part.value;
    }
    const actual = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour),
      Number(map.minute),
      Number(map.second),
    );
    guess += desired - actual;
  }
  return new Date(guess);
}

/** Inclusive calendar window. Today is that day in the store timezone, not UTC. */
export function analyticsRangeBounds(
  range: AnalyticsDateRange,
  timeZone = "Asia/Kolkata",
  now = new Date(),
): {
  startDate?: string;
  endDate?: string;
  start?: Date;
  end?: Date;
} {
  if (range === "all") return {};

  const endDate = calendarDateInTimeZone(now, timeZone);
  const startDate = addCalendarDays(endDate, -(RANGE_DAYS[range] - 1));
  const nextDay = addCalendarDays(endDate, 1);
  return {
    startDate,
    endDate,
    start: zonedDateTime(startDate, "00:00:00", timeZone),
    end: new Date(zonedDateTime(nextDay, "00:00:00", timeZone).getTime() - 1),
  };
}

export function analyticsDateRangeToIso(
  range: AnalyticsDateRange,
  timeZone = "Asia/Kolkata",
  now = new Date(),
): {
  startDate?: string;
  endDate?: string;
} {
  const { startDate, endDate } = analyticsRangeBounds(range, timeZone, now);
  return { startDate, endDate };
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
