import { CallStatus, type AbandonedCheckout, type Store } from "@prisma/client";
import { db } from "@/lib/db";
import {
  callWindowFromStore,
  clampToCallWindow,
  isInCallWindow,
  nextWindowOpen,
  type CallWindowConfig,
} from "@/lib/call-window";
import { recordPipelineEvent } from "@/lib/call-pipeline-events";
import { sanitizeRecoveryError } from "@/lib/recovery-error";
import {
  callStatusesForEnrollment,
  DEFAULT_AUTO_CALL_ENROLLMENT,
  type AutoCallEnrollmentSelection,
} from "@/lib/call-status";
import {
  BUSY_TERMINAL_ERROR,
  clampBusyRetryDelayMinutes,
} from "@/lib/busy-retry";

export const MAX_PRE_CALL_RETRIES = 3;
export const MAX_TELEPHONY_RETRIES = 1;
export const PRE_CALL_RETRY_BACKOFF_MS = [
  5 * 60 * 1000,
  15 * 60 * 1000,
  45 * 60 * 1000,
] as const;

export const TELEPHONY_RETRY_STATUSES: CallStatus[] = [
  CallStatus.NO_ANSWER,
  CallStatus.BUSY,
  CallStatus.VOICEMAIL,
];


export function sipConcurrencySlots(sipConcurrency: number): number {
  return Math.min(10, Math.max(1, sipConcurrency));
}

export function nextPreCallRetryAt(
  autoRetryCount: number,
  window: CallWindowConfig,
  now: Date = new Date()
): Date | null {
  if (autoRetryCount >= MAX_PRE_CALL_RETRIES) return null;
  const backoff =
    PRE_CALL_RETRY_BACKOFF_MS[autoRetryCount] ??
    PRE_CALL_RETRY_BACKOFF_MS[PRE_CALL_RETRY_BACKOFF_MS.length - 1];
  return clampToCallWindow(new Date(now.getTime() + backoff), window);
}

export async function schedulePreCallRetry(params: {
  checkoutId: string;
  store: Store;
  autoRetryCount: number;
  autoCallExcluded: boolean;
  failureStatus: CallStatus;
  reason: string;
}): Promise<{ retried: boolean; scheduledCallAt: Date | null }> {
  const window = callWindowFromStore(params.store);
  const canAutoRetry =
    params.store.autoCallsEnabled &&
    !params.autoCallExcluded &&
    params.autoRetryCount < MAX_PRE_CALL_RETRIES;
  const scheduledCallAt = canAutoRetry
    ? nextPreCallRetryAt(params.autoRetryCount, window)
    : null;

  if (scheduledCallAt) {
    await db.abandonedCheckout.update({
      where: { id: params.checkoutId },
      data: {
        callStatus: CallStatus.PENDING,
        callScheduled: true,
        scheduledCallAt,
        autoRetryCount: params.autoRetryCount + 1,
        lastError: sanitizeRecoveryError(params.reason),
      },
    });
    return { retried: true, scheduledCallAt };
  }

  await db.abandonedCheckout.update({
    where: { id: params.checkoutId },
    data: {
      callStatus: params.failureStatus,
      callScheduled: false,
      lastError: sanitizeRecoveryError(params.reason),
    },
  });
  return { retried: false, scheduledCallAt: null };
}

export async function maybeScheduleTelephonyRetry(params: {
  checkout: Pick<
    AbandonedCheckout,
    "id" | "autoCallExcluded" | "storeDomain" | "telephonyRetryCount"
  >;
  store: Store;
  status: CallStatus;
  now?: Date;
}): Promise<{ retried: boolean; scheduledCallAt: Date | null }> {
  if (!TELEPHONY_RETRY_STATUSES.includes(params.status)) {
    return { retried: false, scheduledCallAt: null };
  }
  if (!params.store.autoCallsEnabled || params.checkout.autoCallExcluded) {
    return { retried: false, scheduledCallAt: null };
  }
  if (params.status === CallStatus.BUSY && !params.store.busyRetryEnabled) {
    return { retried: false, scheduledCallAt: null };
  }

  const prior = await db.callAttempt.count({
    where: {
      abandonedCheckoutId: params.checkout.id,
      status: { in: TELEPHONY_RETRY_STATUSES },
    },
  });
  // The column is the count we persist. The attempt count still guards carts
  // that were retried before the column existed.
  if (
    params.checkout.telephonyRetryCount >= MAX_TELEPHONY_RETRIES ||
    prior > MAX_TELEPHONY_RETRIES
  ) {
    return { retried: false, scheduledCallAt: null };
  }

  const now = params.now ?? new Date();
  const window = callWindowFromStore(params.store);
  // Busy numbers are worth another try sooner than "tomorrow", so they use the
  // merchant's configured delay; the rest wait for the next window opening.
  const scheduledCallAt =
    params.status === CallStatus.BUSY
      ? busyRetryDueAt(now, params.store, now)
      : nextWindowOpen(now, window);

  await db.abandonedCheckout.update({
    where: { id: params.checkout.id },
    data: {
      callStatus: CallStatus.PENDING,
      callScheduled: true,
      scheduledCallAt,
      retryReason: params.status,
      telephonyRetryCount: { increment: 1 },
      lastError: `Retrying after ${params.status.replace(/_/g, " ").toLowerCase()}`,
    },
  });
  return { retried: true, scheduledCallAt };
}

