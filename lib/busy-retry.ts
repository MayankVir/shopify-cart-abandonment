/** Busy-retry policy constants, shared by the queue and the settings form. */

export const MIN_BUSY_RETRY_DELAY_MINUTES = 15;
/** 14 days. */
export const MAX_BUSY_RETRY_DELAY_MINUTES = 14 * 24 * 60;
export const DEFAULT_BUSY_RETRY_DELAY_MINUTES = 24 * 60;

/** Message left on a busy row once it is no longer waiting for a retry. */
export const BUSY_TERMINAL_ERROR = "Call failed (busy)";

export function clampBusyRetryDelayMinutes(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BUSY_RETRY_DELAY_MINUTES;
  return Math.min(
    MAX_BUSY_RETRY_DELAY_MINUTES,
    Math.max(MIN_BUSY_RETRY_DELAY_MINUTES, Math.round(value))
  );
}

export type RetryDelayUnit = "hours" | "days";

/** Minutes are stored; the form edits them as a round number of hours or days. */
export function splitRetryDelay(minutes: number): {
  value: number;
  unit: RetryDelayUnit;
} {
  const safe = clampBusyRetryDelayMinutes(minutes);
  if (safe % (24 * 60) === 0) {
    return { value: safe / (24 * 60), unit: "days" };
  }
  return { value: Math.max(1, Math.round(safe / 60)), unit: "hours" };
}

export function joinRetryDelay(value: number, unit: RetryDelayUnit): number {
  const perUnit = unit === "days" ? 24 * 60 : 60;
  return clampBusyRetryDelayMinutes((Number(value) || 0) * perUnit);
}
