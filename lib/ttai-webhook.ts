import type {
  FetchTtaiSessionDetailsResult,
  TtaiSessionDetails,
} from "./ttai";

export const TTAI_WEBHOOK_STORE_VERSION = 1 as const;

export type TtaiWebhookEventName =
  | "session.started"
  | "session.completed"
  | "session.analyzed"
  | "session.extracted"
  | "session.terminated";

export interface TtaiWebhookStore {
  version: typeof TTAI_WEBHOOK_STORE_VERSION;
  /** Canonical session id linking analyzed + extracted events to one call. */
  sessionId?: string;
  callId?: string;
  events: Partial<Record<TtaiWebhookEventName, unknown>>;
  receivedAt: Partial<Record<TtaiWebhookEventName, string>>;
  lastEvent?: TtaiWebhookEventName;
  /** Populated via GET /sessions/{id} after terminal webhooks. */
  sessionDetails?: TtaiSessionDetails;
  sessionDetailsFetchedAt?: string;
  sessionDetailsError?: string;
}

export interface TtaiSessionIdentity {
  sessionId?: string;
  callId?: string;
}

export function extractSessionIdentity(
  data: Record<string, unknown>,
  payload: Record<string, unknown> = {}
): TtaiSessionIdentity {
  return {
    sessionId: pickString(
      data.session_id,
      data.id,
      data._id,
      payload.session_id
    ),
    callId: pickString(data.call_id, payload.call_id),
  };
}

export function extractIdentityFromStoredEvent(
  eventPayload: unknown
): TtaiSessionIdentity {
  const record = asRecord(eventPayload);
  if (!record) return {};
  return extractSessionIdentity(eventData({ data: record }), record);
}

export function validateLinkedEvents(store: TtaiWebhookStore): {
  ok: boolean;
  sessionId?: string;
  callId?: string;
  sessionIds: string[];
  callIds: string[];
} {
  const sessionIds = new Set<string>();
  const callIds = new Set<string>();

  if (store.sessionId) sessionIds.add(store.sessionId);
  if (store.callId) callIds.add(store.callId);

  for (const payload of Object.values(store.events)) {
    const identity = extractIdentityFromStoredEvent(payload);
    if (identity.sessionId) sessionIds.add(identity.sessionId);
    if (identity.callId) callIds.add(identity.callId);
  }

  const sessionIdList = [...sessionIds];
  const callIdList = [...callIds];

  return {
    ok: sessionIdList.length <= 1 && callIdList.length <= 1,
    sessionId: sessionIdList[0],
    callId: callIdList[0],
    sessionIds: sessionIdList,
    callIds: callIdList,
  };
}

