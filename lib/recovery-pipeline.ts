import { CheckoutSyncMode, Prisma, CallStatus, type AbandonedCheckout, type Store } from "@prisma/client";
import { db } from "@/lib/db";
import {
  type LineItemRecord,
  lineItemsHaveVariantId,
} from "@/lib/line-items";
import { normalizePhoneNumber } from "@/lib/phone";
import {
  createDraftOrderForStore,
  getDraftOrderContextForStore,
  hasDraftOrderId,
  serializeDraftOrderContext,
} from "@/lib/shopify-draft-orders";
import { createStorefrontCart } from "@/lib/shopify";
import { fetchUAgentsContext, isUAgentsConfigured } from "@/lib/uagents";
import { PRE_CALL_FAILURE_STATUSES } from "@/lib/call-status";
import { buildSipDynamicVars, cancelSipCall, dispatchSipCall } from "@/lib/ttai";
import {
  parseShippingAddressFromUserContext,
  type ShippingAddressFields,
} from "@/lib/shipping-address";

export type RecoveryTrigger = "manual" | "auto";

export interface RecoveryPipelineResult {
  success: boolean;
  error?: string;
  callAttemptId?: string;
  checkoutUrl?: string;
  draftOrderId?: string;
}

function parseLineItems(json: Prisma.JsonValue): LineItemRecord[] {
  if (!Array.isArray(json)) return [];
  return json as unknown as LineItemRecord[];
}

function sheetContextFromUserContext(userContext: string): {
  shippingAddress?: ShippingAddressFields | null;
} {
  if (!userContext.trim()) return {};
  return {
    shippingAddress: parseShippingAddressFromUserContext(userContext),
  };
}

async function markFailure(
  checkoutId: string,
  attemptId: string,
  status: CallStatus,
  stage: string,
  reason: string
) {
  const resetCheckout = PRE_CALL_FAILURE_STATUSES.includes(status);

  await db.$transaction([
    db.callAttempt.update({
      where: { id: attemptId },
      data: {
        status,
        failureStage: stage,
        failureReason: reason,
        endedAt: new Date(),
      },
    }),
    db.abandonedCheckout.update({
      where: { id: checkoutId },
      data: {
        callStatus: resetCheckout ? CallStatus.PENDING : status,
        lastError: reason,
        ...(status === CallStatus.DRAFT_CREATE_FAILED
          ? { draftOrderId: "", draftOrderName: "" }
          : {}),
      },
    }),
  ]);
}

