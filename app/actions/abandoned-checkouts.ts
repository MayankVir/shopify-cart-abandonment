"use server";

import { auth } from "@clerk/nextjs/server";
import { CallStatus, CheckoutSyncMode, Prisma, SheetSyncDirection } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  canEditSchedule,
  canScheduleCallback,
  canStopCall,
  isManualCheckoutStatus,
  MANUAL_CHECKOUT_STATUSES,
  nextCallScheduledFlag,
  type AutoCallEnrollmentSelection,
} from "@/lib/call-status";
import {
  type CheckoutSyncModeValue,
  isCheckoutSyncMode,
  CHECKOUT_SYNC_MODES,
} from "@/lib/checkout-sync-mode";
import { getLastWebhookDebug, type WebhookDebugInfo } from "@/lib/store-domain";
import { db } from "@/lib/db";
import {
  DEFAULT_CALL_FEEDBACK_KEY_COLUMN,
  inspectCallFeedbackSheet,
} from "@/lib/call-feedback-sheet";
import { runRecoveryCallPipeline, processScheduledCallsForStore, stopRecoveryCall } from "@/lib/recovery-pipeline";
import { assertStoreAccess, StoreAccessError } from "@/lib/store-access";
import {
  callWindowFromStore,
  clampToCallWindow,
  clampWindowMinute,
  DEFAULT_CALL_WINDOW_END_MINUTE,
  DEFAULT_CALL_WINDOW_START_MINUTE,
  isValidTimeZone,
} from "@/lib/call-window";
import {
  cancelScheduledBusyRetries,
  enrollOpenCheckoutsForAutoCall,
  rescheduleBusyFailures,
  unschedulePendingAutoCalls,
} from "@/lib/call-queue";
import { clampBusyRetryDelayMinutes } from "@/lib/busy-retry";
import {
  toPipelineEventRow,
  type PipelineEventRow,
} from "@/lib/call-pipeline-events";
import {
  ABANDONED_CHECKOUTS_PAGE_SIZE,
  checkoutTokenFromNode,
  extractCheckoutCustomerName,
  extractCheckoutPhone,
  fetchGrantedAdminScopes,
  fetchShopIanaTimezone,
  fetchShopifyAbandonedCheckouts,
  isRetryableStatus,
  mapAdminLineItems,
  parseShopMoney,
  resolveScheduledCallAt,
  SHOPIFY_ABANDONED_CHECKOUT_STATUS,
  TERMINAL_CALL_STATUSES,
  type AdminAccessVerification,
  type AbandonedCheckoutsPageInfo,
  verifyStoreAdminAccess,
} from "@/lib/shopify-admin";
import {
  describePollBlockedWhenScopesPresent,
  isAbandonedCheckoutAccessError,
} from "@/lib/shopify-errors";
import {
  ensureAdminTokenForUpcomingCalls,
  getCachedAdminTokenInfo,
  resolveStoreAdminAccessToken,
} from "@/lib/shopify-admin-token";
import { parseLineItems } from "@/lib/line-items";
import { startTiming, type TimingLog, type TimingReport } from "@/lib/timing-log";
import {
  syncAbandonedCheckoutsForDate,
  syncAbandonedCheckoutsFromSheet,
} from "@/lib/sheet-sync";
import { clampRepeatCustomerWindowDays } from "@/lib/shopify-repeat-customer";

async function guardStoreAccess(storeDomain: string): Promise<string | null> {
  try {
    await assertStoreAccess(storeDomain);
    return null;
  } catch (error) {
    return error instanceof StoreAccessError ? error.message : "Forbidden";
  }
}
import { formatShippingAddressFromUserContext } from "@/lib/shipping-address";
import {
  parseCustomerNameFromUserContext,
  withCustomerName,
} from "@/lib/user-context";
import { sanitizeRecoveryError } from "@/lib/recovery-error";

const ARCHIVED_IN_SHOPIFY_MESSAGE = "Archived in Shopify admin";

function wasArchivedInShopify(checkout: {
  callStatus: CallStatus;
  lastError: string | null;
}): boolean {
  return (
    checkout.lastError === ARCHIVED_IN_SHOPIFY_MESSAGE &&
    checkout.callStatus === CallStatus.HANG_UP
  );
}

export interface CallAttemptRow {
  id: string;
  callId: string | null;
  sessionId: string | null;
  status: CallStatus;
  failureStage: string | null;
  failureReason: string | null;
  transcript: string | null;
  toolCallsJson: unknown;
  trigger: string;
  retryNumber: number;
  startedAt: string;
  endedAt: string | null;
  durationSec: number | null;
}

export interface AbandonedCheckoutRow {
  id: string;
  checkoutToken: string;
  shopifyCheckoutId: string | null;
  customerPhone: string;
  customerEmail: string | null;
  cartValue: number;
  cartId: string;
  checkoutUrl: string;
  draftOrderId: string;
  draftOrderName: string;
  recoveryUrl: string;
  customerName: string;
  address: string;
  callScheduled: boolean;
  scheduledCallAt: string | null;
  autoCallExcluded: boolean;
  shopifyCreatedAt: string | null;
  callStatus: CallStatus;
  lastError: string | null;
  sessionId: string | null;
  storeDomain: string;
  latestAttempt: CallAttemptRow | null;
  autoRetryCount: number;
  telephonyRetryCount: number;
  attemptCount: number;
  lineItems: Array<{ title: string; quantity: number }>;
}

export interface SyncResult {
  success: boolean;
  checkouts: AbandonedCheckoutRow[];
  completedCheckouts?: AbandonedCheckoutRow[];
  syncedAt: string;
  syncMode?: "graphql" | "rest" | "webhook-only" | "sheet";
  warning?: string;
  autoCalls?: { processed: number; errors: number };
  adminTokenSource?: string;
  adminTokenExpiresInSec?: number | null;
  totalCount?: number;
  shopifyPageInfo?: AbandonedCheckoutsPageInfo;
  sheetPageInfo?: SheetPageInfo;
  error?: string;
  timings?: TimingReport;
}

export interface SheetPageInfo {
  page: number;
  hasNextPage: boolean;
  pageSize: number;
  rowRangeLabel?: string;
  syncDirection?: "TOP" | "BOTTOM";
  totalDataRows?: number;
}

export interface CheckoutListResult {
  success: boolean;
  checkouts: AbandonedCheckoutRow[];
  completedCheckouts?: AbandonedCheckoutRow[];
  totalCount: number;
  error?: string;
  timings?: TimingReport;
}

export interface SyncOptions {
  shopifyAfter?: string | null;
  sheetPage?: number;
}

/** List polls omit transcript and tool-call JSON. The drawer loads those on open. */
const LIST_ATTEMPT_SELECT = {
  id: true,
  callId: true,
  sessionId: true,
  status: true,
  failureStage: true,
  failureReason: true,
  trigger: true,
  retryNumber: true,
  startedAt: true,
  endedAt: true,
  durationSec: true,
} satisfies Prisma.CallAttemptSelect;

