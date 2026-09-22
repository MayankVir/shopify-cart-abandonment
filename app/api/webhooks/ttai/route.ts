import { NextRequest, NextResponse } from "next/server";
import { CallStatus, Prisma } from "@prisma/client";
import { Webhook } from "standardwebhooks";
import { db } from "@/lib/db";
import { maybeScheduleTelephonyRetry } from "@/lib/call-queue";
import {
  buildCallFeedbackContext,
  writeCallFeedbackIfEnabled,
} from "@/lib/call-feedback-sheet";
import { mapTtaiStatusToCallStatus, buildSessionSummary, fetchTtaiSessionDetails, durationSecFromTtaiSession } from "@/lib/ttai";
import {
  minutesFromDurationSec,
  recordCallUsage,
} from "@/lib/billing";
import {
  asRecord,
  attachSessionDetailsToStore,
  eventData,
  eventType,
  extractTranscriptFromTtaiPayload,
  extractSessionIdentity,
  mergeTtaiWebhookStore,
  pickString,
  shouldFetchTtaiSessionDetails,
  validateLinkedEvents,
  type TtaiWebhookEventName,
} from "@/lib/ttai-webhook";
import {
  recordWebhookEvent,
  WEBHOOK_OUTCOMES,
  type WebhookOutcome,
} from "@/lib/webhook-events";

function webhookHeaders(request: NextRequest): Record<string, string> {
  return {
    "webhook-id": request.headers.get("webhook-id") ?? "",
    "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
    "webhook-signature": request.headers.get("webhook-signature") ?? "",
  };
}

function pickNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function mapEventToStatus(event: string, data: Record<string, unknown>): string {
  const normalized = event.trim().toLowerCase();
  if (normalized === "session.started") return "started";
  if (normalized === "session.completed") return "completed";
  if (normalized === "session.analyzed") return "completed";
  if (normalized === "session.extracted") return "completed";
  if (normalized === "session.terminated") return "terminated";
  return pickString(data.status, data.event) ?? event;
}

function shouldUpdateTerminalStatus(event: string): boolean {
  const normalized = event.trim().toLowerCase();
  return (
    normalized === "session.completed" ||
    normalized === "session.analyzed" ||
    normalized === "session.extracted" ||
    normalized === "session.terminated"
  );
}

