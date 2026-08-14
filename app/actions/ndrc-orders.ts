"use server";

import { auth } from "@clerk/nextjs/server";
import { CallStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { canInitiateCall } from "@/lib/call-status";
import { runNdrcCallPipeline, stopNdrcCall } from "@/lib/ndrc-pipeline";
import { syncNdrcOrdersFromSheet } from "@/lib/ndrc-sheet-sync";
import { formatShippingAddressFromUserContext } from "@/lib/shipping-address";

const NDRC_PAGE_SIZE = 25;

export interface NdrcCallAttemptRow {
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

export interface NdrcOrderRow {
  id: string;
  orderId: string;
  customerPhone: string;
  customerEmail: string | null;
  orderValue: number;
  attempts: number;
  courierName: string;
  awbNumber: string;
  address: string;
  callStatus: CallStatus;
  lastError: string | null;
  sessionId: string | null;
  storeDomain: string;
  latestAttempt: NdrcCallAttemptRow | null;
}

export interface NdrcSyncResult {
  success: boolean;
  orders: NdrcOrderRow[];
  syncedAt: string;
  warning?: string;
  totalCount?: number;
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
  error?: string;
}

export interface PaginatedNdrcOrdersResult {
  success: boolean;
  orders: NdrcOrderRow[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  totalCount: number;
  error?: string;
}

function toAttemptRow(
  a: NonNullable<Awaited<ReturnType<typeof db.ndrcCallAttempt.findFirst>>>
): NdrcCallAttemptRow {
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
  o: Awaited<ReturnType<typeof db.ndrcOrder.findMany>>[number] & {
    callAttempts?: Awaited<ReturnType<typeof db.ndrcCallAttempt.findMany>>;
  }
): NdrcOrderRow {
  const latest = o.callAttempts?.[0];
  return {
    id: o.id,
    orderId: o.orderId,
    customerPhone: o.customerPhone,
    customerEmail: o.customerEmail,
    orderValue: o.orderValue,
    attempts: o.attempts,
    courierName: o.courierName,
    awbNumber: o.awbNumber,
    address: formatShippingAddressFromUserContext(o.userContext),
    callStatus: o.callStatus,
    lastError: o.lastError,
    sessionId: o.sessionId,
    storeDomain: o.storeDomain,
    latestAttempt: latest ? toAttemptRow(latest) : null,
  };
}

async function fetchNdrcOrders(storeDomain: string, page = 0, pageSize = NDRC_PAGE_SIZE) {
  // Auto-recover pre-call failures back to PENDING so they can be retried, same as recovery.
  await db.ndrcOrder.updateMany({
    where: { storeDomain, callStatus: CallStatus.DISPATCH_FAILED },
    data: { callStatus: CallStatus.PENDING },
  });

  const skip = page * pageSize;
  const where = { storeDomain };

  const [orders, totalCount] = await Promise.all([
    db.ndrcOrder.findMany({
      where,
      orderBy: [{ attempts: "desc" }, { createdAt: "desc" }],
      skip,
      take: pageSize,
      include: { callAttempts: { orderBy: { startedAt: "desc" }, take: 1 } },
    }),
    db.ndrcOrder.count({ where }),
  ]);

  return {
    orders: orders.map(toRow),
    page,
    pageSize,
    hasMore: skip + orders.length < totalCount,
    totalCount,
  };
}

export async function getNdrcOrdersForStore(
  storeDomain: string,
  page = 0
): Promise<PaginatedNdrcOrdersResult> {
  const { userId } = await auth();
  if (!userId) {
    return {
      success: false,
      orders: [],
      page,
      pageSize: NDRC_PAGE_SIZE,
      hasMore: false,
      totalCount: 0,
      error: "Unauthorized",
    };
  }

  const store = await db.store.findUnique({ where: { storeDomain } });
  if (!store) {
    return {
      success: false,
      orders: [],
      page,
      pageSize: NDRC_PAGE_SIZE,
      hasMore: false,
      totalCount: 0,
      error: "Store not found",
    };
  }

  const result = await fetchNdrcOrders(storeDomain, page);
  return { success: true, ...result };
}

export async function syncNdrcOrders(storeDomain: string): Promise<NdrcSyncResult> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, orders: [], syncedAt: new Date().toISOString(), error: "Unauthorized" };
  }

  const store = await db.store.findUnique({ where: { storeDomain } });
  if (!store) {
    return { success: false, orders: [], syncedAt: new Date().toISOString(), error: "Store not found" };
  }

  try {
    const sheetResult = await syncNdrcOrdersFromSheet(store);
    const pageResult = await fetchNdrcOrders(storeDomain, 0);

    console.info(
      "[ndrc] sheet synced",
      JSON.stringify({ storeDomain, ...sheetResult })
    );

    const warnings: string[] = [];
    if (sheetResult.skippedLowAttempts > 0) {
      warnings.push(
        `${sheetResult.skippedLowAttempts} row(s) skipped (fewer than ${store.ndrcMinAttempts} delivery attempt${store.ndrcMinAttempts === 1 ? "" : "s"}).`
      );
    }
    if (sheetResult.skippedInvalid > 0) {
      warnings.push(
        `${sheetResult.skippedInvalid} row(s) skipped (missing order id or valid phone number).`
      );
    }

    return {
      success: true,
      orders: pageResult.orders,
      syncedAt: new Date().toISOString(),
      warning: warnings.length > 0 ? warnings.join(" ") : undefined,
      totalCount: pageResult.totalCount,
      page: pageResult.page,
      pageSize: pageResult.pageSize,
      hasMore: pageResult.hasMore,
    };
  } catch (error) {
    console.error("Sync NDRC orders failed:", error);
    return {
      success: false,
      orders: [],
      syncedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Sync failed",
    };
  }
}

