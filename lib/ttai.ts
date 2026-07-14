import { normalizePhoneNumber } from "./phone";

const DEFAULT_TT_BASE_URL = "https://api.toughtongueai.com/api/public";

export interface SipDynamicVars {
  order_id: string;
  phone_number: string;
  customer_phone?: string;
  abandoned_ts?: string;
  cart_value?: string;
  order_context?: string;
  user_context?: string;
  related_items?: string;
  cart_id?: string;
  checkout_url?: string;
  draft_order_id?: string;
  draft_order_name?: string;
  draft_order_context?: string;
  /** Pass to draftOrderComplete so the order stays unpaid (COD). */
  payment_pending?: string;
}

export interface DispatchSipCallParams {
  phone: string;
  scenarioId: string;
  sipTrunkId: string;
  dynamicVars: SipDynamicVars;
}

export interface DispatchSipCallResult {
  success: boolean;
  callId?: string;
  sessionId?: string;
  error?: string;
}

export interface CancelSipCallResult {
  success: boolean;
  deleted?: boolean;
  error?: string;
}

export interface TtaiSessionReportCardItem {
  topic: string;
  score: number;
  score_str?: string;
  note?: string;
  weight?: number;
}

export interface TtaiEvaluationResults {
  overall_score?: string;
  strengths?: string;
  weaknesses?: string;
  detailed_feedback?: string;
  report_card?: TtaiSessionReportCardItem[];
  final_score?: number;
}

export interface TtaiImprovementResults {
  improvement_areas?: string;
  action_items?: string;
  resources?: string;
}

export interface TtaiSessionDetails {
  id: string;
  scenario_id?: string;
  scenario_name?: string;
  created_at?: string;
  completed_at?: string;
  status?: string;
  user_name?: string;
  user_email?: string;
  /** Session length in seconds (TTAI sessions API). */
  duration?: number;
  /** Alternate field from enriched session list / session details. */
  duration_seconds?: number;
  /** Session length in minutes (TTAI sessions API — primary billing field). */
  duration_minutes?: number;
  transcript_url?: string;
  evaluation_results?: TtaiEvaluationResults | null;
  improvement_results?: TtaiImprovementResults | null;
  user_metadata?: Record<string, unknown>;
}

export interface FetchTtaiSessionDetailsResult {
  success: boolean;
  session?: TtaiSessionDetails;
  error?: string;
}

export interface TtaiScenarioAnalytics {
  scenario_id: string;
  scenario_name: string;
  total_sessions: number;
  avg_duration_minutes: number;
  avg_score?: number;
}

export interface TtaiOrgDashboardSummary {
  total_sessions: number;
  total_minutes: number;
  active_members: number;
}

export interface TtaiUsageByMember {
  user_email: string;
  user_name: string;
  session_count: number;
  total_minutes: number;
}

export interface TtaiAnalyticsTimeSeriesPoint {
  date: string;
  sessions: number;
  minutes: number;
}

export interface TtaiOrgDashboard {
  summary: TtaiOrgDashboardSummary;
  usage_by_member: TtaiUsageByMember[];
  time_series: TtaiAnalyticsTimeSeriesPoint[];
}

export interface TtaiMemberUsage {
  session_count: number;
  total_minutes: number;
}

export interface TtaiUnifiedAnalytics {
  scenarios: TtaiScenarioAnalytics[];
  org_dashboard?: TtaiOrgDashboard;
  member_usage?: TtaiMemberUsage;
}

export interface FetchTtaiUnifiedAnalyticsResult {
  success: boolean;
  data?: TtaiUnifiedAnalytics;
  error?: string;
}

export interface FetchTtaiUnifiedAnalyticsParams {
  isOrg?: boolean;
  startDate?: string;
  endDate?: string;
}

function getTTApiBaseUrl(): string {
  return String(process.env.TT_BASE_URL || DEFAULT_TT_BASE_URL)
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/v\d+$/, "");
}

function getTTApiConfig() {
  const apiKey = String(process.env.TT_API_KEY || "").trim();
  const orgId = String(process.env.TT_ORG_ID || "").trim();
  const baseUrl = getTTApiBaseUrl();

  if (!apiKey) {
    throw new Error("TT_API_KEY not set");
  }

  return {
    baseUrl,
    endpoint: `${baseUrl}/v2/sip/call`,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(orgId ? { "X-TT-ORG": orgId } : {}),
    },
  };
}

export function isTTaiConfigured(): boolean {
  return Boolean(process.env.TT_API_KEY?.trim());
}