export async function POST(request: NextRequest) {
  const receivedAt = new Date();
  const startedAtMs = Date.now();
  const rawBody = await request.text();
  const deliveryId = request.headers.get("webhook-id");
  const secret = process.env.TTAI_WEBHOOK_SECRET?.trim();

  // Accumulates whatever has been resolved by the time a path terminates, so
  // even an early rejection is logged with as much identity as is known.
  const logContext: {
    eventType?: string;
    sessionId?: string | null;
    callId?: string | null;
    storeDomain?: string | null;
    callAttemptId?: string | null;
    checkoutId?: string | null;
    payload?: unknown;
  } = {};

  const logEvent = (
    outcome: WebhookOutcome,
    httpStatus: number,
    note?: string
  ) =>
    recordWebhookEvent({
      source: "ttai",
      outcome,
      httpStatus,
      rawBody,
      deliveryId,
      receivedAt,
      startedAtMs,
      note,
      ...logContext,
    });

  if (secret) {
    const headers = webhookHeaders(request);
    const hasStandardHeaders = Object.values(headers).some(Boolean);

    if (hasStandardHeaders) {
      try {
        const wh = new Webhook(secret);
        wh.verify(rawBody, headers);
      } catch (error) {
        await logEvent(
          WEBHOOK_OUTCOMES.REJECTED_SIGNATURE,
          401,
          error instanceof Error ? error.message : "signature verification failed"
        );
        return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
      }
    } else {
      const legacyHeader = request.headers.get("x-ttai-webhook-secret");
      if (legacyHeader !== secret) {
        await logEvent(
          WEBHOOK_OUTCOMES.REJECTED_UNAUTHORIZED,
          401,
          "x-ttai-webhook-secret did not match"
        );
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    await logEvent(WEBHOOK_OUTCOMES.INVALID_JSON, 400, "body is not valid JSON");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  logContext.payload = payload;

  const dataForExtraction = eventData(payload);
  const dataForStorage = asRecord(payload.data) ?? payload;
  const event = eventType(payload);
  const identity = extractSessionIdentity(dataForExtraction, payload);
  const callId = identity.callId;
  const sessionId = identity.sessionId;

  logContext.eventType = event;
  logContext.sessionId = sessionId;
  logContext.callId = callId;

  console.info(
    "[ttai-webhook]",
    JSON.stringify({
      event,
      sessionId,
      callId,
      dataKeys: Object.keys(dataForExtraction),
    })
  );

  if (!callId && !sessionId) {
    await logEvent(
      WEBHOOK_OUTCOMES.MISSING_IDENTITY,
      422,
      `payload keys: ${Object.keys(dataForExtraction).join(", ")}`
    );
    return NextResponse.json({ error: "Missing call_id or session_id" }, { status: 422 });
  }

  if (event.toLowerCase() === "session.started") {
    await logEvent(WEBHOOK_OUTCOMES.ACKNOWLEDGED, 200);
    return NextResponse.json({ ok: true, action: "acknowledged", event });
  }

  const attempt = await db.callAttempt.findFirst({
    where: {
      OR: [
        callId ? { callId } : undefined,
        sessionId ? { sessionId } : undefined,
      ].filter(Boolean) as Prisma.CallAttemptWhereInput[],
    },
    include: { checkout: { include: { store: true } } },
  });

  if (!attempt) {
    const ndrcAttempt = await db.ndrcCallAttempt.findFirst({
      where: {
        OR: [
          callId ? { callId } : undefined,
          sessionId ? { sessionId } : undefined,
        ].filter(Boolean) as Prisma.NdrcCallAttemptWhereInput[],
      },
      include: { order: { include: { store: true } } },
    });

    if (!ndrcAttempt) {
      console.warn(
        "[ttai-webhook] no matching attempt",
        JSON.stringify({ event, sessionId, callId })
      );
      await logEvent(
        WEBHOOK_OUTCOMES.IGNORED_NO_ATTEMPT,
        200,
        "no recovery or NDRC attempt matches this call_id/session_id"
      );
      return NextResponse.json({ ok: true, action: "ignored", reason: "attempt not found" });
    }

    logContext.callAttemptId = ndrcAttempt.id;
    logContext.storeDomain = ndrcAttempt.order.storeDomain;

    const rawStatus = mapEventToStatus(event, dataForExtraction);
    const mappedStatus = mapTtaiStatusToCallStatus(rawStatus);
    const updateStatus = shouldUpdateTerminalStatus(event);
    const isTerminal = updateStatus && mappedStatus !== "DISPATCH_FAILED";
    const endedAt = isTerminal ? new Date() : ndrcAttempt.endedAt;
    const durationSec =
      pickNumber(
        dataForExtraction.duration_sec,
        dataForExtraction.duration_seconds,
        payload.duration_sec
      ) ??
      (endedAt
        ? Math.round((endedAt.getTime() - ndrcAttempt.startedAt.getTime()) / 1000)
        : ndrcAttempt.durationSec);

    await db.$transaction([
      db.ndrcCallAttempt.update({
        where: { id: ndrcAttempt.id },
        data: {
          status: updateStatus ? mappedStatus : ndrcAttempt.status,
          sessionId: sessionId || ndrcAttempt.sessionId,
          endedAt,
          durationSec,
        },
      }),
      db.ndrcOrder.update({
        where: { id: ndrcAttempt.ndrcOrderId },
        data: {
          callStatus: updateStatus ? mappedStatus : ndrcAttempt.order.callStatus,
          sessionId: sessionId || ndrcAttempt.sessionId,
        },
      }),
    ]);

    if (isTerminal && ndrcAttempt.order.store.clerkUserId && durationSec) {
      await recordCallUsage({
        clerkUserId: ndrcAttempt.order.store.clerkUserId,
        minutes: minutesFromDurationSec(durationSec),
        callType: "ndrc",
        storeDomain: ndrcAttempt.order.storeDomain,
        sourceId: ndrcAttempt.id,
        occurredAt: endedAt ?? new Date(),
      });
    }

    await logEvent(WEBHOOK_OUTCOMES.NDRC_UPDATED, 200, `status=${mappedStatus}`);
    return NextResponse.json({
      ok: true,
      action: "ndrc_updated",
      status: mappedStatus,
    });
  }

  logContext.callAttemptId = attempt.id;
  logContext.checkoutId = attempt.abandonedCheckoutId;
  logContext.storeDomain = attempt.checkout.storeDomain;

  if (
    sessionId &&
    attempt.sessionId &&
    attempt.sessionId !== sessionId
  ) {
    console.warn(
      "[ttai-webhook] session_id mismatch for attempt",
      JSON.stringify({
        event,
        attemptSessionId: attempt.sessionId,
        incomingSessionId: sessionId,
        attemptCallId: attempt.callId,
        incomingCallId: callId,
      })
    );
    await logEvent(
      WEBHOOK_OUTCOMES.REJECTED_MISMATCH,
      409,
      `session_id mismatch: stored=${attempt.sessionId} incoming=${sessionId}`
    );
    return NextResponse.json(
      {
        ok: false,
        action: "rejected",
        reason: "session_id does not match stored call attempt",
      },
      { status: 409 }
    );
  }

  if (callId && attempt.callId && attempt.callId !== callId) {
    console.warn(
      "[ttai-webhook] call_id mismatch for attempt",
      JSON.stringify({
        event,
        attemptCallId: attempt.callId,
        incomingCallId: callId,
        attemptSessionId: attempt.sessionId,
        incomingSessionId: sessionId,
      })
    );
    await logEvent(
      WEBHOOK_OUTCOMES.REJECTED_MISMATCH,
      409,
      `call_id mismatch: stored=${attempt.callId} incoming=${callId}`
    );
    return NextResponse.json(
      {
        ok: false,
        action: "rejected",
        reason: "call_id does not match stored call attempt",
      },
      { status: 409 }
    );
  }

  let webhookStore;
  try {
    ({ store: webhookStore } = mergeTtaiWebhookStore(
      attempt.toolCallsJson,
      event,
      dataForStorage,
      identity
    ));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[ttai-webhook] merge rejected", message);
    await logEvent(WEBHOOK_OUTCOMES.REJECTED_MERGE, 409, message);
    return NextResponse.json(
      { ok: false, action: "rejected", reason: message },
      { status: 409 }
    );
  }

  const linkCheck = validateLinkedEvents(webhookStore);

  const resolvedSessionId =
    sessionId || attempt.sessionId || webhookStore.sessionId || linkCheck.sessionId;

  let finalWebhookStore = webhookStore;
  if (resolvedSessionId && shouldFetchTtaiSessionDetails(webhookStore)) {
    const sessionResult = await fetchTtaiSessionDetails(resolvedSessionId);
    finalWebhookStore = attachSessionDetailsToStore(webhookStore, sessionResult);
    if (sessionResult.success) {
      console.info(
        "[ttai-webhook] session details fetched",
        JSON.stringify({
          sessionId: resolvedSessionId,
          status: sessionResult.session?.status,
          hasTranscriptUrl: Boolean(sessionResult.session?.transcript_url),
        })
      );
    } else {
      console.warn(
        "[ttai-webhook] session details fetch failed",
        JSON.stringify({ sessionId: resolvedSessionId, error: sessionResult.error })
      );
    }
  }

  const sessionSummary = finalWebhookStore.sessionDetails
    ? buildSessionSummary(finalWebhookStore.sessionDetails)
    : undefined;

  const analysisReady = Boolean(finalWebhookStore.sessionDetails);

  const transcript =
    sessionSummary ||
    (analysisReady
      ? extractTranscriptFromTtaiPayload(payload, dataForExtraction)
      : undefined) ||
    attempt.transcript ||
    undefined;

  const rawStatus = mapEventToStatus(event, dataForExtraction);
  const mappedStatus = mapTtaiStatusToCallStatus(rawStatus);
  const updateStatus = shouldUpdateTerminalStatus(event);
  const nextAttemptStatus = updateStatus ? mappedStatus : attempt.status;
  const nextCheckoutStatus = updateStatus ? mappedStatus : attempt.checkout.callStatus;
  const isTerminal = updateStatus && mappedStatus !== "DISPATCH_FAILED";
  const endedAt = isTerminal ? new Date() : attempt.endedAt;
  const durationSec =
    pickNumber(
      dataForExtraction.duration_sec,
      dataForExtraction.duration_seconds,
      payload.duration_sec,
      durationSecFromTtaiSession(finalWebhookStore.sessionDetails)
    ) ??
    (endedAt
      ? Math.round((endedAt.getTime() - attempt.startedAt.getTime()) / 1000)
      : attempt.durationSec);

  await db.$transaction([
    db.callAttempt.update({
      where: { id: attempt.id },
      data: {
        status: nextAttemptStatus,
        transcript,
        toolCallsJson: finalWebhookStore as unknown as Prisma.InputJsonValue,
        endedAt,
        durationSec,
        failureReason:
          pickString(
            dataForExtraction.error,
            dataForExtraction.error_message,
            payload.error
          ) || attempt.failureReason,
      },
    }),
    db.abandonedCheckout.update({
      where: { id: attempt.abandonedCheckoutId },
      data: {
        callStatus: nextCheckoutStatus,
        aiSummary: analysisReady
          ? transcript || attempt.checkout.aiSummary
          : attempt.checkout.aiSummary,
        sessionId: sessionId || attempt.sessionId,
        lastError:
          pickString(
            dataForExtraction.error,
            dataForExtraction.error_message,
            payload.error
          ) || null,
      },
    }),
  ]);

  if (isTerminal && attempt.trigger !== "test") {
    await maybeScheduleTelephonyRetry({
      checkout: attempt.checkout,
      store: attempt.checkout.store,
      status: mappedStatus as CallStatus,
    });
  }

  if (
    isTerminal &&
    attempt.checkout.store.clerkUserId &&
    durationSec &&
    attempt.trigger !== "test"
  ) {
    await recordCallUsage({
      clerkUserId: attempt.checkout.store.clerkUserId,
      minutes: minutesFromDurationSec(durationSec),
      callType: "recovery",
      storeDomain: attempt.checkout.storeDomain,
      sourceId: attempt.id,
      occurredAt: endedAt ?? new Date(),
    });
  }

  if (isTerminal) {
    const feedbackContext = buildCallFeedbackContext(attempt.checkout);
    const feedbackResult = await writeCallFeedbackIfEnabled(attempt.checkout.store, {
      ...feedbackContext,
      callStatus: nextCheckoutStatus,
      feedbackText: transcript ?? attempt.checkout.aiSummary,
    });
    if (!feedbackResult.ok && !feedbackResult.skipped) {
      console.warn(
        "[ttai-webhook] sheet feedback write failed",
        JSON.stringify({
          error: feedbackResult.error,
          checkoutToken: attempt.checkout.checkoutToken,
        })
      );
    }
  }

  await logEvent(
    WEBHOOK_OUTCOMES.UPDATED,
    200,
    `status=${nextCheckoutStatus} terminal=${isTerminal} durationSec=${durationSec ?? "null"}`
  );

  return NextResponse.json({
    ok: true,
    event,
    status: nextCheckoutStatus,
    storedEvents: Object.keys(finalWebhookStore.events),
    sessionDetailsFetched: Boolean(finalWebhookStore.sessionDetails),
    linkedSessionId: linkCheck.sessionId,
    linkedCallId: linkCheck.callId,
    eventsLinked: linkCheck.ok,
  });
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/webhooks/ttai",
    method: "POST",
    description: "Tough Tongue AI session webhooks (Standard Webhooks)",
    events: [
      "session.completed",
      "session.analyzed",
      "session.extracted",
      "session.terminated",
    ] satisfies TtaiWebhookEventName[],
  });
}
