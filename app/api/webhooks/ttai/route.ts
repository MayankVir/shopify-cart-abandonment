import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { Webhook } from "standardwebhooks";
import { db } from "@/lib/db";
import { mapTtaiStatusToCallStatus, buildSessionSummary, fetchTtaiSessionDetails } from "@/lib/ttai";
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
  const rawBody = await request.text();
  const secret = process.env.TTAI_WEBHOOK_SECRET?.trim();

  if (secret) {
    const headers = webhookHeaders(request);
    const hasStandardHeaders = Object.values(headers).some(Boolean);

    if (hasStandardHeaders) {
      try {
        const wh = new Webhook(secret);
        wh.verify(rawBody, headers);
      } catch {
        return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
      }
    } else {
      const legacyHeader = request.headers.get("x-ttai-webhook-secret");
      if (legacyHeader !== secret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const dataForExtraction = eventData(payload);
  const dataForStorage = asRecord(payload.data) ?? payload;
  const event = eventType(payload);
  const identity = extractSessionIdentity(dataForExtraction, payload);
  const callId = identity.callId;
  const sessionId = identity.sessionId;

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
    return NextResponse.json({ error: "Missing call_id or session_id" }, { status: 422 });
  }

  if (event.toLowerCase() === "session.started") {
    return NextResponse.json({ ok: true, action: "acknowledged", event });
  }

  const attempt = await db.callAttempt.findFirst({
    where: {
      OR: [
        callId ? { callId } : undefined,
        sessionId ? { sessionId } : undefined,
      ].filter(Boolean) as Prisma.CallAttemptWhereInput[],
    },
    include: { checkout: true },
  });

  if (!attempt) {
    console.warn(
      "[ttai-webhook] no matching attempt",
      JSON.stringify({ event, sessionId, callId })
    );
    return NextResponse.json({ ok: true, action: "ignored", reason: "attempt not found" });
  }

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
      finalWebhookStore.sessionDetails?.duration
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
