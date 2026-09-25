export const DEFAULT_IANA_TIMEZONE = "Asia/Kolkata";
export const DEFAULT_CALL_WINDOW_START_MINUTE = 9 * 60;
export const DEFAULT_CALL_WINDOW_END_MINUTE = 21 * 60;

export const COMMON_IANA_TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
] as const;

export interface CallWindowConfig {
  enabled: boolean;
  timeZone: string;
  startMinute: number;
  endMinute: number;
}

export type StoreCallWindowFields = {
  ianaTimezone: string | null;
  ianaTimezoneOverride?: string | null;
  callWindowEnabled: boolean;
  callWindowStartMinute: number;
  callWindowEndMinute: number;
};

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function resolveStoreTimeZone(store: {
  ianaTimezone?: string | null;
  ianaTimezoneOverride?: string | null;
}): string {
  const override = store.ianaTimezoneOverride?.trim();
  if (override && isValidTimeZone(override)) return override;
  const shop = store.ianaTimezone?.trim();
  if (shop && isValidTimeZone(shop)) return shop;
  return DEFAULT_IANA_TIMEZONE;
}

export function callWindowFromStore(store: StoreCallWindowFields): CallWindowConfig {
  return {
    enabled: store.callWindowEnabled,
    timeZone: resolveStoreTimeZone(store),
    startMinute: clampWindowMinute(store.callWindowStartMinute, DEFAULT_CALL_WINDOW_START_MINUTE),
    endMinute: clampWindowMinute(store.callWindowEndMinute, DEFAULT_CALL_WINDOW_END_MINUTE),
  };
}

export function clampWindowMinute(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(24 * 60, Math.max(0, Math.round(value)));
}

export function minutesToTimeInput(minutes: number): string {
  const clamped = clampWindowMinute(minutes, 0);
  const hour = Math.floor(clamped / 60) % 24;
  const minute = clamped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function timeInputToMinutes(value: string, fallback: number): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) {
    return fallback;
  }
  return hour * 60 + minute;
}

function zonedParts(date: Date, timeZone: string): ZonedParts {
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
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return asUtc - date.getTime();
}

/** Wall-clock time in `timeZone`, as a UTC instant. */
export function wallTimeInZoneToUtc(
  parts: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second?: number;
  },
  timeZone: string
): Date {
  return zonedWallTimeToUtc(parts, timeZone);
}

function zonedWallTimeToUtc(
  parts: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second?: number;
  },
  timeZone: string
): Date {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second ?? 0
  );
  let date = new Date(utcGuess);
  date = new Date(utcGuess - tzOffsetMs(date, timeZone));
  date = new Date(utcGuess - tzOffsetMs(date, timeZone));
  return date;
}

function addCalendarDays(parts: ZonedParts, days: number): Pick<ZonedParts, "year" | "month" | "day"> {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function minuteOfDay(parts: ZonedParts): number {
  return parts.hour * 60 + parts.minute;
}

function startClock(config: CallWindowConfig): { hour: number; minute: number } {
  return {
    hour: Math.floor(config.startMinute / 60),
    minute: config.startMinute % 60,
  };
}

export function isInCallWindow(
  date: Date,
  config: CallWindowConfig
): boolean {
  if (!config.enabled) return true;
  if (config.startMinute >= config.endMinute) return true;
  const minutes = minuteOfDay(zonedParts(date, config.timeZone));
  return minutes >= config.startMinute && minutes < config.endMinute;
}

export function clampToCallWindow(
  candidate: Date,
  config: CallWindowConfig
): Date {
  if (!config.enabled) return candidate;
  if (config.startMinute >= config.endMinute) return candidate;

  const tz = config.timeZone;
  const parts = zonedParts(candidate, tz);
  const minutes = minuteOfDay(parts);
  const start = startClock(config);

  if (minutes >= config.startMinute && minutes < config.endMinute) {
    return candidate;
  }

  if (minutes < config.startMinute) {
    return zonedWallTimeToUtc(
      {
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hour: start.hour,
        minute: start.minute,
        second: 0,
      },
      tz
    );
  }

  const next = addCalendarDays(parts, 1);
  return zonedWallTimeToUtc(
    {
      year: next.year,
      month: next.month,
      day: next.day,
      hour: start.hour,
      minute: start.minute,
      second: 0,
    },
    tz
  );
}

/** Next day's window open (used for telephony retries). */
export function nextWindowOpen(now: Date, config: CallWindowConfig): Date {
  if (!config.enabled) {
    return new Date(now.getTime() + 12 * 60 * 60 * 1000);
  }
  const parts = zonedParts(now, config.timeZone);
  const next = addCalendarDays(parts, 1);
  const start = startClock(config);
  return zonedWallTimeToUtc(
    {
      year: next.year,
      month: next.month,
      day: next.day,
      hour: start.hour,
      minute: start.minute,
      second: 0,
    },
    config.timeZone
  );
}

export function formatTimeZoneLabel(timeZone: string): string {
  try {
    const offset = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
      hour: "2-digit",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value;
    return offset ? `${timeZone} (${offset})` : timeZone;
  } catch {
    return timeZone;
  }
}
