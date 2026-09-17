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
    "id" | "autoCallExcluded" | "storeDomain"
  >;
  store: Store;
  status: CallStatus;
}): Promise<{ retried: boolean; scheduledCallAt: Date | null }> {
  if (!TELEPHONY_RETRY_STATUSES.includes(params.status)) {
    return { retried: false, scheduledCallAt: null };
  }
  if (!params.store.autoCallsEnabled || params.checkout.autoCallExcluded) {
    return { retried: false, scheduledCallAt: null };
  }

  const prior = await db.callAttempt.count({
    where: {
      abandonedCheckoutId: params.checkout.id,
      status: { in: TELEPHONY_RETRY_STATUSES },
    },
  });
  if (prior > MAX_TELEPHONY_RETRIES) {
    return { retried: false, scheduledCallAt: null };
  }

  const scheduledCallAt = nextWindowOpen(new Date(), callWindowFromStore(params.store));
  await db.abandonedCheckout.update({
    where: { id: params.checkout.id },
    data: {
      callStatus: CallStatus.PENDING,
      callScheduled: true,
      scheduledCallAt,
      lastError: `Retrying after ${params.status.replace(/_/g, " ").toLowerCase()}`,
    },
  });
  return { retried: true, scheduledCallAt };
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

export async function claimDueAutoCalls(
  store: Store,
  now: Date = new Date()
): Promise<Array<AbandonedCheckout & { store: Store }>> {
  if (!store.autoCallsEnabled) return [];

  const window = callWindowFromStore(store);
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

  return db.abandonedCheckout.findMany({
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
    take: slots,
    include: { store: true },
  });
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
  now: Date = new Date()
): Promise<number> {
  const scheduledCallAt = clampToCallWindow(now, callWindowFromStore(store));
  const result = await db.abandonedCheckout.updateMany({
    where: {
      storeDomain: store.storeDomain,
      callStatus: {
        notIn: [
          CallStatus.COMPLETED,
          CallStatus.NO_ANSWER,
          CallStatus.BUSY,
          CallStatus.INVALID_NUMBER,
          CallStatus.HANG_UP,
          CallStatus.VOICEMAIL,
          CallStatus.PREPARING,
          CallStatus.DISPATCHED,
        ],
      },
      customerPhone: { not: "" },
      autoCallExcluded: false,
    },
    data: {
      callScheduled: true,
      scheduledCallAt,
      callStatus: CallStatus.PENDING,
    },
  });
  return result.count;
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
