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
import { getRepeatCustomerInfo } from "@/lib/shopify-repeat-customer";
import { findOrderPlacedAfter } from "@/lib/shopify-order-check";
import { formatDateTimeLabel } from "@/lib/utils";
import { hasBillableMinutes } from "@/lib/billing";
import { sanitizeRecoveryError } from "@/lib/recovery-error";
import { ensureAdminTokenForUpcomingCalls } from "@/lib/shopify-admin-token";
import {
  parseShippingAddressFromUserContext,
  type ShippingAddressFields,
} from "@/lib/shipping-address";
import { parseCustomerNameFromUserContext } from "@/lib/user-context";
import {
  type PipelineEventContext,
  recordPipelineEvent,
  startPipelineStep,
} from "@/lib/call-pipeline-events";
import {
  claimDueAutoCalls,
  markQueueClaimed,
  releaseClaimedCheckout,
  schedulePreCallRetry,
  sipConcurrencySlots,
} from "@/lib/call-queue";
import { reconcileStuckDispatchedCalls } from "@/lib/call-reconcile";

export type RecoveryTrigger = "manual" | "auto";

export interface RecoveryPipelineResult {
  success: boolean;
  error?: string;
  callAttemptId?: string;
  checkoutUrl?: string;
  draftOrderId?: string;
  dispatchDurationMs?: number;
  /** Set when the call was deliberately not placed (already ordered, duplicate cart). */
  skipped?: boolean;
  skipReason?: string;
}

function parseLineItems(json: Prisma.JsonValue): LineItemRecord[] {
  if (!Array.isArray(json)) return [];
  return json as unknown as LineItemRecord[];
}

function sheetContextFromUserContext(userContext: string): {
  shippingAddress?: ShippingAddressFields | null;
  customerName?: string;
} {
  if (!userContext.trim()) return {};
  let customerName: string | undefined;
  try {
    const parsed = JSON.parse(userContext) as { customer_name?: string };
    customerName = parsed.customer_name?.trim() || undefined;
  } catch {
    customerName = undefined;
  }
  return {
    shippingAddress: parseShippingAddressFromUserContext(userContext),
    customerName,
  };
}

async function markFailure(
  checkout: AbandonedCheckout & { store: Store },
  attemptId: string,
  status: CallStatus,
  stage: string,
  reason: string
) {
  const safeReason = sanitizeRecoveryError(reason);

  await db.callAttempt.update({
    where: { id: attemptId },
    data: {
      status,
      failureStage: stage,
      failureReason: safeReason,
      endedAt: new Date(),
    },
  });

  const draftReset =
    status === CallStatus.DRAFT_CREATE_FAILED
      ? { draftOrderId: "", draftOrderName: "" }
      : {};

  if (PRE_CALL_FAILURE_STATUSES.includes(status)) {
    await db.abandonedCheckout.update({
      where: { id: checkout.id },
      data: draftReset,
    });
    await schedulePreCallRetry({
      checkoutId: checkout.id,
      store: checkout.store,
      autoRetryCount: checkout.autoRetryCount,
      autoCallExcluded: checkout.autoCallExcluded,
      failureStatus: status,
      reason: safeReason,
    });
    return;
  }

  await db.abandonedCheckout.update({
    where: { id: checkout.id },
    data: {
      callStatus: status,
      lastError: safeReason,
      ...draftReset,
    },
  });
}

async function persistCheckoutError(checkoutId: string, reason: string) {
  await db.abandonedCheckout.update({
    where: { id: checkoutId },
    data: { lastError: sanitizeRecoveryError(reason) },
  });
}

function skippedResult(
  reason: string,
  dispatchDurationMs: number
): RecoveryPipelineResult {
  return { success: false, skipped: true, skipReason: reason, dispatchDurationMs };
}

/**
 * Closes a claimed row without placing the call. `autoCallExcluded` keeps
 * re-enrollment from putting it back in the queue; the row stays visible in
 * the Recovery table because its status isn't in TERMINAL_CALL_STATUSES.
 */
