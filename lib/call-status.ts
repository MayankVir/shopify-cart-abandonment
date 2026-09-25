import { CallStatus } from "@prisma/client";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "success"
  | "warning"
  | "info"
  | "muted"
  | "soft";

export const STATUS_VARIANT: Record<CallStatus, BadgeVariant> = {
  PENDING: "muted",
  PREPARING: "info",
  DISPATCHED: "info",
  COMPLETED: "success",
  NO_ANSWER: "warning",
  BUSY: "warning",
  INVALID_NUMBER: "destructive",
  HANG_UP: "secondary",
  VOICEMAIL: "warning",
  CART_CREATE_FAILED: "destructive",
  DRAFT_CREATE_FAILED: "destructive",
  ENRICH_FAILED: "destructive",
  DISPATCH_FAILED: "destructive",
  ALREADY_PLACED_ORDER: "info",
  SUPERSEDED: "soft",
};

/** Pre-call pipeline failures — kept on CallAttempt, not on AbandonedCheckout. */
export const PRE_CALL_FAILURE_STATUSES: CallStatus[] = [
  CallStatus.CART_CREATE_FAILED,
  CallStatus.DRAFT_CREATE_FAILED,
  CallStatus.ENRICH_FAILED,
  CallStatus.DISPATCH_FAILED,
];

export const FAILURE_STATUSES: CallStatus[] = [...PRE_CALL_FAILURE_STATUSES];

/**
 * Calls deliberately not placed: the customer already ordered, or a newer cart
 * for the same phone is being called instead. Terminal, but not failures.
 */
export const SKIPPED_STATUSES: CallStatus[] = [
  CallStatus.ALREADY_PLACED_ORDER,
  CallStatus.SUPERSEDED,
];

const STATUS_LABELS: Partial<Record<CallStatus, string>> = {
  DRAFT_CREATE_FAILED: "Draft prep failed",
  CART_CREATE_FAILED: "Cart prep failed",
  ENRICH_FAILED: "Enrichment failed",
  /** Covers both a failed SIP dispatch and a carrier failure with no reason. */
  DISPATCH_FAILED: "Call failed",
  ALREADY_PLACED_ORDER: "Order placed already",
  SUPERSEDED: "Duplicate cart",
  BUSY: "Call failed - Busy",
  NO_ANSWER: "No answer",
  VOICEMAIL: "Voicemail",
  INVALID_NUMBER: "Invalid number",
  HANG_UP: "Hung up",
};

/** Only consulted when the error mentions SIP, so HTTP codes aren't misread. */
const SIP_CODE_REASONS: Record<string, string> = {
  "404": "Invalid number",
  "408": "No answer",
  "480": "No answer",
  "484": "Invalid number",
  "486": "User busy",
  "487": "Call cancelled",
  "503": "Carrier unavailable",
  "603": "Call declined",
};

/** Carrier wording varies by provider, so fall back to matching the text. */
const CARRIER_REASON_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/user\s*busy|\bbusy\b/i, "User busy"],
  [/no[\s_-]*answer|temporarily\s*unavailable/i, "No answer"],
  [/voicemail/i, "Voicemail"],
  [/invalid[\s_-]*number|not\s*in\s*service|unallocated/i, "Invalid number"],
  [/declined|rejected/i, "Call declined"],
  [/hung?\s*up|hangup/i, "Hung up"],
  [/timed?[\s_-]*out|timeout/i, "Timed out"],
];

const STATUS_FALLBACK_REASONS: Partial<Record<CallStatus, string>> = {
  BUSY: "User busy",
  NO_ANSWER: "No answer",
  VOICEMAIL: "Voicemail",
  INVALID_NUMBER: "Invalid number",
  HANG_UP: "Hung up",
  CART_CREATE_FAILED: "Cart could not be created",
  DRAFT_CREATE_FAILED: "Draft order could not be created",
  ENRICH_FAILED: "Context enrichment failed",
};

const MAX_DETAIL_LENGTH = 200;

/**
 * Human-readable "why" for a failed or retrying call, for tooltips. Prefers a
 * recognized carrier reason, then the raw error, then a status-based guess.
 */
