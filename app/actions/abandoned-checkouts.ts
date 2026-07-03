"use server";

import { auth } from "@clerk/nextjs/server";
import { CallStatus, CheckoutSyncMode, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { PRE_CALL_FAILURE_STATUSES } from "@/lib/call-status";
import {
  type CheckoutSyncModeValue,
  isCheckoutSyncMode,
  CHECKOUT_SYNC_MODES,
} from "@/lib/checkout-sync-mode";
import { getLastWebhookDebug, type WebhookDebugInfo } from "@/lib/store-domain";
import { db } from "@/lib/db";
import { runRecoveryCallPipeline, processScheduledCallsForStore, stopRecoveryCall } from "@/lib/recovery-pipeline";
import {
  ABANDONED_CHECKOUTS_PAGE_SIZE,
  checkoutTokenFromNode,
  extractCheckoutPhone,
  fetchGrantedAdminScopes,
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
  getCachedAdminTokenInfo,
  resolveStoreAdminAccessToken,
} from "@/lib/shopify-admin-token";
import { canStopCall } from "@/lib/call-status";
import { syncAbandonedCheckoutsFromSheet } from "@/lib/sheet-sync";

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
  callScheduled: boolean;
  scheduledCallAt: string | null;
  shopifyCreatedAt: string | null;
  callStatus: CallStatus;
  lastError: string | null;
  sessionId: string | null;
  storeDomain: string;
  latestAttempt: CallAttemptRow | null;
}

export interface SyncResult {
  success: boolean;
  checkouts: AbandonedCheckoutRow[];
  syncedAt: string;
  syncMode?: "graphql" | "rest" | "webhook-only" | "sheet";
  warning?: string;
  autoCalls?: { processed: number; errors: number };
  adminTokenSource?: string;
  adminTokenExpiresInSec?: number | null;
  pageSize?: number;
  page?: number;
  hasMore?: boolean;
  totalCount?: number;
  shopifyPageInfo?: AbandonedCheckoutsPageInfo;
  error?: string;
}

export interface PaginatedCheckoutsResult {
  success: boolean;
  checkouts: AbandonedCheckoutRow[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  totalCount: number;
  error?: string;
}

export interface SyncOptions {
  shopifyAfter?: string | null;
  dbPage?: number;
}

function toAttemptRow(
  a: NonNullable<Awaited<ReturnType<typeof db.callAttempt.findFirst>>>
): CallAttemptRow {
  return {
    id: a.id,
    callId: a.callId,
    sessionId: a.sessionId,
    status: a.status,
    failureStage: a.failureStage,
    failureReason: a.failureReason,
    transcript: a.transcript,
    toolCallsJson: a.toolCallsJson,
    trigger: a.trigger,
    startedAt: a.startedAt.toISOString(),
    endedAt: a.endedAt?.toISOString() ?? null,
    durationSec: a.durationSec,
  };
}

function toRow(
  c: Awaited<ReturnType<typeof db.abandonedCheckout.findMany>>[number] & {
    callAttempts?: Awaited<ReturnType<typeof db.callAttempt.findMany>>;
  }
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
    callScheduled: c.callScheduled,
    scheduledCallAt: c.scheduledCallAt?.toISOString() ?? null,
    shopifyCreatedAt: c.shopifyCreatedAt?.toISOString() ?? null,
    callStatus: c.callStatus,
    lastError: c.lastError,
    sessionId: c.sessionId,
    storeDomain: c.storeDomain,
    latestAttempt: latest ? toAttemptRow(latest) : null,
  };
}

async function fetchOpenCheckouts(storeDomain: string, page = 0) {
  await db.abandonedCheckout.updateMany({
    where: {
      storeDomain,
      callStatus: { in: PRE_CALL_FAILURE_STATUSES },
    },
    data: { callStatus: CallStatus.PENDING },
  });

  const pageSize = ABANDONED_CHECKOUTS_PAGE_SIZE;
  const skip = page * pageSize;
  const where = {
    storeDomain,
    callStatus: { notIn: [...TERMINAL_CALL_STATUSES] },
  };

  const [checkouts, totalCount] = await Promise.all([
    db.abandonedCheckout.findMany({
      where,
      orderBy: [{ scheduledCallAt: "asc" }, { shopifyCreatedAt: "desc" }],
      skip,
      take: pageSize,
      include: {
        callAttempts: { orderBy: { startedAt: "desc" }, take: 1 },
      },
    }),
    db.abandonedCheckout.count({ where }),
  ]);

  return {
    checkouts: checkouts.map(toRow),
    page,
    pageSize,
    hasMore: skip + checkouts.length < totalCount,
    totalCount,
  };
}