export function isTtaiWebhookStore(value: unknown): value is TtaiWebhookStore {
  return (
    !!value &&
    typeof value === "object" &&
    (value as TtaiWebhookStore).version === TTAI_WEBHOOK_STORE_VERSION &&
    typeof (value as TtaiWebhookStore).events === "object"
  );
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function eventType(payload: Record<string, unknown>): string {
  return pickString(payload.type, payload.event, payload.status) ?? "";
}

export function eventData(payload: Record<string, unknown>): Record<string, unknown> {
  const root = asRecord(payload.data) ?? payload;
  const session = asRecord(root.session);
  if (session) {
    return { ...root, ...session };
  }
  return root;
}

export function mergeTtaiWebhookStore(
  existing: unknown,
  event: string,
  data: Record<string, unknown>,
  identity: TtaiSessionIdentity
): { store: TtaiWebhookStore; linked: boolean } {
  const normalizedEvent = event.trim().toLowerCase() as TtaiWebhookEventName;
  const base = isTtaiWebhookStore(existing)
    ? existing
    : { version: TTAI_WEBHOOK_STORE_VERSION, events: {}, receivedAt: {} };

  const nextSessionId = base.sessionId ?? identity.sessionId;
  const nextCallId = base.callId ?? identity.callId;

  if (
    base.sessionId &&
    identity.sessionId &&
    base.sessionId !== identity.sessionId
  ) {
    throw new Error(
      `TTAI session mismatch: stored ${base.sessionId}, incoming ${identity.sessionId}`
    );
  }

  if (base.callId && identity.callId && base.callId !== identity.callId) {
    throw new Error(
      `TTAI call mismatch: stored ${base.callId}, incoming ${identity.callId}`
    );
  }

  const store: TtaiWebhookStore = {
    version: TTAI_WEBHOOK_STORE_VERSION,
    sessionId: nextSessionId,
    callId: nextCallId,
    events: {
      ...base.events,
      [normalizedEvent]: data,
    },
    receivedAt: {
      ...base.receivedAt,
      [normalizedEvent]: new Date().toISOString(),
    },
    lastEvent: normalizedEvent,
    sessionDetails: base.sessionDetails,
    sessionDetailsFetchedAt: base.sessionDetailsFetchedAt,
    sessionDetailsError: base.sessionDetailsError,
  };

  const validation = validateLinkedEvents(store);

  return {
    store,
    linked: validation.ok,
  };
}

function transcriptFromRecord(record: Record<string, unknown> | null): string | undefined {
  if (!record) return undefined;

  const direct = pickString(
    record.finalized_transcript,
    record.running_transcript,
    record.transcript,
    record.summary,
    record.evaluation_note,
    record.editor_content
  );
  if (direct) return direct;

  const evaluation = asRecord(record.evaluation_results);
  const improvement = asRecord(record.improvement_results);
  const reportCard = asRecord(record.report_card);

  const fromEvaluation = pickString(
    evaluation?.detailed_feedback,
    evaluation?.summary,
    evaluation?.note,
    evaluation?.evaluation_note
  );
  if (fromEvaluation) return fromEvaluation;

  const fromImprovement = pickString(improvement?.summary, improvement?.note);
  if (fromImprovement) return fromImprovement;

  const fromReport = pickString(reportCard?.summary, reportCard?.note);
  if (fromReport) return fromReport;

  return undefined;
}

export function extractTranscriptFromTtaiPayload(
  payload: Record<string, unknown>,
  data: Record<string, unknown>
): string | undefined {
  const fromData = transcriptFromRecord(data);
  if (fromData) return fromData;

  const fromPayload = transcriptFromRecord(payload);
  if (fromPayload) return fromPayload;

  const analyzed = asRecord(
    isTtaiWebhookStore(payload)
      ? payload.events["session.analyzed"]
      : data
  );
  const fromAnalyzed = transcriptFromRecord(analyzed);
  if (fromAnalyzed) return fromAnalyzed;

  return undefined;
}

export function hasAnalyzedAndExtractedEvents(store: TtaiWebhookStore): boolean {
  return (
    Boolean(store.events["session.analyzed"]) &&
    Boolean(store.events["session.extracted"])
  );
}

/** Fetch session API only after both webhooks arrived and events link to one call. */
export function shouldFetchTtaiSessionDetails(store: TtaiWebhookStore): boolean {
  if (!hasAnalyzedAndExtractedEvents(store)) {
    return false;
  }

  if (store.sessionDetails && !store.sessionDetailsError) {
    return false;
  }

  return validateLinkedEvents(store).ok;
}

export function getTtaiAnalysisWaitMessage(store: TtaiWebhookStore | null): string {
  if (!store) {
    return "Waiting for TTAI to generate analysis.";
  }

  const hasAnalyzed = Boolean(store.events["session.analyzed"]);
  const hasExtracted = Boolean(store.events["session.extracted"]);
  const linkCheck = validateLinkedEvents(store);

  if (!hasAnalyzed && !hasExtracted) {
    return "Waiting for TTAI to generate analysis (session.analyzed and session.extracted).";
  }
  if (!hasAnalyzed) {
    return "Waiting for TTAI to generate analysis (session.analyzed pending).";
  }
  if (!hasExtracted) {
    return "Waiting for TTAI to generate analysis (session.extracted pending).";
  }
  if (!linkCheck.ok) {
    return "Waiting for TTAI events to link to the same call before loading analysis.";
  }
  if (store.sessionDetailsError) {
    return store.sessionDetailsError;
  }
  if (!store.sessionDetails) {
    return "Loading session analysis from TTAI…";
  }

  return "";
}

export function ensureTtaiWebhookStore(
  existing: unknown,
  identity: TtaiSessionIdentity
): TtaiWebhookStore {
  if (isTtaiWebhookStore(existing)) {
    return {
      ...existing,
      sessionId: existing.sessionId ?? identity.sessionId,
      callId: existing.callId ?? identity.callId,
    };
  }

  return {
    version: TTAI_WEBHOOK_STORE_VERSION,
    sessionId: identity.sessionId,
    callId: identity.callId,
    events: {},
    receivedAt: {},
  };
}

export function getTtaiEventPayload(
  store: unknown,
  event: TtaiWebhookEventName
): unknown {
  if (!isTtaiWebhookStore(store)) return undefined;
  return store.events[event];
}

export function attachSessionDetailsToStore(
  store: TtaiWebhookStore,
  result: FetchTtaiSessionDetailsResult
): TtaiWebhookStore {
  if (result.success && result.session) {
    return {
      ...store,
      sessionDetails: result.session,
      sessionDetailsFetchedAt: new Date().toISOString(),
      sessionDetailsError: undefined,
    };
  }

  return {
    ...store,
    sessionDetailsError: result.error ?? "Failed to fetch session details",
    sessionDetailsFetchedAt: new Date().toISOString(),
  };
}

export function formatTtaiPayload(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