const CHECKOUT_LIST_INCLUDE = {
  callAttempts: {
    orderBy: { startedAt: "desc" as const },
    take: 1,
    select: LIST_ATTEMPT_SELECT,
  },
  _count: { select: { callAttempts: true } },
} satisfies Prisma.AbandonedCheckoutInclude;

type AttemptRowSource = {
  id: string;
  callId: string | null;
  sessionId: string | null;
  status: CallStatus;
  failureStage: string | null;
  failureReason: string | null;
  trigger: string;
  retryNumber: number;
  startedAt: Date;
  endedAt: Date | null;
  durationSec: number | null;
  transcript?: string | null;
  toolCallsJson?: unknown;
};

function toAttemptRow(a: AttemptRowSource): CallAttemptRow {
  return {
    id: a.id,
    callId: a.callId,
    sessionId: a.sessionId,
    status: a.status,
    failureStage: a.failureStage,
    failureReason: sanitizeRecoveryError(a.failureReason) || null,
    transcript: a.transcript ?? null,
    toolCallsJson: a.toolCallsJson ?? null,
    trigger: a.trigger,
    retryNumber: a.retryNumber,
    startedAt: a.startedAt.toISOString(),
    endedAt: a.endedAt?.toISOString() ?? null,
    durationSec: a.durationSec,
  };
}

function toRow(
  c: Prisma.AbandonedCheckoutGetPayload<{
    include: typeof CHECKOUT_LIST_INCLUDE;
  }>
): AbandonedCheckoutRow {
  const latest = c.callAttempts?.[0];
  return {
    id: c.id,
    checkoutToken: c.checkoutToken,
    shopifyCheckoutId: c.shopifyCheckoutId,
    customerPhone: c.customerPhone,
    customerEmail: c.customerEmail,
    cartValue: c.cartValue,
    cartId: c.cartId,
    checkoutUrl: c.checkoutUrl,
    draftOrderId: c.draftOrderId,
    draftOrderName: c.draftOrderName,
    recoveryUrl: c.recoveryUrl,
    customerName: parseCustomerNameFromUserContext(c.userContext),
    address: formatShippingAddressFromUserContext(c.userContext),
    callScheduled: c.callScheduled,
    scheduledCallAt: c.scheduledCallAt?.toISOString() ?? null,
    autoCallExcluded: c.autoCallExcluded,
    shopifyCreatedAt: c.shopifyCreatedAt?.toISOString() ?? null,
    callStatus: c.callStatus,
    lastError: sanitizeRecoveryError(c.lastError) || null,
    sessionId: c.sessionId,
    storeDomain: c.storeDomain,
    latestAttempt: latest ? toAttemptRow(latest) : null,
    autoRetryCount: c.autoRetryCount,
    telephonyRetryCount: c.telephonyRetryCount,
    attemptCount: c._count?.callAttempts ?? c.callAttempts?.length ?? 0,
    lineItems: parseLineItems(c.lineItemsJson).map((item) => ({
      title: item.title,
      quantity: item.quantity,
    })),
  };
}

/** Safety ceiling so an unexpectedly large queue can't produce a huge payload. */
const CHECKOUT_LIST_MAX_ROWS = 500;

async function fetchOpenCheckouts(storeDomain: string, timing?: TimingLog) {
  const where = {
    storeDomain,
    callStatus: { notIn: [...TERMINAL_CALL_STATUSES] },
  };

  const query = () =>
    Promise.all([
      db.abandonedCheckout.findMany({
        where,
        orderBy: [
          { shopifyCreatedAt: { sort: "desc", nulls: "last" } },
          { createdAt: "desc" },
        ],
        take: CHECKOUT_LIST_MAX_ROWS,
        include: CHECKOUT_LIST_INCLUDE,
      }),
      db.abandonedCheckout.count({ where }),
    ]);
  const [checkouts, totalCount] = timing
    ? await timing.measure("db-open-checkouts", query)
    : await query();

  const rows = timing
    ? timing.measureSync("map-open-checkouts", () => checkouts.map(toRow))
    : checkouts.map(toRow);

  return {
    checkouts: rows,
    totalCount,
  };
}

