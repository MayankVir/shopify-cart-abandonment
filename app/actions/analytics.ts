"use server";

import { auth } from "@clerk/nextjs/server";
import { CallStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { durationSecFromAttempt, analyticsDateRangeToIso, type AnalyticsDateRange } from "@/lib/analytics";
import {
  durationSecFromTtaiSession,
  fetchTtaiSessionDetails,
  fetchTtaiUnifiedAnalytics,
  isTTaiConfigured,
  scenarioTotalMinutes,
  type TtaiAnalyticsTimeSeriesPoint,
  type TtaiScenarioAnalytics,
} from "@/lib/ttai";
import {
  attachSessionDetailsToStore,
  ensureTtaiWebhookStore,
} from "@/lib/ttai-webhook";

export interface CallAttemptRow {
  id: string;
  checkoutId: string;
  checkoutToken: string;
  customerPhone: string;
  cartValue: number;
  status: CallStatus;
  trigger: string;
  sessionId: string | null;
  durationSec: number;
  startedAt: string;
  endedAt: string | null;
}

export interface CallAnalyticsSummary {
  totalCalls: number;
  completedCalls: number;
  failedCalls: number;
  totalDurationSec: number;
  totalMinutes: number;
  callsWithDuration: number;
}

const FAILED_STATUSES: CallStatus[] = [
  CallStatus.NO_ANSWER,
  CallStatus.BUSY,
  CallStatus.INVALID_NUMBER,
  CallStatus.HANG_UP,
  CallStatus.VOICEMAIL,
  CallStatus.CART_CREATE_FAILED,
  CallStatus.DRAFT_CREATE_FAILED,
  CallStatus.ENRICH_FAILED,
  CallStatus.DISPATCH_FAILED,
];

const BACKFILL_BATCH_SIZE = 10;

async function backfillMissingDurations(
  attempts: Array<{
    id: string;
    sessionId: string | null;
    durationSec: number | null;
    startedAt: Date;
    endedAt: Date | null;
    toolCallsJson: unknown;
    callId: string | null;
  }>
): Promise<Map<string, number>> {
  const resolved = new Map<string, number>();
  if (!isTTaiConfigured()) return resolved;

  const missing = attempts.filter(
    (attempt) =>
      attempt.sessionId &&
      (attempt.durationSec == null || attempt.durationSec <= 0) &&
      durationSecFromAttempt({
        durationSec: attempt.durationSec,
        startedAt: attempt.startedAt,
        endedAt: attempt.endedAt,
        toolCallsJson: attempt.toolCallsJson,
      }) <= 0
  );

  for (const attempt of missing.slice(0, BACKFILL_BATCH_SIZE)) {
    const sessionId = attempt.sessionId!;
    const result = await fetchTtaiSessionDetails(sessionId);
    const durationSec = durationSecFromTtaiSession(result.session);
    if (durationSec == null || durationSec <= 0) continue;

    resolved.set(attempt.id, durationSec);

    const baseStore = ensureTtaiWebhookStore(attempt.toolCallsJson, {
      sessionId,
      callId: attempt.callId ?? undefined,
    });
    const finalStore = attachSessionDetailsToStore(baseStore, result);

    await db.callAttempt.update({
      where: { id: attempt.id },
      data: {
        durationSec,
        toolCallsJson: finalStore as unknown as Prisma.InputJsonValue,
      },
    });
  }

  return resolved;
}

export async function getCallAnalyticsForStore(
  storeDomain: string
): Promise<{
  summary: CallAnalyticsSummary;
  attempts: CallAttemptRow[];
}> {
  const { userId } = await auth();
  if (!userId) {
    return {
      summary: emptySummary(),
      attempts: [],
    };
  }

  const attempts = await db.callAttempt.findMany({
    where: {
      checkout: { storeDomain },
      status: { notIn: [CallStatus.PENDING, CallStatus.PREPARING] },
    },
    include: {
      checkout: {
        select: {
          id: true,
          checkoutToken: true,
          customerPhone: true,
          cartValue: true,
        },
      },
    },
    orderBy: { startedAt: "desc" },
    take: 200,
  });

  const backfilled = await backfillMissingDurations(attempts);

  const rows: CallAttemptRow[] = attempts.map((attempt) => {
    const durationSec =
      backfilled.get(attempt.id) ?? durationSecFromAttempt(attempt);
    return {
      id: attempt.id,
      checkoutId: attempt.checkout.id,
      checkoutToken: attempt.checkout.checkoutToken,
      customerPhone: attempt.checkout.customerPhone,
      cartValue: attempt.checkout.cartValue,
      status: attempt.status,
      trigger: attempt.trigger,
      sessionId: attempt.sessionId,
      durationSec,
      startedAt: attempt.startedAt.toISOString(),
      endedAt: attempt.endedAt?.toISOString() ?? null,
    };
  });

  const totalDurationSec = rows.reduce((sum, row) => sum + row.durationSec, 0);

  return {
    summary: {
      totalCalls: rows.length,
      completedCalls: rows.filter((r) => r.status === CallStatus.COMPLETED).length,
      failedCalls: rows.filter((r) => FAILED_STATUSES.includes(r.status)).length,
      totalDurationSec,
      totalMinutes: Math.round((totalDurationSec / 60) * 10) / 10,
      callsWithDuration: rows.filter((r) => r.durationSec > 0).length,
    },
    attempts: rows,
  };
}

function emptySummary(): CallAnalyticsSummary {
  return {
    totalCalls: 0,
    completedCalls: 0,
    failedCalls: 0,
    totalDurationSec: 0,
    totalMinutes: 0,
    callsWithDuration: 0,
  };
}

export type { AnalyticsDateRange } from "@/lib/analytics";

export interface StoreAnalyticsView {
  source: "ttai" | "local";
  scenarioName?: string;
  avgScore?: number;
  summary: CallAnalyticsSummary;
  timeSeries: TtaiAnalyticsTimeSeriesPoint[];
  attempts: CallAttemptRow[];
  ttaiError?: string;
}

export async function getStoreAnalyticsView(
  storeDomain: string,
  dateRange: AnalyticsDateRange = "30d"
): Promise<StoreAnalyticsView> {
  const { userId } = await auth();
  if (!userId) {
    return {
      source: "local",
      summary: emptySummary(),
      timeSeries: [],
      attempts: [],
    };
  }

  const local = await getCallAnalyticsForStore(storeDomain);
  const { startDate, endDate } = analyticsDateRangeToIso(dateRange);

  const store = await db.store.findUnique({
    where: { storeDomain },
    select: { ttaiScenarioId: true },
  });

  const ttaiResult = await fetchTtaiUnifiedAnalytics({
    isOrg: true,
    startDate,
    endDate,
  });

  if (!ttaiResult.success || !ttaiResult.data) {
    return {
      source: "local",
      summary: local.summary,
      timeSeries: [],
      attempts: local.attempts,
      ttaiError: ttaiResult.error,
    };
  }

  const scenario = store?.ttaiScenarioId
    ? ttaiResult.data.scenarios.find(
        (s) => s.scenario_id === store.ttaiScenarioId
      )
    : undefined;

  const summary = mergeTtaiSummary(local.summary, scenario, ttaiResult.data);

  return {
    source: scenario || ttaiResult.data.org_dashboard ? "ttai" : "local",
    scenarioName: scenario?.scenario_name,
    avgScore: scenario?.avg_score,
    summary,
    timeSeries: ttaiResult.data.org_dashboard?.time_series ?? [],
    attempts: local.attempts,
  };
}

function mergeTtaiSummary(
  local: CallAnalyticsSummary,
  scenario: TtaiScenarioAnalytics | undefined,
  data: NonNullable<Awaited<ReturnType<typeof fetchTtaiUnifiedAnalytics>>["data"]>
): CallAnalyticsSummary {
  if (scenario) {
    const totalMinutes = scenarioTotalMinutes(scenario);
    return {
      ...local,
      totalCalls: scenario.total_sessions,
      totalMinutes,
      totalDurationSec: Math.round(totalMinutes * 60),
    };
  }

  const orgSummary = data.org_dashboard?.summary;
  if (orgSummary) {
    return {
      ...local,
      totalCalls: orgSummary.total_sessions,
      totalMinutes: orgSummary.total_minutes,
      totalDurationSec: Math.round(orgSummary.total_minutes * 60),
    };
  }

  return local;
}