export async function getAbandonedCheckoutsForStore(
  storeDomain: string,
  page = 0
): Promise<PaginatedCheckoutsResult> {
  const { userId } = await auth();
  if (!userId) {
    return {
      success: false,
      checkouts: [],
      page,
      pageSize: ABANDONED_CHECKOUTS_PAGE_SIZE,
      hasMore: false,
      totalCount: 0,
      error: "Unauthorized",
    };
  }

  const store = await db.store.findUnique({ where: { storeDomain } });
  if (!store) {
    return {
      success: false,
      checkouts: [],
      page,
      pageSize: ABANDONED_CHECKOUTS_PAGE_SIZE,
      hasMore: false,
      totalCount: 0,
      error: "Store not found",
    };
  }

  const result = await fetchOpenCheckouts(storeDomain, page);
  return { success: true, ...result };
}

export async function syncAbandonedCheckouts(
  storeDomain: string,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const { userId } = await auth();
  if (!userId) {
    return {
      success: false,
      checkouts: [],
      syncedAt: new Date().toISOString(),
      error: "Unauthorized",
    };
  }

  const store = await db.store.findUnique({ where: { storeDomain } });
  if (!store) {
    return {
      success: false,
      checkouts: [],
      syncedAt: new Date().toISOString(),
      error: "Store not found",
    };
  }

  try {
    if (store.checkoutSyncMode === CheckoutSyncMode.SHEET) {
      const sheetResult = await syncAbandonedCheckoutsFromSheet(store);
      const autoCalls = await processScheduledCallsForStore(storeDomain);
      const dbPage = options.dbPage ?? 0;
      const pageResult = await fetchOpenCheckouts(storeDomain, dbPage);

      console.info(
        "[sheet] abandoned checkouts synced",
        JSON.stringify({
          storeDomain,
          synced: sheetResult.synced,
          skipped: sheetResult.skipped,
        })
      );

      return {
        success: true,
        checkouts: pageResult.checkouts,
        syncedAt: new Date().toISOString(),
        syncMode: "sheet",
        warning:
          sheetResult.skipped > 0
            ? `${sheetResult.skipped} sheet row(s) skipped (missing variant IDs).`
            : undefined,
        autoCalls,
        pageSize: pageResult.pageSize,
        page: pageResult.page,
        hasMore: pageResult.hasMore,
        totalCount: pageResult.totalCount,
      };
    }

    let shopifyNodes: Awaited<
      ReturnType<typeof fetchShopifyAbandonedCheckouts>
    >["nodes"] = [];
    let shopifyPageInfo: AbandonedCheckoutsPageInfo | undefined;
    let syncMode: SyncResult["syncMode"] = "graphql";
    let warning: string | undefined;

    try {
      const adminAuth = await resolveStoreAdminAccessToken(store);
      const shopifyPage = await fetchShopifyAbandonedCheckouts(
        storeDomain,
        adminAuth.token,
        {
          first: ABANDONED_CHECKOUTS_PAGE_SIZE,
          after: options.shopifyAfter,
        }
      );
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

    for (const node of shopifyNodes) {
      const checkoutToken = checkoutTokenFromNode(node);
      const phone = extractCheckoutPhone(node);
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
        store.callDelayMinutes
      );

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
            ...(unarchivedInShopify
              ? {
                  callStatus: CallStatus.PENDING,
                  lastError: null,
                  callScheduled: Boolean(phone && scheduledCallAt),
                }
              : {
                  callScheduled:
                    existing.callScheduled ||
                    Boolean(phone && scheduledCallAt),
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
            callScheduled: Boolean(phone),
            callStatus: CallStatus.PENDING,
            storeDomain,
          },
        });
      }
    }

    const autoCalls = await processScheduledCallsForStore(storeDomain);
    const dbPage = options.dbPage ?? 0;
    const pageResult = await fetchOpenCheckouts(storeDomain, dbPage);
    const tokenCache = getCachedAdminTokenInfo(storeDomain);

    return {
      success: true,
      checkouts: pageResult.checkouts,
      syncedAt: new Date().toISOString(),
      syncMode,
      warning,
      autoCalls,
      adminTokenSource: tokenCache.cached ? "cache" : undefined,
      adminTokenExpiresInSec: tokenCache.expiresInSec,
      pageSize: pageResult.pageSize,
      page: pageResult.page,
      hasMore: pageResult.hasMore,
      totalCount: pageResult.totalCount,
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

export async function initiateRecoveryCall(
  checkoutId: string
): Promise<{
  success: boolean;
  error?: string;
  checkoutUrl?: string;
  draftOrderId?: string;
}> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  const checkout = await db.abandonedCheckout.findUnique({
    where: { id: checkoutId },
    include: { store: true },
  });

  if (!checkout) {
    return { success: false, error: "Checkout not found" };
  }

  if (!isRetryableStatus(checkout.callStatus)) {
    return { success: false, error: "Call cannot be retried for this checkout" };
  }

  if (checkout.callStatus !== CallStatus.PENDING) {
    await db.abandonedCheckout.update({
      where: { id: checkoutId },
      data: { callStatus: CallStatus.PENDING, lastError: null },
    });
  }

  const fresh = await db.abandonedCheckout.findUnique({
    where: { id: checkoutId },
    include: { store: true },
  });

  if (!fresh) {
    return { success: false, error: "Checkout not found" };
  }

  const result = await runRecoveryCallPipeline(fresh, "manual");
  revalidatePath("/dashboard/analytics");
  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard/recovery");

  return {
    success: result.success,
    error: result.error,
    checkoutUrl: result.checkoutUrl,
    draftOrderId: result.draftOrderId,
  };
}

