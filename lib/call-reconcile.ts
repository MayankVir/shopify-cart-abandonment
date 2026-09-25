import { CallStatus, type Store } from "@prisma/client";
import { db } from "@/lib/db";
import { maybeScheduleTelephonyRetry } from "@/lib/call-queue";
import { recordPipelineEvent } from "@/lib/call-pipeline-events";
import { sanitizeRecoveryError } from "@/lib/recovery-error";
import {
  fetchTtaiSessionDetails,
  mapTtaiStatusToCallStatus,
  type TtaiBotInfo,
  type TtaiSessionDetails,
} from "@/lib/ttai";
import {
  recordWebhookEvent,
  WEBHOOK_OUTCOMES,
  type WebhookOutcome,
} from "@/lib/webhook-events";

/**
 * Backstop for a missed `post-session.done` webhook. That event is what closes
 * a call; this poll only runs from the cron, and only to free a slot when the
 * webhook never arrived.
 */
export const STUCK_DISPATCH_MIN_AGE_MS = 3 * 60 * 1000;

/** Bounds API calls and runtime for one reconcile pass. */
export const MAX_RECONCILE_PER_RUN = 10;

export interface ReconcileOptions {
  /** Minimum time since dispatch before an attempt is polled. */
  minAgeMs?: number;
  /** Maximum attempts polled in this pass. */
  limit?: number;
  /**
   * Whether to log polls that found nothing new. The cron logs these; a quiet
   * pass can turn them off.
   */
  logNoChange?: boolean;
}

export interface ReconcileResult {
  checked: number;
  resolved: number;
  stillRunning: number;
  errors: number;
}

/**
 * Failure verdict from `bot_info` only. Returns null for anything that is not an
 * explicit telephony failure, so a call still in progress is left alone.
 */
export function failureFromBotInfo(
  botInfo: TtaiBotInfo | null | undefined
): { callStatus: CallStatus; reason: string } | null {
  const status = botInfo?.status?.trim().toLowerCase();
  if (status !== "failed") return null;

  const rawReason = botInfo?.call_failure_reason?.trim() ?? "";
  const mapped = rawReason
    ? (mapTtaiStatusToCallStatus(rawReason) as CallStatus)
    : CallStatus.DISPATCH_FAILED;

  const message =
    botInfo?.error_message?.trim() ||
    (rawReason ? `Call failed (${rawReason})` : "Call failed at the carrier");

  return { callStatus: mapped, reason: message };
}

/**
 * Outcome once `post-session.done` says the call has ended. An explicit
 * telephony failure wins; anything else is a connected call that finished.
 */
export function outcomeFromSession(
  session: TtaiSessionDetails | undefined
): { callStatus: CallStatus; reason: string | null } | null {
  if (!session) return null;
  const failure = failureFromBotInfo(session.bot_info);
  if (failure) return failure;
  return { callStatus: CallStatus.COMPLETED, reason: null };
}

/**
 * Compact projection for the event log. The sessions API also returns the full
 * scenario definition (extraction prompts and all), which is large and static —
 * only the telephony-relevant fields are kept.
 */
function pollPayload(
  session: TtaiSessionDetails | undefined,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  return {
    bot_info: session?.bot_info ?? null,
    session_status: session?.status ?? null,
    created_at: session?.created_at ?? null,
    completed_at: session?.completed_at ?? null,
    duration: session?.duration ?? null,
    duration_minutes: session?.duration_minutes ?? null,
    has_transcript_url: Boolean(session?.transcript_url),
    ...extra,
  };
}