async function fetchCompletedCheckouts(storeDomain: string, timing?: TimingLog) {
  const query = () =>
    db.abandonedCheckout.findMany({
      where: { storeDomain, callStatus: CallStatus.COMPLETED },
      orderBy: [
        { shopifyCreatedAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      take: 200,
      include: CHECKOUT_LIST_INCLUDE,
    });
  const checkouts = timing
    ? await timing.measure("db-completed-checkouts", query)
    : await query();

  return timing
    ? timing.measureSync("map-completed-checkouts", () => checkouts.map(toRow))
    : checkouts.map(toRow);
}

export async function getAbandonedCheckoutsForStore(
  storeDomain: string
): Promise<CheckoutListResult> {
  const timing = startTiming("recovery-load");
  try {
    const { userId } = await timing.measure("auth", () => auth());
    if (!userId) {
      return {
        success: false,
        checkouts: [],
        totalCount: 0,
        error: "Unauthorized",
        timings: timing.snapshot(),
      };
    }

    const accessError = await timing.measure("access", () =>
      guardStoreAccess(storeDomain),
    );
    if (accessError) {
      return {
        success: false,
        checkouts: [],
        totalCount: 0,
        error: accessError,
        timings: timing.snapshot(),
      };
    }

    const store = await timing.measure("load-store", () =>
      db.store.findUnique({ where: { storeDomain } }),
    );
    if (!store) {
      return {
        success: false,
        checkouts: [],
        totalCount: 0,
        error: "Store not found",
        timings: timing.snapshot(),
      };
    }

    const [result, completedCheckouts] = await Promise.all([
      fetchOpenCheckouts(storeDomain, timing),
      fetchCompletedCheckouts(storeDomain, timing),
    ]);
    return {
      success: true,
      ...result,
      completedCheckouts,
      timings: timing.snapshot(),
    };
  } finally {
    timing.finish({ storeDomain });
  }
}

async function applyAutoCallEnrollment(
  storeDomain: string,
  enabled: boolean,
  selection?: AutoCallEnrollmentSelection
): Promise<number> {
  if (enabled) {
    const store = await db.store.findUnique({ where: { storeDomain } });
    if (!store) return 0;
    return enrollOpenCheckoutsForAutoCall(store, new Date(), selection);
  }

  await unschedulePendingAutoCalls(storeDomain);
  return 0;
}

async function dispatchDueAutoCalls(storeDomain: string, enabled: boolean) {
  if (!enabled) return undefined;
  return processScheduledCallsForStore(storeDomain);
}

export async function syncAbandonedCheckoutsForStore(
  store: NonNullable<Awaited<ReturnType<typeof db.store.findUnique>>>,
  options: SyncOptions = {},
  timing?: TimingLog,
): Promise<SyncResult> {
  const storeDomain = store.storeDomain;

  try {
    if (store.checkoutSyncMode === CheckoutSyncMode.SHEET) {
      const sheetPage = options.sheetPage ?? 0;
      const sheetResult = await syncAbandonedCheckoutsFromSheet(
        store,
        { page: sheetPage },
        timing,
      );
      const [listResult, completedCheckouts] = await Promise.all([
        fetchOpenCheckouts(storeDomain, timing),
        fetchCompletedCheckouts(storeDomain, timing),
      ]);

      console.info(
        "[sheet] abandoned checkouts synced",
        JSON.stringify({
          storeDomain,
          page: sheetResult.page,
          synced: sheetResult.synced,
          skipped: sheetResult.skipped,
          hasMore: sheetResult.hasMore,
        })
      );

      return {
        success: true,
        checkouts: listResult.checkouts,
        completedCheckouts,
        syncedAt: new Date().toISOString(),
        syncMode: "sheet",
        warning:
          sheetResult.skipped > 0
            ? `${sheetResult.skipped} sheet row(s) skipped (missing variant IDs).`
            : undefined,
        totalCount: listResult.totalCount,
        sheetPageInfo: {
          page: sheetResult.page,
          hasNextPage: sheetResult.hasMore,
          pageSize: sheetResult.pageSize,
          rowRangeLabel: sheetResult.rowRangeLabel,
          syncDirection: sheetResult.syncDirection,
          totalDataRows: sheetResult.totalDataRows,
        },
      };
    }

    let shopifyNodes: Awaited<
      ReturnType<typeof fetchShopifyAbandonedCheckouts>
    >["nodes"] = [];
    let shopifyPageInfo: AbandonedCheckoutsPageInfo | undefined;
    let syncMode: SyncResult["syncMode"] = "graphql";
    let warning: string | undefined;

    try {
      const adminAuth = timing
        ? await timing.measure("shopify-token", () =>
            resolveStoreAdminAccessToken(store),
          )
        : await resolveStoreAdminAccessToken(store);
      const shopifyPage = timing
        ? await timing.measure("shopify-fetch", () =>
            fetchShopifyAbandonedCheckouts(storeDomain, adminAuth.token, {
              first: ABANDONED_CHECKOUTS_PAGE_SIZE,
              after: options.shopifyAfter,
            }),
          )
        : await fetchShopifyAbandonedCheckouts(storeDomain, adminAuth.token, {
            first: ABANDONED_CHECKOUTS_PAGE_SIZE,
            after: options.shopifyAfter,
          });
      shopifyNodes = shopifyPage.nodes;
      shopifyPageInfo = shopifyPage.pageInfo;
      console.info(
        "[poll] abandoned checkouts fetched",
        JSON.stringify({
          storeDomain,
          count: shopifyNodes.length,
          shopifyStatus: SHOPIFY_ABANDONED_CHECKOUT_STATUS.OPEN,
          hasNextPage: shopifyPageInfo.hasNextPage,
          adminTokenSource: adminAuth.source,
          adminTokenExpiresInSec: adminAuth.expiresInSec,
        })
      );
    } catch (pollError) {
      const message =
        pollError instanceof Error ? pollError.message : String(pollError);

      if (isAbandonedCheckoutAccessError(message)) {
        syncMode = "webhook-only";
        let granted: string[] = [];
        try {
          const adminAuth = await resolveStoreAdminAccessToken(store);
          granted = await fetchGrantedAdminScopes(
            storeDomain,
            adminAuth.token
          );
        } catch {
          // ignore
        }
        warning = describePollBlockedWhenScopesPresent(granted);
        console.warn("Admin API poll skipped:", message);
      } else {
        throw pollError;
      }
    }

    const upsertStarted = Date.now();
    for (const node of shopifyNodes) {
      const checkoutToken = checkoutTokenFromNode(node);
      const phone = extractCheckoutPhone(node);
      const shopifyName = extractCheckoutCustomerName(node);
      const cartValue = parseShopMoney(node);
      const shopifyCreatedAt = new Date(node.createdAt);
      const lineItemsJson = mapAdminLineItems(node) as unknown as Prisma.InputJsonValue;

      const existing = await db.abandonedCheckout.findFirst({
        where: {
          OR: [{ shopifyCheckoutId: node.id }, { checkoutToken }],
        },
      });

      const scheduledCallAt = resolveScheduledCallAt(
        existing,
        shopifyCreatedAt,
        store.callDelayMinutes,
        new Date(),
        callWindowFromStore(store)
      );
      const existingName = parseCustomerNameFromUserContext(
        existing?.userContext
      );
      const nextName = existingName || shopifyName;
      const userContext = nextName
        ? withCustomerName(existing?.userContext ?? "", nextName)
        : existing?.userContext;

      if (existing) {
        const unarchivedInShopify = wasArchivedInShopify(existing);

        await db.abandonedCheckout.update({
          where: { id: existing.id },
          data: {
            shopifyCheckoutId: node.id,
            customerPhone: phone || existing.customerPhone,
            customerEmail: node.customer?.email ?? existing.customerEmail,
            cartValue,
            recoveryUrl: node.abandonedCheckoutUrl || existing.recoveryUrl,
            lineItemsJson,
            shopifyCreatedAt,
            scheduledCallAt,
            ...(userContext ? { userContext } : {}),
            ...(unarchivedInShopify
              ? {
                  callStatus: CallStatus.PENDING,
                  lastError: null,
                  callScheduled: nextCallScheduledFlag(
                    store.autoCallsEnabled,
                    phone || existing.customerPhone
                  ),
                }
              : {
                  callScheduled: nextCallScheduledFlag(
                    store.autoCallsEnabled,
                    phone || existing.customerPhone,
                    existing
                  ),
                }),
          },
        });
      } else {
        await db.abandonedCheckout.create({
          data: {
            checkoutToken,
            shopifyCheckoutId: node.id,
            customerPhone: phone,
            customerEmail: node.customer?.email ?? null,
            cartValue,
            recoveryUrl: node.abandonedCheckoutUrl,
            lineItemsJson,
            shopifyCreatedAt,
            scheduledCallAt,
            ...(userContext ? { userContext } : {}),
            callScheduled: nextCallScheduledFlag(store.autoCallsEnabled, phone),
            callStatus: CallStatus.PENDING,
            storeDomain,
          },
        });
      }
    }
    timing?.add("shopify-upsert", Date.now() - upsertStarted);

    const [listResult, completedCheckouts] = await Promise.all([
      fetchOpenCheckouts(storeDomain, timing),
      fetchCompletedCheckouts(storeDomain, timing),
    ]);
    const tokenCache = getCachedAdminTokenInfo(storeDomain);

    return {
      success: true,
      checkouts: listResult.checkouts,
      completedCheckouts,
      syncedAt: new Date().toISOString(),
      syncMode,
      warning,
      adminTokenSource: tokenCache.cached ? "cache" : undefined,
      adminTokenExpiresInSec: tokenCache.expiresInSec,
      totalCount: listResult.totalCount,
      shopifyPageInfo,
    };
  } catch (error) {
    console.error("Sync abandoned checkouts failed:", error);
    const raw = error instanceof Error ? error.message : "Sync failed";
    return {
      success: false,
      checkouts: [],
      syncedAt: new Date().toISOString(),
      error: raw,
    };
  }
}

export async function syncAbandonedCheckouts(
  storeDomain: string,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const timing = startTiming("sync-now");
  const failed = (error: string): SyncResult => ({
    success: false,
    checkouts: [],
    syncedAt: new Date().toISOString(),
    error,
    timings: timing.snapshot(),
  });

  try {
    const { userId } = await timing.measure("auth", () => auth());
    if (!userId) return failed("Unauthorized");

    const accessError = await timing.measure("access", () =>
      guardStoreAccess(storeDomain),
    );
    if (accessError) return failed(accessError);

    const store = await timing.measure("load-store", () =>
      db.store.findUnique({ where: { storeDomain } }),
    );
    if (!store) return failed("Store not found");

    const result = await syncAbandonedCheckoutsForStore(store, options, timing);
    const autoCalls = await timing.measure("auto-calls", () =>
      dispatchDueAutoCalls(storeDomain, store.autoCallsEnabled && result.success),
    );
    return {
      ...(autoCalls ? { ...result, autoCalls } : result),
      timings: timing.snapshot(),
    };
  } finally {
    timing.finish({ storeDomain });
  }
}

export async function fetchAbandonedCheckoutsForDate(
  storeDomain: string,
  dateLabel: string,
): Promise<SyncResult & { matched: number; syncedCount: number }> {
  const failed = (error: string): SyncResult & { matched: number; syncedCount: number } => ({
    success: false,
    checkouts: [],
    syncedAt: new Date().toISOString(),
    error,
    matched: 0,
    syncedCount: 0,
  });

  const { userId } = await auth();
  if (!userId) return failed("Unauthorized");

  const accessError = await guardStoreAccess(storeDomain);
  if (accessError) return failed(accessError);

  const store = await db.store.findUnique({ where: { storeDomain } });
  if (!store) return failed("Store not found");
  if (store.checkoutSyncMode !== CheckoutSyncMode.SHEET) {
    return failed("Fetch all by date is available when checkout sync uses the sheet.");
  }

  const label = dateLabel.trim();
  if (!label || label === "No date") return failed("That row has no date to fetch.");

  try {
    const fetched = await syncAbandonedCheckoutsForDate(store, label);
    const [listResult, completedCheckouts] = await Promise.all([
      fetchOpenCheckouts(storeDomain),
      fetchCompletedCheckouts(storeDomain),
    ]);
    return {
      success: true,
      checkouts: listResult.checkouts,
      completedCheckouts,
      syncedAt: new Date().toISOString(),
      syncMode: "sheet",
      warning:
        fetched.skipped > 0
          ? `${fetched.skipped} sheet row(s) skipped (missing variant IDs).`
          : undefined,
      totalCount: listResult.totalCount,
      matched: fetched.matched,
      syncedCount: fetched.synced,
    };
  } catch (error) {
    console.error("Fetch checkouts for date failed:", error);
    return failed(error instanceof Error ? error.message : "Fetch failed");
  }
}

export async function initiateRecoveryCall(
  checkoutId: string
): Promise<{
  success: boolean;
  error?: string;
  /** Set when the call was deliberately not placed (already ordered, duplicate cart). */
  skipped?: boolean;
  skipReason?: string;
  checkoutUrl?: string;
  draftOrderId?: string;
  dispatchDurationMs?: number;
  timings?: TimingReport;
  pipeline?: Array<{ step: string; status: string; ms: number | null }>;
}> {
  const timing = startTiming("call-now");
  let pipeline: Array<{ step: string; status: string; ms: number | null }> = [];
  const extra: Record<string, unknown> = { checkoutId };
  try {
    const { userId } = await timing.measure("auth", () => auth());
    if (!userId) {
      return { success: false, error: "Unauthorized", timings: timing.snapshot() };
    }

    const checkout = await timing.measure("load-checkout", () =>
      db.abandonedCheckout.findUnique({
        where: { id: checkoutId },
        include: { store: true },
      }),
    );

    if (!checkout) {
      return {
        success: false,
        error: "Checkout not found",
        timings: timing.snapshot(),
      };
    }

    const accessError = await timing.measure("access", () =>
      guardStoreAccess(checkout.storeDomain),
    );
    if (accessError) {
      return { success: false, error: accessError, timings: timing.snapshot() };
    }

    if (!isRetryableStatus(checkout.callStatus)) {
      return {
        success: false,
        error: "Call cannot be retried for this checkout",
        timings: timing.snapshot(),
      };
    }

    if (checkout.callStatus !== CallStatus.PENDING) {
      await timing.measure("reset-status", () =>
        db.abandonedCheckout.update({
          where: { id: checkoutId },
          data: { callStatus: CallStatus.PENDING, lastError: null },
        }),
      );
    }

    const fresh = await timing.measure("reload-checkout", () =>
      db.abandonedCheckout.findUnique({
        where: { id: checkoutId },
        include: { store: true },
      }),
    );

    if (!fresh) {
      return {
        success: false,
        error: "Checkout not found",
        timings: timing.snapshot(),
      };
    }

    const pipelineStartedAt = new Date();
    const result = await timing.measure("pipeline", () =>
      runRecoveryCallPipeline(fresh, "manual"),
    );
    try {
      const events = await timing.measure("pipeline-events", () =>
        db.callPipelineEvent.findMany({
          where: {
            checkoutId,
            startedAt: { gte: pipelineStartedAt },
            status: { not: "started" },
          },
          orderBy: { startedAt: "asc" },
          select: { step: true, status: true, durationMs: true },
        }),
      );
      pipeline = events.map((event) => ({
        step: event.step,
        status: event.status,
        ms: event.durationMs,
      }));
    } catch (error) {
      console.warn(
        "[timing] call-now pipeline breakdown failed",
        error instanceof Error ? error.message : error,
      );
    }
    extra.success = result.success;
    extra.skipped = result.skipped ?? false;
    extra.pipeline = pipeline;

    revalidatePath("/dashboard/analytics");
    revalidatePath("/dashboard/billing");
    revalidatePath("/dashboard/recovery");

    return {
      success: result.success,
      error: result.error,
      skipped: result.skipped,
      skipReason: result.skipReason,
      checkoutUrl: result.checkoutUrl,
      draftOrderId: result.draftOrderId,
      dispatchDurationMs: result.dispatchDurationMs,
      timings: timing.snapshot(),
      pipeline,
    };
  } finally {
    timing.finish(extra);
  }
}

const MAX_SCHEDULE_AHEAD_MS = 30 * 24 * 60 * 60 * 1000;

async function applyManualCheckoutStatus(
  checkout: {
    id: string;
    callStatus: CallStatus;
    callScheduled: boolean;
  },
  status: CallStatus,
): Promise<"updated" | "unchanged" | "blocked"> {
  if (
    checkout.callStatus === CallStatus.PREPARING ||
    checkout.callStatus === CallStatus.DISPATCHED
  ) {
    return "blocked";
  }
  if (checkout.callStatus === status && !checkout.callScheduled) {
    return "unchanged";
  }

  const option = MANUAL_CHECKOUT_STATUSES.find((item) => item.status === status);
  const skipsSchedule = option?.skipsSchedule ?? status !== CallStatus.PENDING;

  await db.abandonedCheckout.update({
    where: { id: checkout.id },
    data: {
      callStatus: status,
      callScheduled: false,
      retryReason: null,
      autoCallExcluded: skipsSchedule,
      lastError: skipsSchedule
        ? status === CallStatus.COMPLETED
          ? null
          : `Marked as ${option?.label.toLowerCase() ?? "skipped"}`
        : null,
    },
  });
  return "updated";
}

export async function setCheckoutCallStatusAction(
  checkoutId: string,
  status: CallStatus,
): Promise<{ success: boolean; error?: string }> {
  if (!isManualCheckoutStatus(status)) {
    return { success: false, error: "That status cannot be set manually" };
  }

  const checkout = await db.abandonedCheckout.findUnique({
    where: { id: checkoutId },
  });
  if (!checkout) {
    return { success: false, error: "Checkout not found" };
  }

  const accessError = await guardStoreAccess(checkout.storeDomain);
  if (accessError) {
    return { success: false, error: accessError };
  }

  const result = await applyManualCheckoutStatus(checkout, status);
  if (result === "blocked") {
    return {
      success: false,
      error: "Stop the live call before changing its status",
    };
  }

  revalidatePath("/dashboard/recovery");
  return { success: true };
}

export async function setCheckoutsCallStatusAction(
  storeDomain: string,
  checkoutIds: string[],
  status: CallStatus,
): Promise<{ success: boolean; updated: number; failed: number; error?: string }> {
  if (!isManualCheckoutStatus(status)) {
    return { success: false, updated: 0, failed: 0, error: "That status cannot be set manually" };
  }

  const accessError = await guardStoreAccess(storeDomain);
  if (accessError) {
    return { success: false, updated: 0, failed: 0, error: accessError };
  }

  const ids = Array.from(new Set(checkoutIds.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) {
    return { success: false, updated: 0, failed: 0, error: "Select at least one checkout" };
  }

  const checkouts = await db.abandonedCheckout.findMany({
    where: { id: { in: ids }, storeDomain },
    select: { id: true, callStatus: true, callScheduled: true },
  });

  let updated = 0;
  let failed = 0;
  for (const checkout of checkouts) {
    const result = await applyManualCheckoutStatus(checkout, status);
    if (result === "blocked") failed += 1;
    else updated += 1;
  }
  failed += ids.length - checkouts.length;

  revalidatePath("/dashboard/recovery");
  if (updated === 0 && failed > 0) {
    return {
      success: false,
      updated: 0,
      failed,
      error: "Stop any live calls before changing their status",
    };
  }
  return { success: true, updated, failed };
}

export async function updateCheckoutScheduleAction(
  checkoutId: string,
  scheduledCallAtIso: string
): Promise<{ success: boolean; error?: string; scheduledCallAt?: string }> {
  const checkout = await db.abandonedCheckout.findUnique({
    where: { id: checkoutId },
  });

  if (!checkout) {
    return { success: false, error: "Checkout not found" };
  }

  const accessError = await guardStoreAccess(checkout.storeDomain);
  if (accessError) {
    return { success: false, error: accessError };
  }

  if (!canScheduleCallback(checkout.callStatus, checkout.customerPhone)) {
    return {
      success: false,
      error: checkout.customerPhone?.trim()
        ? "This checkout cannot be scheduled while a call is in progress"
        : "A phone number is required to schedule a call",
    };
  }

  const store = await db.store.findUnique({
    where: { storeDomain: checkout.storeDomain },
  });
  if (!store) {
    return { success: false, error: "Store not found" };
  }

  const requested = new Date(scheduledCallAtIso);
  if (Number.isNaN(requested.getTime())) {
    return { success: false, error: "Enter a valid date and time" };
  }

  const scheduledCallAt = clampToCallWindow(requested, callWindowFromStore(store));

  const now = Date.now();
  if (scheduledCallAt.getTime() - now > MAX_SCHEDULE_AHEAD_MS) {
    return {
      success: false,
      error: "Schedule time cannot be more than 30 days from now",
    };
  }

  const isCallback = checkout.callStatus === CallStatus.COMPLETED;

  await db.abandonedCheckout.update({
    where: { id: checkout.id },
    data: {
      scheduledCallAt,
      callScheduled: true,
      callStatus: CallStatus.PENDING,
      autoCallExcluded: false,
      ...(isCallback ? { lastError: null, retryReason: null } : {}),
    },
  });

  revalidatePath("/dashboard/analytics");
  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard/recovery");

  return { success: true, scheduledCallAt: scheduledCallAt.toISOString() };
}

export async function bulkScheduleCheckoutsAction(
  storeDomain: string,
  checkoutIds: string[],
  scheduledCallAtIso: string
): Promise<{
  success: boolean;
  scheduled: number;
  failed: number;
  error?: string;
  scheduledCallAt?: string;
}> {
  const accessError = await guardStoreAccess(storeDomain);
  if (accessError) {
    return { success: false, scheduled: 0, failed: 0, error: accessError };
  }

  if (checkoutIds.length === 0) {
    return { success: true, scheduled: 0, failed: 0 };
  }

  const store = await db.store.findUnique({ where: { storeDomain } });
  if (!store) {
    return { success: false, scheduled: 0, failed: 0, error: "Store not found" };
  }

  const requested = new Date(scheduledCallAtIso);
  if (Number.isNaN(requested.getTime())) {
    return { success: false, scheduled: 0, failed: 0, error: "Enter a valid date and time" };
  }

  const scheduledCallAt = clampToCallWindow(requested, callWindowFromStore(store));
  if (scheduledCallAt.getTime() - Date.now() > MAX_SCHEDULE_AHEAD_MS) {
    return {
      success: false,
      scheduled: 0,
      failed: 0,
      error: "Schedule time cannot be more than 30 days from now",
    };
  }

  const checkouts = await db.abandonedCheckout.findMany({
    where: { id: { in: checkoutIds }, storeDomain },
    select: { id: true, callStatus: true, customerPhone: true },
  });
  const eligibleIds = checkouts
    .filter((checkout) => canEditSchedule(checkout.callStatus, checkout.customerPhone))
    .map((checkout) => checkout.id);

  if (eligibleIds.length > 0) {
    await db.abandonedCheckout.updateMany({
      where: { id: { in: eligibleIds } },
      data: {
        scheduledCallAt,
        callScheduled: true,
        callStatus: CallStatus.PENDING,
        autoCallExcluded: false,
      },
    });
  }

  revalidatePath("/dashboard/recovery");

  return {
    success: eligibleIds.length > 0,
    scheduled: eligibleIds.length,
    failed: checkoutIds.length - eligibleIds.length,
    scheduledCallAt: scheduledCallAt.toISOString(),
    error:
      eligibleIds.length === 0
        ? "Only checkouts with a phone number that are not already on a call can be scheduled"
        : undefined,
  };
}

export async function updateCheckoutCustomerNameAction(
  checkoutId: string,
  customerName: string
): Promise<{ success: boolean; error?: string; customerName?: string }> {
  const checkout = await db.abandonedCheckout.findUnique({
    where: { id: checkoutId },
  });

  if (!checkout) {
    return { success: false, error: "Checkout not found" };
  }

  const accessError = await guardStoreAccess(checkout.storeDomain);
  if (accessError) {
    return { success: false, error: accessError };
  }

  const nextName = customerName.trim();
  if (nextName.length > 80) {
    return { success: false, error: "Name must be 80 characters or fewer" };
  }

  await db.abandonedCheckout.update({
    where: { id: checkout.id },
    data: { userContext: withCustomerName(checkout.userContext, nextName) },
  });

  revalidatePath("/dashboard/recovery");

  return { success: true, customerName: nextName };
}

export async function stopRecoveryCallAction(
  checkoutId: string
): Promise<{ success: boolean; error?: string }> {
  const checkout = await db.abandonedCheckout.findUnique({
    where: { id: checkoutId },
  });

  if (!checkout) {
    return { success: false, error: "Checkout not found" };
  }

  const accessError = await guardStoreAccess(checkout.storeDomain);
  if (accessError) {
    return { success: false, error: accessError };
  }

  const result = await stopRecoveryCall(checkout);
  revalidatePath("/dashboard/analytics");
  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard/recovery");

  return result;
}

export async function bulkStopRecoveryCallAction(
  storeDomain: string,
  checkoutIds: string[]
): Promise<{
  success: boolean;
  stopped: number;
  failed: number;
  errors: string[];
  error?: string;
}> {
  const accessError0 = await guardStoreAccess(storeDomain);
  if (accessError0) {
    return {
      success: false,
      stopped: 0,
      failed: 0,
      errors: [],
      error: accessError0,
    };
  }

  if (checkoutIds.length === 0) {
    return { success: true, stopped: 0, failed: 0, errors: [] };
  }

  const store = await db.store.findUnique({ where: { storeDomain } });
  if (!store) {
    return {
      success: false,
      stopped: 0,
      failed: 0,
      errors: [],
      error: "Store not found",
    };
  }

  const checkouts = await db.abandonedCheckout.findMany({
    where: {
      id: { in: checkoutIds },
      storeDomain,
    },
  });

  let stopped = 0;
  let failed = checkoutIds.length - checkouts.length;
  const errors: string[] = [];

  for (const checkout of checkouts) {
    if (!canStopCall(checkout.callStatus, checkout.callScheduled)) {
      failed++;
      continue;
    }

    const result = await stopRecoveryCall(checkout);
    if (result.success) {
      stopped++;
    } else {
      failed++;
      if (result.error) errors.push(result.error);
    }
  }

  revalidatePath("/dashboard/analytics");
  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard/recovery");

  return {
    success: stopped > 0,
    stopped,
    failed,
    errors,
  };
}

export async function getCallAttemptsForCheckout(
  checkoutId: string
): Promise<CallAttemptRow[]> {
  const checkout = await db.abandonedCheckout.findUnique({
    where: { id: checkoutId },
    select: { storeDomain: true },
  });
  if (!checkout) return [];

  const accessError = await guardStoreAccess(checkout.storeDomain);
  if (accessError) return [];

  const attempts = await db.callAttempt.findMany({
    where: { abandonedCheckoutId: checkoutId },
    orderBy: { startedAt: "desc" },
  });

  return attempts.map(toAttemptRow);
}

export async function getPipelineEventsForCheckout(
  checkoutId: string
): Promise<PipelineEventRow[]> {
  const checkout = await db.abandonedCheckout.findUnique({
    where: { id: checkoutId },
    select: { storeDomain: true },
  });
  if (!checkout) return [];

  const accessError = await guardStoreAccess(checkout.storeDomain);
  if (accessError) return [];

  const events = await db.callPipelineEvent.findMany({
    where: { checkoutId },
    orderBy: { startedAt: "asc" },
  });

  return events.map(toPipelineEventRow);
}

export async function getLastWebhookStatus(): Promise<WebhookDebugInfo | null> {
  const { userId } = await auth();
  if (!userId) return null;
  return getLastWebhookDebug();
}

export async function getStoreCheckoutSyncMode(
  storeDomain: string
): Promise<CheckoutSyncModeValue | null> {
  const accessError = await guardStoreAccess(storeDomain);
  if (accessError) return null;

  const store = await db.store.findUnique({
    where: { storeDomain },
    select: { checkoutSyncMode: true },
  });
  const mode = store?.checkoutSyncMode;
  return mode && isCheckoutSyncMode(mode) ? mode : null;
}

export async function updateStoreCheckoutSyncMode(
  storeDomain: string,
  mode: CheckoutSyncModeValue
): Promise<{ success: boolean; error?: string }> {
  const accessError = await guardStoreAccess(storeDomain);
  if (accessError) {
    return { success: false, error: accessError };
  }

  if (!isCheckoutSyncMode(mode)) {
    return { success: false, error: "Invalid sync mode" };
  }

  try {
    await db.store.update({
      where: { storeDomain },
      data: { checkoutSyncMode: mode as CheckoutSyncMode },
    });
    revalidatePath("/dashboard/analytics");
  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard/recovery");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update sync mode",
    };
  }
}

export async function getStoreRecoverySettings(storeDomain: string) {
  const accessError = await guardStoreAccess(storeDomain);
  if (accessError) return null;

  return db.store.findUnique({
    where: { storeDomain },
    select: {
      storeDomain: true,
      callDelayMinutes: true,
      sipConcurrency: true,
      autoCallsEnabled: true,
      checkoutSyncMode: true,
      sheetUrl: true,
      sheetSyncDirection: true,
      lastSheetSyncAt: true,
      callFeedbackSheetEnabled: true,
      callFeedbackSheetUrl: true,
      callFeedbackKeyColumn: true,
      repeatCustomerCheckEnabled: true,
      repeatCustomerWindowDays: true,
      orderPlacedCheckEnabled: true,
      ttaiScenarioId: true,
      ttaiTrunkId: true,
      ianaTimezone: true,
      ianaTimezoneOverride: true,
      callWindowEnabled: true,
      callWindowStartMinute: true,
      callWindowEndMinute: true,
      busyRetryEnabled: true,
      busyRetryDelayMinutes: true,
    },
  });
}

/**
 * Busy-retry policy. Flipping it applies retroactively: switching off settles
 * every pending busy retry as a failed call, switching on puts busy failures
 * back in the queue.
 */
export async function updateStoreBusyRetrySettings(
  storeDomain: string,
  input: { busyRetryEnabled: boolean; busyRetryDelayMinutes: number }
): Promise<{
  success: boolean;
  error?: string;
  cancelled?: number;
  rescheduled?: number;
}> {
  const accessError = await guardStoreAccess(storeDomain);
  if (accessError) {
    return { success: false, error: accessError };
  }

  const store = await db.store.findUnique({ where: { storeDomain } });
  if (!store) {
    return { success: false, error: "Store not found" };
  }

  const wasEnabled = store.busyRetryEnabled;
  const busyRetryDelayMinutes = clampBusyRetryDelayMinutes(
    input.busyRetryDelayMinutes
  );

  const updated = await db.store.update({
    where: { storeDomain },
    data: {
      busyRetryEnabled: input.busyRetryEnabled,
      busyRetryDelayMinutes,
    },
  });

  let cancelled = 0;
  let rescheduled = 0;
  if (wasEnabled && !input.busyRetryEnabled) {
    cancelled = await cancelScheduledBusyRetries(storeDomain);
  } else if (!wasEnabled && input.busyRetryEnabled) {
    rescheduled = await rescheduleBusyFailures(updated);
  }

  revalidatePath("/dashboard/recovery");
  return { success: true, cancelled, rescheduled };
}

export async function updateStoreSheetSettings(
  storeDomain: string,
  input: {
    sheetUrl: string;
    checkoutSyncMode?: CheckoutSyncModeValue;
    sheetSyncDirection?: "TOP" | "BOTTOM";
  }
): Promise<{ success: boolean; error?: string }> {
  const accessError = await guardStoreAccess(storeDomain);
  if (accessError) {
    return { success: false, error: accessError };
  }

  const sheetUrl = input.sheetUrl.trim();
  const mode = input.checkoutSyncMode;
  const sheetSyncDirection = input.sheetSyncDirection;

  if (mode && !isCheckoutSyncMode(mode)) {
    return { success: false, error: "Invalid sync mode" };
  }

  if (
    sheetSyncDirection &&
    sheetSyncDirection !== "TOP" &&
    sheetSyncDirection !== "BOTTOM"
  ) {
    return { success: false, error: "Invalid sheet sync direction" };
  }

  if (mode === CHECKOUT_SYNC_MODES.SHEET && !sheetUrl) {
    return { success: false, error: "Sheet URL is required for sheet sync mode" };
  }

  try {
    await db.store.update({
      where: { storeDomain },
      data: {
        sheetUrl,
        ...(mode ? { checkoutSyncMode: mode as CheckoutSyncMode } : {}),
        ...(sheetSyncDirection
          ? { sheetSyncDirection: sheetSyncDirection as SheetSyncDirection }
          : {}),
      },
    });
    revalidatePath("/dashboard/analytics");
  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard/recovery");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save sheet settings",
    };
  }
}

/** Feedback write-back is independent of checkoutSyncMode — a store can sync
 * checkouts from Shopify while still reviewing TTAI call feedback in a sheet.
 * Not every provider's sheet uses "request_id" as its unique column (that's
 * specific to GoKwik-sourced sheets), so the key column is configurable. When
 * enabling, the target sheet is validated to already have the key column plus
 * the fixed context columns (customer_name, customer_phone, email, address,
 * city, state, pincode, product_ids, variant_ids) — unless it's completely
 * empty, in which case the full schema is bootstrapped on first write. */
export async function updateStoreCallFeedbackSettings(
  storeDomain: string,
  input: {
    callFeedbackSheetEnabled: boolean;
    callFeedbackSheetUrl: string;
    callFeedbackKeyColumn: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const accessError = await guardStoreAccess(storeDomain);
  if (accessError) {
    return { success: false, error: accessError };
  }

  const callFeedbackSheetUrl = input.callFeedbackSheetUrl.trim();
  const callFeedbackKeyColumn =
    input.callFeedbackKeyColumn.trim() || DEFAULT_CALL_FEEDBACK_KEY_COLUMN;

  if (input.callFeedbackSheetEnabled) {
    const store = await db.store.findUnique({
      where: { storeDomain },
      select: { sheetUrl: true },
    });
    const targetSheetUrl = callFeedbackSheetUrl || store?.sheetUrl?.trim() || "";

    if (!targetSheetUrl) {
      return {
        success: false,
        error:
          "Add a feedback sheet URL (or an import sheet URL above) before enabling write-back.",
      };
    }

    try {
      const inspection = await inspectCallFeedbackSheet(
        targetSheetUrl,
        callFeedbackKeyColumn
      );
      if (!inspection.isEmpty && inspection.missingRequired.length > 0) {
        return {
          success: false,
          error: `Feedback sheet is missing required columns: ${inspection.missingRequired.join(", ")}. Add them to the sheet before enabling write-back.`,
        };
      }
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not validate the feedback sheet",
      };
    }
  }

  try {
    await db.store.update({
      where: { storeDomain },
      data: {
        callFeedbackSheetEnabled: input.callFeedbackSheetEnabled,
        callFeedbackSheetUrl,
        callFeedbackKeyColumn,
      },
    });
    revalidatePath("/dashboard/recovery");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to save call feedback sheet settings",
    };
  }
}