export async function dispatchSipCall(
  params: DispatchSipCallParams
): Promise<DispatchSipCallResult> {
  const phone = normalizePhoneNumber(params.phone);
  if (!phone) {
    return { success: false, error: "Invalid phone number (E.164 required)" };
  }
  if (!params.scenarioId) {
    return { success: false, error: "SIP scenario ID not configured" };
  }
  if (!params.sipTrunkId) {
    return { success: false, error: "SIP trunk ID not configured" };
  }

  if (!isTTaiConfigured()) {
    console.info("[TTAI stub] SIP call", {
      phone,
      scenario: params.scenarioId,
      trunk: params.sipTrunkId,
      vars: Object.keys(params.dynamicVars),
    });
    return {
      success: true,
      callId: `stub-${Date.now()}`,
      sessionId: `stub-session-${Date.now()}`,
    };
  }

  const cfg = getTTApiConfig();
  const payload = {
    scenario_id: params.scenarioId,
    phone_number: phone,
    sip_trunk_id: params.sipTrunkId,
    dynamic_vars: params.dynamicVars,
  };

  const response = await fetch(cfg.endpoint, {
    method: "POST",
    headers: cfg.headers,
    body: JSON.stringify(payload),
  });

  const body = await response.text();
  let parsed: {
    success?: boolean;
    call_id?: string;
    session_id?: string;
    detail?: string;
    message?: string;
  };

  try {
    parsed = JSON.parse(body);
  } catch {
    return {
      success: false,
      error: `TTAI: invalid JSON (HTTP ${response.status})`,
    };
  }

  if (response.status < 200 || response.status >= 300 || parsed.success === false) {
    return {
      success: false,
      error: parsed.detail || parsed.message || `TTAI HTTP ${response.status}`,
    };
  }

  return {
    success: true,
    callId: parsed.call_id,
    sessionId: parsed.session_id,
  };
}

/** Cancel a pending/scheduled SIP call (TTAI v2). Active calls may already be in progress. */
export async function cancelSipCall(callId: string): Promise<CancelSipCallResult> {
  if (!callId) {
    return { success: false, error: "Missing call ID" };
  }

  if (!isTTaiConfigured()) {
    console.info("[TTAI stub] cancel SIP call", { callId });
    return { success: true, deleted: true };
  }

  const cfg = getTTApiConfig();
  const baseUrl = cfg.endpoint.replace(/\/v2\/sip\/call$/, "");
  const response = await fetch(`${baseUrl}/v2/sip/calls/${encodeURIComponent(callId)}`, {
    method: "DELETE",
    headers: cfg.headers,
  });

  const body = await response.text();
  let parsed: { deleted?: boolean; detail?: string; message?: string };
  try {
    parsed = JSON.parse(body) as typeof parsed;
  } catch {
    parsed = {};
  }

  if (response.status === 404) {
    return { success: true, deleted: false };
  }

  if (response.status < 200 || response.status >= 300) {
    return {
      success: false,
      error: parsed.detail || parsed.message || `TTAI cancel HTTP ${response.status}`,
    };
  }

  return { success: true, deleted: parsed.deleted ?? true };
}

/** GET /sessions/{session_id} — see https://app.toughtongueai.com/docs/api-reference/sessions/ */
export async function fetchTtaiSessionDetails(
  sessionId: string
): Promise<FetchTtaiSessionDetailsResult> {
  if (!sessionId.trim()) {
    return { success: false, error: "Missing session ID" };
  }

  if (!isTTaiConfigured()) {
    return { success: false, error: "TT_API_KEY not configured" };
  }

  const cfg = getTTApiConfig();
  const response = await fetch(
    `${cfg.baseUrl}/sessions/${encodeURIComponent(sessionId.trim())}`,
    {
      method: "GET",
      headers: cfg.headers,
    }
  );

  const body = await response.text();
  let parsed: TtaiSessionDetails & { detail?: string; message?: string };

  try {
    parsed = JSON.parse(body) as typeof parsed;
  } catch {
    return {
      success: false,
      error: `TTAI session details: invalid JSON (HTTP ${response.status})`,
    };
  }

  if (response.status < 200 || response.status >= 300) {
    return {
      success: false,
      error:
        parsed.detail ||
        parsed.message ||
        `TTAI session details HTTP ${response.status}`,
    };
  }

  if (!parsed.id) {
    parsed.id = sessionId.trim();
  }

  return { success: true, session: parsed };
}

/**
 * Resolve billable session length in seconds from TTAI session details.
 * Prefers duration_seconds, then duration, then duration_minutes.
 */
export function durationSecFromTtaiSession(
  session: TtaiSessionDetails | null | undefined
): number | undefined {
  if (!session) return undefined;

  if (session.duration_seconds != null && session.duration_seconds > 0) {
    return Math.round(session.duration_seconds);
  }
  if (session.duration != null && session.duration > 0) {
    return Math.round(session.duration);
  }
  if (session.duration_minutes != null && session.duration_minutes > 0) {
    return Math.round(session.duration_minutes * 60);
  }

  return undefined;
}

