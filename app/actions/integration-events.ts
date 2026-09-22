"use server";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { guardStoreAccess, isCurrentUserAdmin } from "@/lib/store-access";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export type IntegrationEventDirection = "all" | "inbound" | "poll";

export interface IntegrationEventRow {
  id: string;
  source: string;
  eventType: string;
  outcome: string;
  httpStatus: number | null;
  sessionId: string | null;
  callId: string | null;
  storeDomain: string | null;
  callAttemptId: string | null;
  checkoutId: string | null;
  deliveryId: string | null;
  payload: unknown;
  payloadBytes: number;
  note: string | null;
  receivedAt: string;
  processingMs: number | null;
}

export interface IntegrationEventsResult {
  success: boolean;
  events: IntegrationEventRow[];
  hasMore: boolean;
  /** True when unattributed rows are included (admins only). */
  includesUnmatched: boolean;
  error?: string;
}

export interface IntegrationEventsQuery {
  storeDomain: string;
  direction?: IntegrationEventDirection;
  outcome?: string;
  /** Matches session id, call id, checkout id, or delivery id. */
  search?: string;
  limit?: number;
  /** Fetch rows older than this ISO timestamp. */
  before?: string | null;
}

const POLL_SOURCES = ["ttai_session_poll"];
const INBOUND_SOURCES = ["ttai", "shopify_checkout_update"];

function sourceFilter(direction: IntegrationEventDirection): string[] | null {
  if (direction === "poll") return POLL_SOURCES;
  if (direction === "inbound") return INBOUND_SOURCES;
  return null;
}

function toRow(
  event: Awaited<ReturnType<typeof db.webhookEvent.findMany>>[number]
): IntegrationEventRow {
  return {
    id: event.id,
    source: event.source,
    eventType: event.eventType,
    outcome: event.outcome,
    httpStatus: event.httpStatus,
    sessionId: event.sessionId,
    callId: event.callId,
    storeDomain: event.storeDomain,
    callAttemptId: event.callAttemptId,
    checkoutId: event.checkoutId,
    deliveryId: event.deliveryId,
    payload: event.payload,
    payloadBytes: event.payloadBytes,
    note: event.note,
    receivedAt: event.receivedAt.toISOString(),
    processingMs: event.processingMs,
  };
}

export async function getIntegrationEvents(
  query: IntegrationEventsQuery
): Promise<IntegrationEventsResult> {
  const accessError = await guardStoreAccess(query.storeDomain);
  if (accessError) {
    return {
      success: false,
      events: [],
      hasMore: false,
      includesUnmatched: false,
      error: accessError,
    };
  }

  // Rejected or unmatched webhooks carry no store attribution, and in a
  // multi-tenant deployment they could belong to any store — so they are only
  // exposed to admins.
  const includesUnmatched = await isCurrentUserAdmin();
  const limit = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const sources = sourceFilter(query.direction ?? "all");
  const search = query.search?.trim();

  const where: Prisma.WebhookEventWhereInput = {
    ...(includesUnmatched
      ? { OR: [{ storeDomain: query.storeDomain }, { storeDomain: null }] }
      : { storeDomain: query.storeDomain }),
    ...(sources ? { source: { in: sources } } : {}),
    ...(query.outcome ? { outcome: query.outcome } : {}),
    ...(query.before ? { receivedAt: { lt: new Date(query.before) } } : {}),
    ...(search
      ? {
          AND: [
            {
              OR: [
                { sessionId: search },
                { callId: search },
                { checkoutId: search },
                { deliveryId: search },
              ],
            },
          ],
        }
      : {}),
  };

  const events = await db.webhookEvent.findMany({
    where,
    orderBy: { receivedAt: "desc" },
    take: limit + 1,
  });

  return {
    success: true,
    events: events.slice(0, limit).map(toRow),
    hasMore: events.length > limit,
    includesUnmatched,
  };
}

export async function getIntegrationEventOutcomes(
  storeDomain: string
): Promise<string[]> {
  const accessError = await guardStoreAccess(storeDomain);
  if (accessError) return [];

  const grouped = await db.webhookEvent.groupBy({
    by: ["outcome"],
    where: { storeDomain },
    _count: { outcome: true },
    orderBy: { _count: { outcome: "desc" } },
  });

  return grouped.map((row) => row.outcome);
}