async function markCheckoutSkipped(
  checkoutId: string,
  status: CallStatus,
  reason: string,
  extra?: { supersededById?: string }
): Promise<void> {
  await db.abandonedCheckout.update({
    where: { id: checkoutId },
    data: {
      callStatus: status,
      callScheduled: false,
      autoCallExcluded: true,
      retryReason: null,
      lastError: reason,
      ...(extra?.supersededById ? { supersededById: extra.supersededById } : {}),
    },
  });
}

export async function runRecoveryCallPipeline(
  checkout: AbandonedCheckout & { store: Store },
  trigger: RecoveryTrigger,
  options: { preClaimed?: boolean } = {}
): Promise<RecoveryPipelineResult> {
  const pipelineStartedAt = Date.now();
  const ctx: PipelineEventContext = {
    checkoutId: checkout.id,
    storeDomain: checkout.storeDomain,
    trigger,
  };

  const validateStep = startPipelineStep(ctx, "validate");
  const phone = normalizePhoneNumber(checkout.customerPhone);
  if (!phone) {
    const error = "No valid E.164 phone number on checkout";
    await validateStep.fail(error);
    await persistCheckoutError(checkout.id, error);
    return { success: false, error, dispatchDurationMs: Date.now() - pipelineStartedAt };
  }

  if (
    !options.preClaimed &&
    (checkout.callStatus === CallStatus.DISPATCHED ||
      checkout.callStatus === CallStatus.PREPARING)
  ) {
    const error = "Call already in progress";
    await validateStep.fail(error);
    return { success: false, error, dispatchDurationMs: Date.now() - pipelineStartedAt };
  }

  if (checkout.callStatus === CallStatus.COMPLETED) {
    const error = "Checkout already recovered";
    await validateStep.fail(error);
    return { success: false, error, dispatchDurationMs: Date.now() - pipelineStartedAt };
  }

  if (checkout.store.clerkUserId) {
    const billing = await hasBillableMinutes(checkout.store.clerkUserId);
    if (!billing.allowed) {
      const error = billing.reason ?? "Insufficient call minutes";
      await validateStep.fail(error);
      await persistCheckoutError(checkout.id, error);
      return { success: false, error, dispatchDurationMs: Date.now() - pipelineStartedAt };
    }
  }
  await validateStep.succeed();

  const abandonedAt = checkout.shopifyCreatedAt ?? checkout.createdAt;

  if (checkout.store.orderPlacedCheckEnabled) {
    const orderStep = startPipelineStep(ctx, "order_check");
    const order = await findOrderPlacedAfter(checkout.store, phone, abandonedAt);
    if (order.status === "ordered") {
      const reason = `Order ${order.orderName} placed on ${formatDateTimeLabel(
        order.processedAt
      )}`;
      await orderStep.succeed({ orderName: order.orderName });
      await markCheckoutSkipped(checkout.id, CallStatus.ALREADY_PLACED_ORDER, reason);
      return skippedResult(reason, Date.now() - pipelineStartedAt);
    }
    if (order.status === "unknown") {
      // A failed lookup must never block a call.
      await orderStep.skip(`Lookup failed: ${order.reason}`);
    } else {
      await orderStep.succeed();
    }
  } else {
    await recordPipelineEvent(ctx, "order_check", "skipped", {
      detail: { reason: "Order check disabled for this store" },
    });
  }

  const attempt = await db.callAttempt.create({
    data: {
      abandonedCheckoutId: checkout.id,
      status: CallStatus.PREPARING,
      trigger,
      retryNumber: checkout.telephonyRetryCount,
      dynamicVarsJson: {},
    },
  });
  ctx.callAttemptId = attempt.id;

  await db.abandonedCheckout.update({
    where: { id: checkout.id },
    data: {
      callStatus: CallStatus.PREPARING,
      customerPhone: phone,
      retryReason: null,
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
  const shouldCreateDraft =
    hasVariants && (useSheetFlow || !hasDraftOrderId(draftOrderId));

  const draftCreateStep = startPipelineStep(ctx, "draft_create");
  try {
    if (shouldCreateDraft) {
      const draft = await createDraftOrderForStore(checkout.store, {
        lineItems,
        phone,
        checkoutToken: checkout.checkoutToken,
        shippingAddress: sheetCtx.shippingAddress,
        customerName: sheetCtx.customerName,
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
      await draftCreateStep.succeed({ draftOrderId });
    } else if (!hasDraftOrderId(draftOrderId) && !hasVariants) {
      const reason = "Line items missing variant IDs for draft order";
      await draftCreateStep.fail(reason);
      await markFailure(
        checkout,
        attempt.id,
        CallStatus.DRAFT_CREATE_FAILED,
        "draft_create",
        reason
      );
      return {
        success: false,
        error: reason,
        dispatchDurationMs: Date.now() - pipelineStartedAt,
      };
    } else {
      await draftCreateStep.skip(
        hasDraftOrderId(draftOrderId) ? "Reusing existing draft" : "Draft not required"
      );
    }
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Draft order creation failed";
    await draftCreateStep.fail(reason);
    await markFailure(
      checkout,
      attempt.id,
      CallStatus.DRAFT_CREATE_FAILED,
      "draft_create",
      reason
    );
    return { success: false, error: reason, dispatchDurationMs: Date.now() - pipelineStartedAt };
  }

  if (useSheetFlow && !hasDraftOrderId(draftOrderId)) {
    const reason = "Draft order is required before calling (sheet mode)";
    await recordPipelineEvent(ctx, "draft_create", "failed", {
      detail: { error: reason },
    });
    await markFailure(
      checkout,
      attempt.id,
      CallStatus.DRAFT_CREATE_FAILED,
      "draft_create",
      reason
    );
    return { success: false, error: reason, dispatchDurationMs: Date.now() - pipelineStartedAt };
  }

  let draftOrderContextJson = "";
  const draftFetchStep = startPipelineStep(ctx, "draft_fetch");
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
      await draftFetchStep.succeed();
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Failed to fetch draft order";
      await draftFetchStep.fail(reason);
      await markFailure(
        checkout,
        attempt.id,
        CallStatus.DRAFT_CREATE_FAILED,
        "draft_fetch",
        reason
      );
      return { success: false, error: reason, dispatchDurationMs: Date.now() - pipelineStartedAt };
    }
  } else {
    await draftFetchStep.skip("No draft order");
  }

  const cartStep = startPipelineStep(ctx, "cart_create");
  if (!useSheetFlow) {
    try {
      if (!cartId && lineItemsHaveVariantId(lineItems)) {
        const cart = await createStorefrontCart(
          checkout.storeDomain,
          checkout.store.storefrontToken,
          {
            lineItems,
            phone,
          }
        );

        if (!cart) {
          const reason = "No variant IDs available to rebuild cart";
          await cartStep.fail(reason);
          await markFailure(
            checkout,
            attempt.id,
            CallStatus.CART_CREATE_FAILED,
            "cart_create",
            reason
          );
          return {
            success: false,
            error: "Cannot create cart — no variant IDs on line items",
            dispatchDurationMs: Date.now() - pipelineStartedAt,
          };
        }

        cartId = cart.cartId;
        checkoutUrl = cart.checkoutUrl;

        await db.abandonedCheckout.update({
          where: { id: checkout.id },
          data: { cartId, checkoutUrl },
        });
        await cartStep.succeed();
      } else {
        await cartStep.skip(cartId ? "Cart already exists" : "No variant IDs");
      }
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Cart creation failed";
      await cartStep.fail(reason);
      await markFailure(
        checkout,
        attempt.id,
        CallStatus.CART_CREATE_FAILED,
        "cart_create",
        reason
      );
      return { success: false, error: reason, dispatchDurationMs: Date.now() - pipelineStartedAt };
    }
  } else {
    await cartStep.skip("Sheet flow uses draft checkout");
  }

  let orderContext = checkout.orderContext;
  let userContext = checkout.userContext;
  let relatedItems: unknown[] = Array.isArray(checkout.relatedItems)
    ? (checkout.relatedItems as unknown[])
    : [];

  const enrichStep = startPipelineStep(ctx, "uagents");
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
      await enrichStep.succeed();
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "uAgents enrichment failed";
      await enrichStep.fail(reason);
      await markFailure(
        checkout,
        attempt.id,
        CallStatus.ENRICH_FAILED,
        "uagents_enrich",
        reason
      );
      return { success: false, error: reason, dispatchDurationMs: Date.now() - pipelineStartedAt };
    }
  } else {
    await enrichStep.skip("uAgents not configured");
  }

  const scenarioId = checkout.store.ttaiScenarioId ?? "";
  const sipTrunkId = checkout.store.ttaiTrunkId ?? "";

  let isRepeatCustomer: boolean | undefined;
  const repeatStep = startPipelineStep(ctx, "repeat_customer");
  if (checkout.store.repeatCustomerCheckEnabled) {
    const repeatInfo = await getRepeatCustomerInfo(
      checkout.store,
      phone,
      checkout.store.repeatCustomerWindowDays
    );
    if (repeatInfo) {
      isRepeatCustomer = repeatInfo.isRepeatCustomer;
      await db.abandonedCheckout.update({
        where: { id: checkout.id },
        data: {
          isRepeatCustomer: repeatInfo.isRepeatCustomer,
          repeatCustomerOrderCount: repeatInfo.orderCount,
          repeatCustomerLastOrderAt: repeatInfo.lastOrderAt
            ? new Date(repeatInfo.lastOrderAt)
            : null,
        },
      });
      await repeatStep.succeed({ isRepeatCustomer });
    } else {
      await repeatStep.skip("No match or lookup failed");
    }
  } else {
    await repeatStep.skip("Repeat-customer check disabled");
  }

  const dynamicVars = buildSipDynamicVars({
    orderId: checkout.checkoutToken,
    phone,
    customerName:
      parseCustomerNameFromUserContext(userContext) || sheetCtx.customerName,
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
    voiceGreeting: checkout.store.voiceGreeting || undefined,
    voiceDiscountOffer: checkout.store.voiceDiscountOffer || undefined,
    voiceInstructions: checkout.store.voiceInstructions || undefined,
    isRepeatCustomer,
  });

  console.info(
    `[recovery] Dispatching SIP call for checkout ${checkout.id}: draftOrderId=${draftOrderId || "(none)"} phone=${phone}`
  );

  const sipStep = startPipelineStep(ctx, "sip_dispatch");
  const sipResult = await dispatchSipCall({
    phone,
    scenarioId,
    sipTrunkId,
    dynamicVars,
  });

  if (!sipResult.success) {
    const reason = sipResult.error || "SIP dispatch failed";
    await sipStep.fail(reason);
    await markFailure(
      checkout,
      attempt.id,
      CallStatus.DISPATCH_FAILED,
      "sip_dispatch",
      reason
    );
    return {
      success: false,
      error: sipResult.error,
      dispatchDurationMs: Date.now() - pipelineStartedAt,
    };
  }
  await sipStep.succeed({ callId: sipResult.callId, sessionId: sipResult.sessionId });
  await recordPipelineEvent(ctx, "sip_acked", "succeeded", {
    detail: { callId: sipResult.callId, sessionId: sipResult.sessionId },
  });

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
        autoRetryCount: 0,
      },
    }),
  ]);

  return {
    success: true,
    callAttemptId: attempt.id,
    checkoutUrl: useSheetFlow ? undefined : checkoutUrl,
    draftOrderId,
    dispatchDurationMs: Date.now() - pipelineStartedAt,
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
      data: { callScheduled: false, autoCallExcluded: true },
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

interface DispatchFailure {
  checkoutId: string;
  checkoutToken: string;
  error: string;
}

type DispatchOutcome =
  | { kind: "dispatched" }
  | { kind: "skipped"; reason: string }
  | { kind: "failed"; failure: DispatchFailure };

async function dispatchClaimedCheckout(
  checkout: AbandonedCheckout & { store: Store },
  storeDomain: string
): Promise<DispatchOutcome> {
  const ctx: PipelineEventContext = {
    checkoutId: checkout.id,
    storeDomain,
    trigger: "auto",
  };

  try {
    await recordPipelineEvent(ctx, "queued", "succeeded");
    await markQueueClaimed(checkout, "auto");

    const result = await runRecoveryCallPipeline(checkout, "auto", {
      preClaimed: true,
    });
    if (result.success) return { kind: "dispatched" };
    if (result.skipped) return { kind: "skipped", reason: result.skipReason ?? "" };

    const failure: DispatchFailure = {
      checkoutId: checkout.id,
      checkoutToken: checkout.checkoutToken,
      error: sanitizeRecoveryError(result.error ?? "Unknown dispatch failure"),
    };
    await releaseClaimedCheckout(checkout.id, failure.error);
    console.warn(
      "[process-calls] dispatch failed",
      JSON.stringify({
        storeDomain,
        ...failure,
        dispatchDurationMs: result.dispatchDurationMs,
      })
    );
    return { kind: "failed", failure };
  } catch (error) {
    const failure: DispatchFailure = {
      checkoutId: checkout.id,
      checkoutToken: checkout.checkoutToken,
      error: sanitizeRecoveryError(
        error instanceof Error ? error.message : "Dispatch threw"
      ),
    };
    await releaseClaimedCheckout(checkout.id, failure.error);
    console.error(
      "[process-calls] dispatch threw",
      JSON.stringify({ storeDomain, ...failure })
    );
    return { kind: "failed", failure };
  }
}

export async function processScheduledCallsForStore(storeDomain: string): Promise<{
  processed: number;
  skipped: number;
  errors: number;
  dispatchFailures: DispatchFailure[];
}> {
  const empty = { processed: 0, skipped: 0, errors: 0, dispatchFailures: [] };
  const store = await db.store.findUnique({ where: { storeDomain } });
  if (!store) return empty;

  // Failed dials never emit an analysis webhook, so their attempts are polled
  // and closed out here — before free slots are counted, and regardless of
  // whether auto-calls are currently on.
  const reconciled = await reconcileStuckDispatchedCalls(store);
  if (reconciled.checked > 0) {
    console.info(
      "[process-calls] reconcile",
      JSON.stringify({ storeDomain, ...reconciled })
    );
  }

  const concurrency = sipConcurrencySlots(store.sipConcurrency);
  const upcomingForToken = await db.abandonedCheckout.findMany({
    where: {
      storeDomain,
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
      storeDomain,
      ...tokenPrep,
    })
  );

  const due = await claimDueAutoCalls(store);
  if (due.length === 0) return empty;

  // The batch is already capped at the store's free concurrency slots, so every
  // claimed row is prepared and dialled in parallel instead of queueing behind
  // the previous call's Shopify round-trips.
  const batchStartedAt = Date.now();
  const outcomes = await Promise.all(
    due.map((checkout) => dispatchClaimedCheckout(checkout, storeDomain))
  );
  const dispatchFailures = outcomes
    .filter(
      (outcome): outcome is Extract<DispatchOutcome, { kind: "failed" }> =>
        outcome.kind === "failed"
    )
    .map((outcome) => outcome.failure);
  const skipped = outcomes.filter((outcome) => outcome.kind === "skipped").length;

  console.info(
    "[process-calls] batch",
    JSON.stringify({
      storeDomain,
      claimed: due.length,
      dispatched: due.length - dispatchFailures.length - skipped,
      skipped,
      batchDurationMs: Date.now() - batchStartedAt,
    })
  );

  return {
    processed: due.length - dispatchFailures.length - skipped,
    skipped,
    errors: dispatchFailures.length,
    dispatchFailures,
  };
}