export async function updateStoreRepeatCustomerSettings(
  storeDomain: string,
  input: {
    repeatCustomerCheckEnabled: boolean;
    repeatCustomerWindowDays: number;
    orderPlacedCheckEnabled: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  const accessError = await guardStoreAccess(storeDomain);
  if (accessError) {
    return { success: false, error: accessError };
  }

  const windowDays = clampRepeatCustomerWindowDays(input.repeatCustomerWindowDays);

  try {
    await db.store.update({
      where: { storeDomain },
      data: {
        repeatCustomerCheckEnabled: input.repeatCustomerCheckEnabled,
        repeatCustomerWindowDays: windowDays,
        orderPlacedCheckEnabled: input.orderPlacedCheckEnabled,
      },
    });
    revalidatePath("/dashboard/recovery");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to save repeat-customer settings",
    };
  }
}

export async function updateStoreRecoverySettings(
  storeDomain: string,
  callDelayMinutes: number,
  sipConcurrency?: number,
  autoCallsEnabled?: boolean,
  window?: {
    callWindowEnabled?: boolean;
    callWindowStartMinute?: number;
    callWindowEndMinute?: number;
    ianaTimezoneOverride?: string;
  },
  enrollment?: AutoCallEnrollmentSelection
): Promise<{ success: boolean; error?: string; enrolled?: number }> {
  const accessError = await guardStoreAccess(storeDomain);
  if (accessError) {
    return { success: false, error: accessError };
  }

  if (callDelayMinutes < 1 || callDelayMinutes > 1440) {
    return {
      success: false,
      error: "Call delay must be between 1 and 1440 minutes",
    };
  }

  const concurrency = sipConcurrency ?? 1;
  if (concurrency < 1 || concurrency > 10) {
    return {
      success: false,
      error: "SIP concurrency must be between 1 and 10",
    };
  }

  const startMinute = clampWindowMinute(
    window?.callWindowStartMinute ?? DEFAULT_CALL_WINDOW_START_MINUTE,
    DEFAULT_CALL_WINDOW_START_MINUTE
  );
  const endMinute = clampWindowMinute(
    window?.callWindowEndMinute ?? DEFAULT_CALL_WINDOW_END_MINUTE,
    DEFAULT_CALL_WINDOW_END_MINUTE
  );
  if (window && startMinute >= endMinute) {
    return {
      success: false,
      error: "Call window start must be before the end time",
    };
  }

  const override = window?.ianaTimezoneOverride?.trim() ?? "";
  if (override && !isValidTimeZone(override)) {
    return { success: false, error: "Enter a valid IANA timezone" };
  }

  const existingStore = await db.store.findUnique({
    where: { storeDomain },
    select: { autoCallsEnabled: true },
  });
  if (!existingStore) {
    return { success: false, error: "Store not found" };
  }

  await db.store.update({
    where: { storeDomain },
    data: {
      callDelayMinutes,
      sipConcurrency: concurrency,
      ...(autoCallsEnabled !== undefined ? { autoCallsEnabled } : {}),
      ...(window
        ? {
            callWindowEnabled: window.callWindowEnabled ?? true,
            callWindowStartMinute: startMinute,
            callWindowEndMinute: endMinute,
            ianaTimezoneOverride: override,
          }
        : {}),
    },
  });

  let enrolled = 0;
  const turningOn = autoCallsEnabled === true && !existingStore.autoCallsEnabled;
  const turningOff = autoCallsEnabled === false && existingStore.autoCallsEnabled;
  if (turningOn) {
    enrolled = await applyAutoCallEnrollment(storeDomain, true, enrollment);
  } else if (turningOff) {
    await applyAutoCallEnrollment(storeDomain, false);
  }

  revalidatePath("/dashboard/recovery");
  return { success: true, enrolled };
}