export async function runRecoveryCallPipeline(
  checkout: AbandonedCheckout & { store: Store },
  trigger: RecoveryTrigger
): Promise<RecoveryPipelineResult> {
  const phone = normalizePhoneNumber(checkout.customerPhone);
  if (!phone) {
    return { success: false, error: "No valid E.164 phone number on checkout" };
  }

  if (
    checkout.callStatus === CallStatus.DISPATCHED ||
    checkout.callStatus === CallStatus.PREPARING
  ) {
    return { success: false, error: "Call already in progress" };
  }

  if (checkout.callStatus === CallStatus.COMPLETED) {
    return { success: false, error: "Checkout already recovered" };
  }

  const attempt = await db.callAttempt.create({
    data: {
      abandonedCheckoutId: checkout.id,
      status: CallStatus.PREPARING,
      trigger,
      dynamicVarsJson: {},
    },
  });

  await db.abandonedCheckout.update({
    where: { id: checkout.id },
    data: {
      callStatus: CallStatus.PREPARING,
      customerPhone: phone,
      lastError: null,
    },
  });

  const useSheetFlow = checkout.store.checkoutSyncMode === CheckoutSyncMode.SHEET;
  let cartId = checkout.cartId;
  let checkoutUrl = checkout.checkoutUrl;
  let draftOrderId = checkout.draftOrderId;
  let draftOrderName = checkout.draftOrderName;
  const lineItems = parseLineItems(checkout.lineItemsJson);
  const sheetCtx = sheetContextFromUserContext(checkout.userContext);
  const hasVariants = lineItemsHaveVariantId(lineItems);
  // Sheet flow always creates a fresh draft per call; poll/webhook reuses an existing one.
  const shouldCreateDraft =
    hasVariants && (useSheetFlow || !hasDraftOrderId(draftOrderId));

  try {
    if (shouldCreateDraft) {
      const draft = await createDraftOrderForStore(checkout.store, {
        lineItems,
        phone,
        email: checkout.customerEmail ?? undefined,
        checkoutToken: checkout.checkoutToken,
      });

      draftOrderId = draft.draftOrderId;
      draftOrderName = draft.draftOrderName;

      console.info(
        `[recovery] Draft order created for checkout ${checkout.id}: draftOrderId=${draftOrderId} draftOrderName=${draftOrderName} (before SIP dispatch)`
      );

      const saved = await db.abandonedCheckout.update({
        where: { id: checkout.id },
        data: { draftOrderId, draftOrderName },
        select: { id: true, draftOrderId: true, draftOrderName: true },
      });

      console.info(
        `[recovery] Persisted draft on AbandonedCheckout`,
        JSON.stringify(saved)
      );
    } else if (!hasDraftOrderId(draftOrderId) && !hasVariants) {
      await markFailure(
        checkout.id,
        attempt.id,
        CallStatus.DRAFT_CREATE_FAILED,
        "draft_create",
        "Line items missing variant IDs for draft order"
      );
      return {
        success: false,
        error: "Line items missing variant IDs for draft order",
      };
    }
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Draft order creation failed";
    await markFailure(
      checkout.id,
      attempt.id,
      CallStatus.DRAFT_CREATE_FAILED,
      "draft_create",
      reason
    );
    return { success: false, error: reason };
  }

  if (useSheetFlow && !hasDraftOrderId(draftOrderId)) {
    const reason = "Draft order is required before calling (sheet mode)";
    await markFailure(
      checkout.id,
      attempt.id,
      CallStatus.DRAFT_CREATE_FAILED,
      "draft_create",
      reason
    );
    return { success: false, error: reason };
  }

  let draftOrderContextJson = "";
  if (hasDraftOrderId(draftOrderId)) {
    try {
      const draftContext = await getDraftOrderContextForStore(
        checkout.store,
        draftOrderId
      );
      draftOrderContextJson = serializeDraftOrderContext(draftContext);
      if (!draftOrderName && typeof draftContext.name === "string") {
        draftOrderName = draftContext.name;
      }
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Failed to fetch draft order";
      await markFailure(
        checkout.id,
        attempt.id,
        CallStatus.DRAFT_CREATE_FAILED,
        "draft_fetch",
        reason
      );
      return { success: false, error: reason };
    }
  }

  if (!useSheetFlow) {
    try {
      if (!cartId && lineItemsHaveVariantId(lineItems)) {
        const cart = await createStorefrontCart(
          checkout.storeDomain,
          checkout.store.storefrontToken,
          {
            lineItems,
            phone,
            email: checkout.customerEmail ?? undefined,
          }
        );

        if (!cart) {
          await markFailure(
            checkout.id,
            attempt.id,
            CallStatus.CART_CREATE_FAILED,
            "cart_create",
            "No variant IDs available to rebuild cart"
          );
          return {
            success: false,
            error: "Cannot create cart — no variant IDs on line items",
          };
        }

        cartId = cart.cartId;
        checkoutUrl = cart.checkoutUrl;

        await db.abandonedCheckout.update({
          where: { id: checkout.id },
          data: { cartId, checkoutUrl },
        });
      }
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Cart creation failed";
      await markFailure(
        checkout.id,
        attempt.id,
        CallStatus.CART_CREATE_FAILED,
        "cart_create",
        reason
      );
      return { success: false, error: reason };
    }
  }

  let orderContext = checkout.orderContext;
  let userContext = checkout.userContext;
  let relatedItems: unknown[] = Array.isArray(checkout.relatedItems)
    ? (checkout.relatedItems as unknown[])
    : [];

  if (isUAgentsConfigured()) {
    try {
      const enriched = await fetchUAgentsContext(checkout.checkoutToken, phone);
      orderContext = enriched.order_context || orderContext;
      userContext = enriched.user_context || userContext;
      relatedItems = enriched.related_items ?? relatedItems;

      await db.abandonedCheckout.update({
        where: { id: checkout.id },
        data: {
          orderContext,
          userContext,
          relatedItems: relatedItems as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "uAgents enrichment failed";
      await markFailure(
        checkout.id,
        attempt.id,
        CallStatus.ENRICH_FAILED,
        "uagents_enrich",
        reason
      );
      return { success: false, error: reason };
    }
  }

  const scenarioId = checkout.store.ttaiScenarioId ?? "";
  const sipTrunkId = checkout.store.ttaiTrunkId ?? "";

  const dynamicVars = buildSipDynamicVars({
    orderId: checkout.checkoutToken,
    phone,
    abandonedTs: checkout.shopifyCreatedAt?.toISOString() ?? "",
    cartValue: checkout.cartValue,
    orderContext,
    userContext,
    relatedItems,
    cartId: useSheetFlow ? undefined : cartId,
    checkoutUrl: useSheetFlow ? undefined : checkoutUrl,
    draftOrderId,
    draftOrderName,
    draftOrderContext: draftOrderContextJson || undefined,
    shippingAddress: sheetCtx.shippingAddress,
  });

  console.info(
    `[recovery] Dispatching SIP call for checkout ${checkout.id}: draftOrderId=${draftOrderId || "(none)"} phone=${phone}`
  );

  const sipResult = await dispatchSipCall({
    phone,
    scenarioId,
    sipTrunkId,
    dynamicVars,
  });

  if (!sipResult.success) {
    await markFailure(
      checkout.id,
      attempt.id,
      CallStatus.DISPATCH_FAILED,
      "sip_dispatch",
      sipResult.error || "SIP dispatch failed"
    );
    return { success: false, error: sipResult.error };
  }

  await db.$transaction([
    db.callAttempt.update({
      where: { id: attempt.id },
      data: {
        status: CallStatus.DISPATCHED,
        callId: sipResult.callId,
        sessionId: sipResult.sessionId,
        dynamicVarsJson: dynamicVars as unknown as Prisma.InputJsonValue,
      },
    }),
    db.abandonedCheckout.update({
      where: { id: checkout.id },
      data: {
        callStatus: CallStatus.DISPATCHED,
        callScheduled: true,
        sessionId: sipResult.sessionId ?? checkout.sessionId,
        lastError: null,
      },
    }),
  ]);

  return {
    success: true,
    callAttemptId: attempt.id,
    checkoutUrl: useSheetFlow ? undefined : checkoutUrl,
    draftOrderId,
  };
}

export async function stopRecoveryCall(
  checkout: AbandonedCheckout
): Promise<{ success: boolean; error?: string }> {
  if (
    checkout.callStatus === CallStatus.PENDING &&
    checkout.callScheduled
  ) {
    await db.abandonedCheckout.update({
      where: { id: checkout.id },
      data: { callScheduled: false },
    });
    return { success: true };
  }

  if (
    checkout.callStatus !== CallStatus.PREPARING &&
    checkout.callStatus !== CallStatus.DISPATCHED
  ) {
    return { success: false, error: "No active call to stop" };
  }

  const attempt = await db.callAttempt.findFirst({
    where: {
      abandonedCheckoutId: checkout.id,
      status: { in: [CallStatus.PREPARING, CallStatus.DISPATCHED] },
    },
    orderBy: { startedAt: "desc" },
  });

  if (attempt?.callId) {
    const cancel = await cancelSipCall(attempt.callId);
    if (!cancel.success) {
      console.warn(
        "TTAI cancel call failed — marking stopped locally",
        cancel.error
      );
    }
  }

  const endedAt = new Date();
  const reason = "Stopped by user";

  await db.$transaction([
    ...(attempt
      ? [
          db.callAttempt.update({
            where: { id: attempt.id },
            data: {
              status: CallStatus.HANG_UP,
              failureStage: "user_stop",
              failureReason: reason,
              endedAt,
            },
          }),
        ]
      : []),
    db.abandonedCheckout.update({
      where: { id: checkout.id },
      data: {
        callStatus: CallStatus.HANG_UP,
        lastError: reason,
      },
    }),
  ]);

  return { success: true };
}

export async function processScheduledCallsForStore(storeDomain: string): Promise<{
  processed: number;
  errors: number;
}> {
  const store = await db.store.findUnique({ where: { storeDomain } });
  if (!store) return { processed: 0, errors: 0 };

  const inFlight = await db.abandonedCheckout.count({
    where: {
      storeDomain,
      callStatus: { in: [CallStatus.PREPARING, CallStatus.DISPATCHED] },
    },
  });

  const slots = Math.max(0, store.sipConcurrency - inFlight);
  if (slots === 0) return { processed: 0, errors: 0 };

  const due = await db.abandonedCheckout.findMany({
    where: {
      storeDomain,
      callStatus: CallStatus.PENDING,
      callScheduled: true,
      customerPhone: { not: "" },
      scheduledCallAt: { lte: new Date() },
    },
    orderBy: { scheduledCallAt: "asc" },
    take: slots,
    include: { store: true },
  });

  let processed = 0;
  let errors = 0;

  for (const checkout of due) {
    const result = await runRecoveryCallPipeline(checkout, "auto");
    if (result.success) processed++;
    else errors++;
  }

  return { processed, errors };
}