export function describeCallFailure(
  status: CallStatus,
  lastError?: string | null
): string {
  const text = lastError?.trim() ?? "";

  if (/\bsip\b/i.test(text)) {
    const code = text.match(/\b([1-6]\d\d)\b/)?.[1];
    const sipReason = code ? SIP_CODE_REASONS[code] : undefined;
    if (sipReason) return sipReason;
  }

  for (const [pattern, reason] of CARRIER_REASON_PATTERNS) {
    if (pattern.test(text)) return reason;
  }

  if (text) {
    return text.length > MAX_DETAIL_LENGTH
      ? `${text.slice(0, MAX_DETAIL_LENGTH - 1)}…`
      : text;
  }

  return STATUS_FALLBACK_REASONS[status] ?? "Unknown error";
}

export const TERMINAL_FAILURE_STATUSES: CallStatus[] = [
  CallStatus.NO_ANSWER,
  CallStatus.BUSY,
  CallStatus.INVALID_NUMBER,
  CallStatus.HANG_UP,
  CallStatus.VOICEMAIL,
  ...FAILURE_STATUSES,
];

export function formatCallStatus(status: CallStatus): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export function displayCheckoutStatus(
  status: CallStatus,
  callScheduled: boolean,
  lastError?: string | null
): { label: string; variant: BadgeVariant; detail?: string } {
  if (status === CallStatus.PENDING) {
    if (callScheduled && lastError) {
      return {
        label: "Retry scheduled",
        variant: "warning",
        detail: describeCallFailure(status, lastError),
      };
    }
    return callScheduled
      ? { label: "Scheduled", variant: "info" }
      : { label: "Pending", variant: "muted" };
  }

  const isFailure = TERMINAL_FAILURE_STATUSES.includes(status);

  return {
    label: formatCallStatus(status),
    variant: STATUS_VARIANT[status],
    detail:
      isFailure || lastError?.trim()
        ? describeCallFailure(status, lastError)
        : undefined,
  };
}

export function isActiveCall(status: CallStatus): boolean {
  return status === CallStatus.PREPARING || status === CallStatus.DISPATCHED;
}

export function canInitiateCall(status: CallStatus): boolean {
  return (
    status === CallStatus.PENDING ||
    status === CallStatus.BUSY ||
    FAILURE_STATUSES.includes(status) ||
    SKIPPED_STATUSES.includes(status)
  );
}

export function canStopCall(status: CallStatus, callScheduled: boolean): boolean {
  return isActiveCall(status) || (status === CallStatus.PENDING && callScheduled);
}

export function canSelectCheckout(
  status: CallStatus,
  callScheduled: boolean,
  phone: string | null | undefined
): boolean {
  return canEditSchedule(status, phone) || canStopCall(status, callScheduled);
}

export function canEditSchedule(
  status: CallStatus,
  phone: string | null | undefined
): boolean {
  if (!phone?.trim()) return false;
  if (isActiveCall(status) || status === CallStatus.COMPLETED) return false;
  return true;
}

/** Drawer callback: a finished call can be queued again at a chosen time. */
export function canScheduleCallback(
  status: CallStatus,
  phone: string | null | undefined
): boolean {
  if (!phone?.trim() || isActiveCall(status)) return false;
  return canEditSchedule(status, phone) || status === CallStatus.COMPLETED;
}

export function shouldScheduleAutoCall(
  autoCallsEnabled: boolean,
  phone: string | null | undefined
): boolean {
  return autoCallsEnabled && Boolean(phone?.trim());
}

export function nextCallScheduledFlag(
  autoCallsEnabled: boolean,
  phone: string | null | undefined,
  existing?: {
    callScheduled: boolean;
    callStatus: CallStatus;
    autoCallExcluded?: boolean;
  } | null
): boolean {
  if (existing?.autoCallExcluded) {
    return false;
  }
  if (existing && existing.callStatus !== CallStatus.PENDING) {
    return existing.callScheduled;
  }
  return shouldScheduleAutoCall(autoCallsEnabled, phone);
}