export async function stopRecoveryCallAction(
  checkoutId: string
): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  const checkout = await db.abandonedCheckout.findUnique({
    where: { id: checkoutId },
  });

  if (!checkout) {
    return { success: false, error: "Checkout not found" };
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
  const { userId } = await auth();
  if (!userId) {
    return {
      success: false,
      stopped: 0,
      failed: 0,
      errors: [],
      error: "Unauthorized",
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
  const { userId } = await auth();
  if (!userId) return [];

  const attempts = await db.callAttempt.findMany({
    where: { abandonedCheckoutId: checkoutId },
    orderBy: { startedAt: "desc" },
  });

  return attempts.map(toAttemptRow);
}

export async function getLastWebhookStatus(): Promise<WebhookDebugInfo | null> {
  const { userId } = await auth();
  if (!userId) return null;
  return getLastWebhookDebug();
}

export async function getStoreCheckoutSyncMode(
  storeDomain: string
): Promise<CheckoutSyncModeValue | null> {
  const { userId } = await auth();
  if (!userId) return null;

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
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
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
  const { userId } = await auth();
  if (!userId) return null;

  return db.store.findUnique({
    where: { storeDomain },
    select: {
      storeDomain: true,
      callDelayMinutes: true,
      sipConcurrency: true,
      checkoutSyncMode: true,
      sheetUrl: true,
      lastSheetSyncAt: true,
      ttaiScenarioId: true,
      ttaiTrunkId: true,
    },
  });
}

export async function updateStoreSheetSettings(
  storeDomain: string,
  input: { sheetUrl: string; checkoutSyncMode?: CheckoutSyncModeValue }
): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  const sheetUrl = input.sheetUrl.trim();
  const mode = input.checkoutSyncMode;

  if (mode && !isCheckoutSyncMode(mode)) {
    return { success: false, error: "Invalid sync mode" };
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

export async function updateStoreRecoverySettings(
  storeDomain: string,
  callDelayMinutes: number,
  sipConcurrency?: number
): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
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

  await db.store.update({
    where: { storeDomain },
    data: { callDelayMinutes, sipConcurrency: concurrency },
  });

  revalidatePath("/dashboard/analytics");
  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard/recovery");
  return { success: true };
}

export async function verifyStoreShopifyAccess(
  storeDomain: string
): Promise<AdminAccessVerification> {
  const { userId } = await auth();
  if (!userId) {
    return {
      ok: false,
      error: "Unauthorized",
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
  processed: number;
  errors: number;
}> {
  const stores = await db.store.findMany({ select: { storeDomain: true } });
  let processed = 0;
  let errors = 0;

  for (const store of stores) {
    const result = await processScheduledCallsForStore(store.storeDomain);
    processed += result.processed;
    errors += result.errors;
  }

  return { stores: stores.length, processed, errors };
}