export async function reconcileStuckDispatchedCalls(
  store: Store,
  now: Date = new Date(),
  options: ReconcileOptions = {}
): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    checked: 0,
    resolved: 0,
    stillRunning: 0,
    errors: 0,
  };

  const minAgeMs = options.minAgeMs ?? STUCK_DISPATCH_MIN_AGE_MS;
  const logNoChange = options.logNoChange ?? true;

  const stuck = await db.callAttempt.findMany({
    where: {
      status: CallStatus.DISPATCHED,
      startedAt: { lt: new Date(now.getTime() - minAgeMs) },
      sessionId: { not: null },
      checkout: { storeDomain: store.storeDomain },
    },
    orderBy: { startedAt: "asc" },
    take: options.limit ?? MAX_RECONCILE_PER_RUN,
    include: { checkout: true },
  });

  for (const attempt of stuck) {
    const sessionId = attempt.sessionId;
    if (!sessionId) continue;

    result.checked++;
    const pollStartedAtMs = Date.now();

    const logPoll = (
      outcome: WebhookOutcome,
      payload: Record<string, unknown>,
      note?: string
    ) =>
      recordWebhookEvent({
        source: "ttai_session_poll",
        outcome,
        eventType: "sessions.get",
        sessionId,
        callId: attempt.callId,
        callAttemptId: attempt.id,
        checkoutId: attempt.abandonedCheckoutId,
        storeDomain: store.storeDomain,
        payload,
        note,
        startedAtMs: pollStartedAtMs,
      });

    // Same rationale as logNoChange: too chatty for the 10s dashboard poll.
    const verbose = logNoChange;

    if (verbose) {
      console.info(
        "[reconcile] polling session details",
        JSON.stringify({
          storeDomain: store.storeDomain,
          sessionId,
          callId: attempt.callId,
          attemptId: attempt.id,
          checkoutId: attempt.abandonedCheckoutId,
          dispatchedAt: attempt.startedAt.toISOString(),
          stuckForSec: Math.round(
            (now.getTime() - attempt.startedAt.getTime()) / 1000
          ),
        })
      );
    }

    const session = await fetchTtaiSessionDetails(sessionId);
    if (!session.success) {
      result.errors++;
      console.warn(
        "[reconcile] session fetch failed",
        JSON.stringify({
          storeDomain: store.storeDomain,
          sessionId,
          error: session.error,
        })
      );
      await logPoll(
        WEBHOOK_OUTCOMES.POLL_FETCH_FAILED,
        { error: session.error ?? null },
        session.error ?? "sessions API call failed"
      );
      continue;
    }

    const botInfo = session.session?.bot_info;
    if (verbose) {
      console.info(
        "[reconcile] session poll result",
        JSON.stringify({
          storeDomain: store.storeDomain,
          sessionId,
          pollMs: Date.now() - pollStartedAtMs,
          botStatus: botInfo?.status ?? null,
          carrierReason: botInfo?.call_failure_reason ?? null,
          carrierError: botInfo?.error_message ?? null,
          sessionStatus: session.session?.status ?? null,
          duration: session.session?.duration ?? null,
        })
      );
    }

    const failure = failureFromBotInfo(botInfo);
    if (!failure) {
      result.stillRunning++;
      if (logNoChange) {
        await logPoll(
          WEBHOOK_OUTCOMES.POLL_NO_CHANGE,
          pollPayload(session.session),
          "bot_info is not an explicit failure — left in DISPATCHED"
        );
      }
      continue;
    }

    const reason = sanitizeRecoveryError(failure.reason);
    const endedAt = session.session?.completed_at
      ? new Date(session.session.completed_at)
      : now;

    // Guarded so a webhook that lands mid-poll keeps its outcome.
    const claimed = await db.abandonedCheckout.updateMany({
      where: {
        id: attempt.abandonedCheckoutId,
        callStatus: CallStatus.DISPATCHED,
      },
      data: {
        callStatus: failure.callStatus,
        callScheduled: false,
        lastError: reason,
      },
    });
    if (claimed.count === 0) {
      result.stillRunning++;
      await logPoll(
        WEBHOOK_OUTCOMES.POLL_SUPERSEDED,
        pollPayload(session.session, { wouldHaveSet: failure.callStatus }),
        "a webhook resolved this attempt while the poll was in flight"
      );
      continue;
    }

    await db.callAttempt.update({
      where: { id: attempt.id },
      data: {
        status: failure.callStatus,
        failureStage: "telephony",
        failureReason: reason,
        endedAt: Number.isNaN(endedAt.getTime()) ? now : endedAt,
        durationSec: 0,
      },
    });

    await recordPipelineEvent(
      {
        checkoutId: attempt.abandonedCheckoutId,
        storeDomain: store.storeDomain,
        callAttemptId: attempt.id,
        trigger: attempt.trigger,
      },
      "reconciled",
      "succeeded",
      {
        detail: {
          sessionId,
          callStatus: failure.callStatus,
          failureReason: reason,
          botStatus: session.session?.bot_info?.status ?? null,
          carrierReason: session.session?.bot_info?.call_failure_reason ?? null,
        },
      }
    );

    // Same policy as a webhook-reported failure: one retry for busy/no-answer/voicemail.
    const retry = await maybeScheduleTelephonyRetry({
      checkout: attempt.checkout,
      store,
      status: failure.callStatus,
    });

    result.resolved++;
    await logPoll(
      WEBHOOK_OUTCOMES.POLL_RESOLVED,
      pollPayload(session.session, {
        appliedCallStatus: failure.callStatus,
        retryScheduledAt: retry.scheduledCallAt?.toISOString() ?? null,
      }),
      reason
    );
    console.info(
      "[reconcile] resolved stuck dispatch",
      JSON.stringify({
        storeDomain: store.storeDomain,
        sessionId,
        checkoutId: attempt.abandonedCheckoutId,
        callStatus: failure.callStatus,
        retryScheduledAt: retry.scheduledCallAt?.toISOString() ?? null,
      })
    );
  }

  return result;
}
