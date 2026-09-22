import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sanitizeRecoveryError } from "@/lib/recovery-error";

export const PIPELINE_STEPS = [
  "queued",
  "claimed",
  "validate",
  "draft_create",
  "draft_fetch",
  "cart_create",
  "uagents",
  "repeat_customer",
  "sip_dispatch",
  "sip_acked",
  "reconciled",
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];

export const PIPELINE_STEP_STATUSES = [
  "started",
  "succeeded",
  "failed",
  "skipped",
] as const;

export type PipelineStepStatus = (typeof PIPELINE_STEP_STATUSES)[number];

export const PIPELINE_STEP_LABELS: Record<PipelineStep, string> = {
  queued: "Queued",
  claimed: "Claimed by worker",
  validate: "Validate",
  draft_create: "Create draft order",
  draft_fetch: "Fetch draft order",
  cart_create: "Create cart",
  uagents: "Enrich context",
  repeat_customer: "Repeat-customer lookup",
  sip_dispatch: "SIP dispatch",
  sip_acked: "SIP acknowledged",
  reconciled: "Resolved from session poll",
};

export interface PipelineEventContext {
  checkoutId: string;
  storeDomain: string;
  callAttemptId?: string | null;
  trigger?: string;
}

export interface PipelineEventRow {
  id: string;
  callAttemptId: string | null;
  step: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  detail: unknown;
}

function detailPayload(
  ctx: PipelineEventContext,
  extra?: Record<string, unknown>
): Prisma.InputJsonValue {
  return {
    trigger: ctx.trigger ?? null,
    ...extra,
  } as Prisma.InputJsonValue;
}

export async function recordPipelineEvent(
  ctx: PipelineEventContext,
  step: PipelineStep,
  status: PipelineStepStatus,
  extra?: {
    startedAt?: Date;
    endedAt?: Date | null;
    durationMs?: number | null;
    detail?: Record<string, unknown>;
  }
): Promise<void> {
  const startedAt = extra?.startedAt ?? new Date();
  const endedAt =
    extra?.endedAt === undefined
      ? status === "started"
        ? null
        : new Date()
      : extra.endedAt;
  const durationMs =
    extra?.durationMs ??
    (endedAt ? Math.max(0, endedAt.getTime() - startedAt.getTime()) : null);

  await db.callPipelineEvent.create({
    data: {
      checkoutId: ctx.checkoutId,
      storeDomain: ctx.storeDomain,
      callAttemptId: ctx.callAttemptId ?? null,
      step,
      status,
      startedAt,
      endedAt,
      durationMs,
      detail: detailPayload(ctx, extra?.detail),
    },
  });
}

export function startPipelineStep(
  ctx: PipelineEventContext,
  step: PipelineStep,
  detail?: Record<string, unknown>
) {
  const startedAt = new Date();
  const created = db.callPipelineEvent.create({
    data: {
      checkoutId: ctx.checkoutId,
      storeDomain: ctx.storeDomain,
      callAttemptId: ctx.callAttemptId ?? null,
      step,
      status: "started",
      startedAt,
      detail: detailPayload(ctx, detail),
    },
    select: { id: true },
  });

  async function finish(
    status: Exclude<PipelineStepStatus, "started">,
    extra?: Record<string, unknown>
  ) {
    const row = await created;
    const endedAt = new Date();
    await db.callPipelineEvent.update({
      where: { id: row.id },
      data: {
        status,
        endedAt,
        durationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
        detail: detailPayload(ctx, extra),
        ...(ctx.callAttemptId ? { callAttemptId: ctx.callAttemptId } : {}),
      },
    });
  }

  return {
    startedAt,
    succeed: (extra?: Record<string, unknown>) => finish("succeeded", extra),
    fail: (reason: string, extra?: Record<string, unknown>) =>
      finish("failed", {
        error: sanitizeRecoveryError(reason).slice(0, 500),
        ...extra,
      }),
    skip: (reason: string) => finish("skipped", { reason }),
  };
}

export function toPipelineEventRow(event: {
  id: string;
  callAttemptId: string | null;
  step: string;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  durationMs: number | null;
  detail: Prisma.JsonValue;
}): PipelineEventRow {
  return {
    id: event.id,
    callAttemptId: event.callAttemptId,
    step: event.step,
    status: event.status,
    startedAt: event.startedAt.toISOString(),
    endedAt: event.endedAt?.toISOString() ?? null,
    durationMs: event.durationMs,
    detail: event.detail,
  };
}

export function sumPipelineDurationMs(
  events: Array<{ durationMs: number | null; status: string }>
): number | null {
  const counted = events.filter(
    (event) => event.status !== "started" && event.durationMs != null
  );
  if (counted.length === 0) return null;
  return counted.reduce((sum, event) => sum + (event.durationMs ?? 0), 0);
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 1000)}s`;
}