/** When a busy call that failed at `failedAt` becomes due, never in the past. */
function busyRetryDueAt(failedAt: Date, store: Store, now: Date): Date {
  const delayMs = clampBusyRetryDelayMinutes(store.busyRetryDelayMinutes) * 60_000;
  const due = new Date(
    Math.max(now.getTime(), failedAt.getTime() + delayMs)
  );
  return clampToCallWindow(due, callWindowFromStore(store));
}

/**
 * Turning busy retries off: rows waiting on a busy retry stop waiting and show
 * their real outcome instead of a schedule that will never run.
 */
export async function cancelScheduledBusyRetries(
  storeDomain: string
): Promise<number> {
  const { count } = await db.abandonedCheckout.updateMany({
    where: {
      storeDomain,
      callStatus: CallStatus.PENDING,
      retryReason: CallStatus.BUSY,
    },
    data: {
      callStatus: CallStatus.BUSY,
      callScheduled: false,
      retryReason: null,
      lastError: BUSY_TERMINAL_ERROR,
    },
  });
  return count;
}

/**
 * Turning busy retries on: rows that ended on a busy signal go back in the
 * queue, due `busyRetryDelayMinutes` after they failed. Rows that already used
 * their telephony retry, or that the merchant pulled out of automation, stay put.
 */
export async function rescheduleBusyFailures(
  store: Store,
  now: Date = new Date()
): Promise<number> {
  const candidates = await db.abandonedCheckout.findMany({
    where: {
      storeDomain: store.storeDomain,
      callStatus: CallStatus.BUSY,
      autoCallExcluded: false,
      customerPhone: { not: "" },
    },
    select: { id: true, updatedAt: true },
  });
  if (candidates.length === 0) return 0;

  const attemptCounts = await db.callAttempt.groupBy({
    by: ["abandonedCheckoutId"],
    where: {
      abandonedCheckoutId: { in: candidates.map((row) => row.id) },
      status: { in: TELEPHONY_RETRY_STATUSES },
    },
    _count: { _all: true },
  });
  const attemptsById = new Map(
    attemptCounts.map((row) => [row.abandonedCheckoutId, row._count._all])
  );

  let rescheduled = 0;
  for (const row of candidates) {
    if ((attemptsById.get(row.id) ?? 0) > MAX_TELEPHONY_RETRIES) continue;

    await db.abandonedCheckout.update({
      where: { id: row.id },
      data: {
        callStatus: CallStatus.PENDING,
        callScheduled: true,
        scheduledCallAt: busyRetryDueAt(row.updatedAt, store, now),
        retryReason: CallStatus.BUSY,
        lastError: "Retrying after busy",
      },
    });
    rescheduled++;
  }
  return rescheduled;
}

export async function deferOffWindowDueCalls(
  store: Store,
  now: Date = new Date()
): Promise<number> {
  const window = callWindowFromStore(store);
  if (!window.enabled || isInCallWindow(now, window)) return 0;

  const due = await db.abandonedCheckout.findMany({
    where: {
      storeDomain: store.storeDomain,
      callStatus: CallStatus.PENDING,
      callScheduled: true,
      customerPhone: { not: "" },
      scheduledCallAt: { lte: now },
    },
    orderBy: [
      { scheduledCallAt: "asc" },
      { shopifyCreatedAt: { sort: "asc", nulls: "last" } },
      { createdAt: "asc" },
    ],
    select: { id: true },
  });

  if (due.length === 0) return 0;

  const nextOpen = clampToCallWindow(now, window);
  await db.$transaction(
    due.map((row, index) =>
      db.abandonedCheckout.update({
        where: { id: row.id },
        data: { scheduledCallAt: new Date(nextOpen.getTime() + index) },
      })
    )
  );
  return due.length;
}

/**
 * A row stuck in PREPARING for this long never reached SIP dispatch (crashed or
 * timed-out worker), so its concurrency slot is reclaimed.
 */
export const STALE_PREPARING_MS = 10 * 60 * 1000;

/** Extra candidates read per claim so rows lost to a racing worker don't shrink the batch. */
const CLAIM_OVERFETCH = 5;

export async function requeueStalePreparingCalls(
  store: Store,
  now: Date = new Date()
): Promise<number> {
  const staleBefore = new Date(now.getTime() - STALE_PREPARING_MS);
  const stale = {
    storeDomain: store.storeDomain,
    callStatus: CallStatus.PREPARING,
    updatedAt: { lt: staleBefore },
  };

  // Rows the merchant took out of automation only get their slot back; they are
  // not put on the wire again.
  await db.abandonedCheckout.updateMany({
    where: { ...stale, autoCallExcluded: true },
    data: {
      callStatus: CallStatus.DISPATCH_FAILED,
      callScheduled: false,
      lastError: "Dispatch stalled before the call was placed",
    },
  });

  const { count } = await db.abandonedCheckout.updateMany({
    where: { ...stale, autoCallExcluded: false },
    data: {
      callStatus: CallStatus.PENDING,
      callScheduled: true,
      scheduledCallAt: clampToCallWindow(now, callWindowFromStore(store)),
      lastError: "Requeued after a stalled dispatch",
    },
  });
  return count;
}