/** GET /v2/analytics — unified org/scenario analytics. */
export async function fetchTtaiUnifiedAnalytics(
  params: FetchTtaiUnifiedAnalyticsParams = {}
): Promise<FetchTtaiUnifiedAnalyticsResult> {
  if (!isTTaiConfigured()) {
    return { success: false, error: "TT_API_KEY not configured" };
  }

  const cfg = getTTApiConfig();
  const search = new URLSearchParams();
  if (params.isOrg) search.set("is_org", "true");
  if (params.startDate) search.set("start_date", params.startDate);
  if (params.endDate) search.set("end_date", params.endDate);

  const query = search.toString();
  const url = `${cfg.baseUrl}/v2/analytics${query ? `?${query}` : ""}`;

  const response = await fetch(url, {
    method: "GET",
    headers: cfg.headers,
    cache: "no-store",
  });

  const body = await response.text();
  let parsed: TtaiUnifiedAnalytics & { detail?: string; message?: string };

  try {
    parsed = JSON.parse(body) as typeof parsed;
  } catch {
    return {
      success: false,
      error: `TTAI analytics: invalid JSON (HTTP ${response.status})`,
    };
  }

  if (response.status < 200 || response.status >= 300) {
    return {
      success: false,
      error:
        parsed.detail ||
        parsed.message ||
        `TTAI analytics HTTP ${response.status}`,
    };
  }

  return { success: true, data: parsed };
}

export function scenarioTotalMinutes(scenario: TtaiScenarioAnalytics): number {
  return (
    Math.round(scenario.total_sessions * scenario.avg_duration_minutes * 10) /
    10
  );
}

export function buildSessionSummary(session: TtaiSessionDetails): string | undefined {
  const evaluation = session.evaluation_results;
  if (evaluation?.detailed_feedback?.trim()) {
    return evaluation.detailed_feedback.trim();
  }

  const parts: string[] = [];
  if (evaluation?.overall_score) {
    parts.push(`Overall score: ${evaluation.overall_score}`);
  }
  if (evaluation?.strengths) {
    parts.push(`Strengths: ${evaluation.strengths}`);
  }
  if (evaluation?.weaknesses) {
    parts.push(`Weaknesses: ${evaluation.weaknesses}`);
  }

  const improvement = session.improvement_results;
  if (improvement?.action_items) {
    parts.push(`Action items:\n${improvement.action_items}`);
  }

  if (parts.length > 0) {
    return parts.join("\n\n");
  }

  if (session.transcript_url) {
    return `Transcript available: ${session.transcript_url}`;
  }

  return undefined;
}

export function buildSipDynamicVars(input: {
  orderId: string;
  phone: string;
  abandonedTs?: string;
  cartValue?: number;
  orderContext?: string;
  userContext?: string;
  relatedItems?: unknown[];
  cartId?: string;
  checkoutUrl?: string;
  draftOrderId?: string;
  draftOrderName?: string;
  draftOrderContext?: string;
}): SipDynamicVars {
  const vars: SipDynamicVars = {
    order_id: input.orderId,
    phone_number: input.phone,
    customer_phone: input.phone,
  };
  if (input.abandonedTs) vars.abandoned_ts = input.abandonedTs;
  if (input.cartValue != null) vars.cart_value = String(input.cartValue);
  if (input.orderContext) vars.order_context = input.orderContext;
  if (input.userContext) vars.user_context = input.userContext;
  if (input.relatedItems?.length) {
    vars.related_items = JSON.stringify(input.relatedItems);
  }
  if (input.cartId) vars.cart_id = input.cartId;
  if (input.checkoutUrl) vars.checkout_url = input.checkoutUrl;
  if (input.draftOrderId) {
    vars.draft_order_id = input.draftOrderId;
    vars.payment_pending = "true";
  }
  if (input.draftOrderName) vars.draft_order_name = input.draftOrderName;
  if (input.draftOrderContext) vars.draft_order_context = input.draftOrderContext;
  return vars;
}

/** Map TTAI webhook status strings to CallStatus enum values */
export function mapTtaiStatusToCallStatus(
  status: string
): "COMPLETED" | "NO_ANSWER" | "BUSY" | "INVALID_NUMBER" | "HANG_UP" | "VOICEMAIL" | "DISPATCH_FAILED" {
  const normalized = status.trim().toLowerCase().replace(/\./g, "_");
  if (["completed", "success", "answered", "session_completed", "session_analyzed", "session_extracted"].includes(normalized)) {
    return "COMPLETED";
  }
  if (["no_answer", "no-answer", "noanswer"].includes(normalized)) return "NO_ANSWER";
  if (["busy"].includes(normalized)) return "BUSY";
  if (["invalid", "invalid_number", "invalid-number"].includes(normalized)) {
    return "INVALID_NUMBER";
  }
  if (["hang_up", "hangup", "hang-up", "disconnected", "terminated", "session_terminated"].includes(normalized)) {
    return "HANG_UP";
  }
  if (["voicemail", "vm"].includes(normalized)) return "VOICEMAIL";
  return "DISPATCH_FAILED";
}