export async function updateStoreAutoCallsEnabled(
  storeDomain: string,
  enabled: boolean,
  enrollment?: AutoCallEnrollmentSelection
): Promise<{ success: boolean; error?: string; enrolled?: number }> {
  const accessError = await guardStoreAccess(storeDomain);
  if (accessError) {
    return { success: false, error: accessError };
  }

  await db.store.update({
    where: { storeDomain },
    data: { autoCallsEnabled: enabled },
  });
  const enrolled = await applyAutoCallEnrollment(storeDomain, enabled, enrollment);

  revalidatePath("/dashboard/recovery");
  return { success: true, enrolled };
}

export async function verifyStoreShopifyAccess(
  storeDomain: string
): Promise<AdminAccessVerification> {
  const accessError = await guardStoreAccess(storeDomain);
  if (accessError) {
    return {
      ok: false,
      error: accessError,
      granted: [],
      scopesOk: false,
      pollOk: false,
    };
  }

  const store = await db.store.findUnique({ where: { storeDomain } });
  if (!store) {
    return {
      ok: false,
      error: "Store not found",
      granted: [],
      scopesOk: false,
      pollOk: false,
    };
  }

  try {
    const adminAuth = await resolveStoreAdminAccessToken(store);
    return verifyStoreAdminAccess(storeDomain, adminAuth.token);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Admin access failed",
      granted: [],
      scopesOk: false,
      pollOk: false,
    };
  }
}