/**
 * Takes up to `sipConcurrency` due rows out of the queue and marks them
 * PREPARING so they occupy a concurrency slot for the whole dispatch, not just
 * once the call is live. Claiming is a compare-and-swap per row, so two
 * overlapping runs (cron plus a dashboard sync) can never claim the same row.
 */
export async function claimDueAutoCalls(
  store: Store,
  now: Date = new Date()
): Promise<Array<AbandonedCheckout & { store: Store }>> {
  const window = callWindowFromStore(store);
  await requeueStalePreparingCalls(store, now);
  await deferOffWindowDueCalls(store, now);
  if (!isInCallWindow(now, window)) return [];

  const concurrency = sipConcurrencySlots(store.sipConcurrency);
  const inFlight = await db.abandonedCheckout.count({
    where: {
      storeDomain: store.storeDomain,
      callStatus: { in: [CallStatus.PREPARING, CallStatus.DISPATCHED] },
    },
  });
  const slots = Math.max(0, concurrency - inFlight);
  if (slots === 0) return [];

  const candidates = await db.abandonedCheckout.findMany({
    where: {
      storeDomain: store.storeDomain,
      callStatus: CallStatus.PENDING,
      callScheduled: true,
      customerPhone: { not: "" },
      scheduledCallAt: { lte: now },
    },
    orderBy: [
      { scheduledCallAt: "asc" },
      { shopifyCreatedAt: { sort: "asc", nulls: "last" } },
      { createdAt: "asc" },
    ],
    take: slots + CLAIM_OVERFETCH,
    select: { id: true },
  });

  const claimedIds: string[] = [];
  for (const candidate of candidates) {
    if (claimedIds.length >= slots) break;
    const claim = await db.abandonedCheckout.updateMany({
      where: {
        id: candidate.id,
        callStatus: CallStatus.PENDING,
        callScheduled: true,
      },
      data: {
        callStatus: CallStatus.PREPARING,
        callScheduled: false,
        retryReason: null,
        lastError: null,
      },
    });
    if (claim.count === 1) claimedIds.push(candidate.id);
  }

  if (claimedIds.length === 0) return [];

  return db.abandonedCheckout.findMany({
    where: { id: { in: claimedIds } },
    orderBy: [
      { scheduledCallAt: "asc" },
      { shopifyCreatedAt: { sort: "asc", nulls: "last" } },
      { createdAt: "asc" },
    ],
    include: { store: true },
  });
}

/**
 * Frees the slot held by a claimed row when the pipeline bailed without
 * recording an outcome of its own. No-op once the pipeline has already moved
 * the row to a failure status or scheduled a retry.
 */
export async function releaseClaimedCheckout(
  checkoutId: string,
  reason: string
): Promise<boolean> {
  const { count } = await db.abandonedCheckout.updateMany({
    where: { id: checkoutId, callStatus: CallStatus.PREPARING },
    data: {
      callStatus: CallStatus.DISPATCH_FAILED,
      callScheduled: false,
      lastError: sanitizeRecoveryError(reason),
    },
  });
  return count === 1;
}

export async function markQueueClaimed(
  checkout: Pick<AbandonedCheckout, "id" | "storeDomain">,
  trigger: "auto" | "manual"
): Promise<void> {
  await recordPipelineEvent(
    { checkoutId: checkout.id, storeDomain: checkout.storeDomain, trigger },
    "claimed",
    "succeeded"
  );
}

export async function enrollOpenCheckoutsForAutoCall(
  store: Store,
  now: Date = new Date(),
  selection: AutoCallEnrollmentSelection = DEFAULT_AUTO_CALL_ENROLLMENT
): Promise<number> {
  const statuses = callStatusesForEnrollment(selection);
  if (statuses.length === 0) return 0;

  const scheduledCallAt = clampToCallWindow(now, callWindowFromStore(store));
  const open = await db.abandonedCheckout.findMany({
    where: {
      storeDomain: store.storeDomain,
      callStatus: { in: statuses },
    },
    select: { id: true, customerPhone: true },
  });
  const ids = open
    .filter((row) => row.customerPhone.trim().length > 0)
    .map((row) => row.id);

  if (ids.length === 0) return 0;

  await db.abandonedCheckout.updateMany({
    where: { id: { in: ids } },
    data: {
      callScheduled: true,
      scheduledCallAt,
      callStatus: CallStatus.PENDING,
      autoCallExcluded: false,
    },
  });
  return ids.length;
}

export async function unschedulePendingAutoCalls(storeDomain: string): Promise<void> {
  await db.abandonedCheckout.updateMany({
    where: {
      storeDomain,
      callStatus: CallStatus.PENDING,
    },
    data: { callScheduled: false },
  });
}
