import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/** Bodies above this are stored truncated so a long transcript can't bloat the table. */
export const WEBHOOK_PAYLOAD_MAX_BYTES = 64 * 1024;

export type WebhookSource =
  | "ttai"
  | "shopify_checkout_update"
  /** Outbound: reconciler polling the sessions API for a stuck dispatch. */
  | "ttai_session_poll";

/**
 * Every terminating path of a webhook handler maps to one of these, so
 * "did it arrive and what did we do with it" is answerable from one column.
 */
export const WEBHOOK_OUTCOMES = {
  /** Signature verification failed — provider delivered, we refused. */
  REJECTED_SIGNATURE: "rejected_signature",
  /** Shared-secret header did not match. */
  REJECTED_UNAUTHORIZED: "rejected_unauthorized",
  INVALID_JSON: "invalid_json",
  /** No call_id or session_id to correlate on. */
  MISSING_IDENTITY: "missing_identity",
  /** Accepted, intentionally no state change (e.g. session.started). */
  ACKNOWLEDGED: "acknowledged",
  /** Arrived for a session with no matching attempt in this database. */
  IGNORED_NO_ATTEMPT: "ignored_no_attempt",
  /** Identity conflicted with the stored attempt. */
  REJECTED_MISMATCH: "rejected_mismatch",
  /** Payload could not be merged into the attempt's event store. */
  REJECTED_MERGE: "rejected_merge",
  /** Applied to a recovery call attempt. */
  UPDATED: "updated",
  /** Applied to an NDRC call attempt. */
  NDRC_UPDATED: "ndrc_updated",
  /** Handler threw. */
  ERROR: "error",

  /** Poll found an explicit telephony failure and closed the call out. */
  POLL_RESOLVED: "poll_resolved",
  /** Poll found the call still running or successful — left untouched. */
  POLL_NO_CHANGE: "poll_no_change",
  /** A webhook resolved the row while the poll was in flight. */
  POLL_SUPERSEDED: "poll_superseded",
  /** The sessions API call itself failed. */
  POLL_FETCH_FAILED: "poll_fetch_failed",
} as const;

export type WebhookOutcome =
  (typeof WEBHOOK_OUTCOMES)[keyof typeof WEBHOOK_OUTCOMES];

export interface WebhookEventInput {
  source: WebhookSource;
  outcome: WebhookOutcome;
  /** Omit for outbound polls, which have no response status of our own. */
  httpStatus?: number | null;
  eventType?: string;
  sessionId?: string | null;
  callId?: string | null;
  storeDomain?: string | null;
  callAttemptId?: string | null;
  checkoutId?: string | null;
  deliveryId?: string | null;
  /** Verbatim request body, used when the parsed payload is absent or oversized. */
  rawBody?: string;
  payload?: unknown;
  note?: string | null;
  receivedAt?: Date;
  /** `Date.now()` captured at the top of the handler. */
  startedAtMs?: number;
}

function payloadForStorage(
  input: WebhookEventInput,
  bytes: number
): Prisma.InputJsonValue {
  const raw = input.rawBody ?? "";

  if (bytes > WEBHOOK_PAYLOAD_MAX_BYTES) {
    return {
      truncated: true,
      bytes,
      raw: raw.slice(0, WEBHOOK_PAYLOAD_MAX_BYTES),
    };
  }

  if (input.payload !== undefined && input.payload !== null) {
    return input.payload as Prisma.InputJsonValue;
  }

  return { raw };
}

function trimmed(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

/**
 * Never throws and never blocks the handler's response contract: a failure to
 * write the audit row is logged and swallowed.
 */
export async function recordWebhookEvent(
  input: WebhookEventInput
): Promise<void> {
  try {
    const bytes = Buffer.byteLength(
      input.rawBody ?? (input.payload ? JSON.stringify(input.payload) : ""),
      "utf8"
    );

    await db.webhookEvent.create({
      data: {
        source: input.source,
        eventType: input.eventType?.trim() || "",
        outcome: input.outcome,
        httpStatus: input.httpStatus ?? null,
        sessionId: trimmed(input.sessionId),
        callId: trimmed(input.callId),
        storeDomain: trimmed(input.storeDomain),
        callAttemptId: trimmed(input.callAttemptId),
        checkoutId: trimmed(input.checkoutId),
        deliveryId: trimmed(input.deliveryId),
        payload: payloadForStorage(input, bytes),
        payloadBytes: bytes,
        note: input.note?.slice(0, 2000) ?? null,
        receivedAt: input.receivedAt ?? new Date(),
        processingMs: input.startedAtMs
          ? Date.now() - input.startedAtMs
          : null,
      },
    });
  } catch (error) {
    console.error(
      "[webhook-events] persist failed",
      JSON.stringify({
        source: input.source,
        outcome: input.outcome,
        sessionId: input.sessionId,
        error: error instanceof Error ? error.message : String(error),
      })
    );
  }
}