export async function initiateNdrcCall(
  orderId: string
): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const order = await db.ndrcOrder.findUnique({
    where: { id: orderId },
    include: { store: true },
  });
  if (!order) return { success: false, error: "Order not found" };

  if (!canInitiateCall(order.callStatus)) {
    return { success: false, error: "Call cannot be started for this order" };
  }

  const result = await runNdrcCallPipeline(order, "manual");
  revalidatePath("/dashboard/ndrc");

  return { success: result.success, error: result.error };
}

export async function stopNdrcCallAction(
  orderId: string
): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const order = await db.ndrcOrder.findUnique({ where: { id: orderId } });
  if (!order) return { success: false, error: "Order not found" };

  const result = await stopNdrcCall(order);
  revalidatePath("/dashboard/ndrc");

  return result;
}

export async function getNdrcCallAttempts(orderId: string): Promise<NdrcCallAttemptRow[]> {
  const { userId } = await auth();
  if (!userId) return [];

  const attempts = await db.ndrcCallAttempt.findMany({
    where: { ndrcOrderId: orderId },
    orderBy: { startedAt: "desc" },
  });

  return attempts.map(toAttemptRow);
}

export async function getStoreNdrcSettings(storeDomain: string) {
  const { userId } = await auth();
  if (!userId) return null;

  return db.store.findUnique({
    where: { storeDomain },
    select: {
      storeDomain: true,
      ndrcSheetUrl: true,
      ndrcMinAttempts: true,
      ndrcTtaiScenarioId: true,
      ndrcTtaiTrunkId: true,
      ttaiScenarioId: true,
      ttaiTrunkId: true,
      lastNdrcSheetSyncAt: true,
    },
  });
}

export async function updateStoreNdrcSettings(
  storeDomain: string,
  input: { ndrcSheetUrl: string; ndrcMinAttempts: number }
): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const ndrcSheetUrl = input.ndrcSheetUrl.trim();
  const ndrcMinAttempts = Number(input.ndrcMinAttempts);

  if (!Number.isFinite(ndrcMinAttempts) || ndrcMinAttempts < 1 || ndrcMinAttempts > 20) {
    return { success: false, error: "Min attempts must be between 1 and 20" };
  }

  try {
    await db.store.update({
      where: { storeDomain },
      data: { ndrcSheetUrl, ndrcMinAttempts },
    });
    revalidatePath("/dashboard/ndrc");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save NDRC settings",
    };
  }
}