export async function runAutoCallCron(): Promise<{
  stores: number;
  synced: number;
  processed: number;
  errors: number;
}> {
  const stores = await db.store.findMany({
    where: {
      OR: [
        { autoCallsEnabled: true },
        {
          checkouts: {
            some: {
              callStatus: CallStatus.PENDING,
              callScheduled: true,
            },
          },
        },
      ],
    },
  });
  let synced = 0;
  let processed = 0;
  let errors = 0;

  for (const store of stores) {
    const storeStartedAt = Date.now();
    let syncOk: boolean | null = null;

    const concurrency = Math.min(10, Math.max(1, store.sipConcurrency));
    const upcomingForToken = await db.abandonedCheckout.findMany({
      where: {
        storeDomain: store.storeDomain,
        callStatus: CallStatus.PENDING,
        callScheduled: true,
        customerPhone: { not: "" },
      },
      orderBy: { scheduledCallAt: "asc" },
      take: concurrency,
      select: { scheduledCallAt: true },
    });
    const tokenPrep = await ensureAdminTokenForUpcomingCalls(
      store,
      upcomingForToken.map((row: { scheduledCallAt: Date | null }) => row.scheduledCallAt)
    );
    console.info(
      "[process-calls] admin-token",
      JSON.stringify({
        storeDomain: store.storeDomain,
        phase: "before-sync",
        ...tokenPrep,
      })
    );

    try {
      const adminAuth = await resolveStoreAdminAccessToken(store);
      const tz = await fetchShopIanaTimezone(store.storeDomain, adminAuth.token);
      if (tz && tz !== store.ianaTimezone) {
        await db.store.update({
          where: { storeDomain: store.storeDomain },
          data: { ianaTimezone: tz },
        });
        store.ianaTimezone = tz;
      }
    } catch (tzError) {
      console.warn(
        "[process-calls] timezone refresh failed",
        tzError instanceof Error ? tzError.message : tzError
      );
    }

    if (
      store.autoCallsEnabled &&
      store.checkoutSyncMode !== CheckoutSyncMode.WEBHOOK
    ) {
      const syncResult = await syncAbandonedCheckoutsForStore(store);
      syncOk = syncResult.success;
      if (syncResult.success) synced += 1;
      else errors += 1;
    }

    const result = await processScheduledCallsForStore(store.storeDomain);
    processed += result.processed;
    errors += result.errors;

    console.info(
      "[process-calls] store",
      JSON.stringify({
        storeDomain: store.storeDomain,
        syncMode: store.checkoutSyncMode,
        synced: syncOk,
        dispatched: result.processed,
        dispatchErrors: result.errors,
        dispatchFailures: result.dispatchFailures,
        durationMs: Date.now() - storeStartedAt,
      })
    );
  }

  return { stores: stores.length, synced, processed, errors };
}
