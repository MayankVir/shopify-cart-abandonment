import { CallStatus, Prisma, type NdrcOrder, type Store } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizePhoneNumber } from "@/lib/phone";
import { parseShippingAddressFromUserContext } from "@/lib/shipping-address";
import { buildNdrcSipDynamicVars, cancelSipCall, dispatchSipCall } from "@/lib/ttai";

export type NdrcTrigger = "manual";

export interface NdrcPipelineResult {
  success: boolean;
  error?: string;
  callAttemptId?: string;
}

async function markFailure(
  orderId: string,
  attemptId: string,
  status: CallStatus,
  stage: string,
  reason: string
) {
  await db.$transaction([
    db.ndrcCallAttempt.update({
      where: { id: attemptId },
      data: {
        status,
        failureStage: stage,
        failureReason: reason,
        endedAt: new Date(),
      },
    }),
    db.ndrcOrder.update({
      where: { id: orderId },
      data: { callStatus: status, lastError: reason },
    }),
  ]);
}

export async function runNdrcCallPipeline(
  order: NdrcOrder & { store: Store },
  trigger: NdrcTrigger
): Promise<NdrcPipelineResult> {
  const phone = normalizePhoneNumber(order.customerPhone);
  if (!phone) {
    return { success: false, error: "No valid E.164 phone number on order" };
  }

  if (
    order.callStatus === CallStatus.DISPATCHED ||
    order.callStatus === CallStatus.PREPARING
  ) {
    return { success: false, error: "Call already in progress" };
  }

  if (order.callStatus === CallStatus.COMPLETED) {
    return { success: false, error: "Order already confirmed" };
  }

  const attempt = await db.ndrcCallAttempt.create({
    data: {
      ndrcOrderId: order.id,
      status: CallStatus.PREPARING,
      trigger,
      dynamicVarsJson: {},
    },
  });

  await db.ndrcOrder.update({
    where: { id: order.id },
    data: { callStatus: CallStatus.PREPARING, customerPhone: phone, lastError: null },
  });

  const scenarioId = order.store.ndrcTtaiScenarioId || order.store.ttaiScenarioId || "";
  const sipTrunkId = order.store.ndrcTtaiTrunkId || order.store.ttaiTrunkId || "";
  const shippingAddress = parseShippingAddressFromUserContext(order.userContext);

  const dynamicVars = buildNdrcSipDynamicVars({
    orderId: order.orderId,
    phone,
    orderValue: order.orderValue,
    attempts: order.attempts,
    courierName: order.courierName || undefined,
    awbNumber: order.awbNumber || undefined,
    shippingAddress,
  });

  const sipResult = await dispatchSipCall({
    phone,
    scenarioId,
    sipTrunkId,
    dynamicVars,
  });

  if (!sipResult.success) {
    await markFailure(
      order.id,
      attempt.id,
      CallStatus.DISPATCH_FAILED,
      "sip_dispatch",
      sipResult.error || "SIP dispatch failed"
    );
    return { success: false, error: sipResult.error };
  }

  await db.$transaction([
    db.ndrcCallAttempt.update({
      where: { id: attempt.id },
      data: {
        status: CallStatus.DISPATCHED,
        callId: sipResult.callId,
        sessionId: sipResult.sessionId,
        dynamicVarsJson: dynamicVars as unknown as Prisma.InputJsonValue,
      },
    }),
    db.ndrcOrder.update({
      where: { id: order.id },
      data: {
        callStatus: CallStatus.DISPATCHED,
        sessionId: sipResult.sessionId ?? order.sessionId,
        lastError: null,
      },
    }),
  ]);

  return { success: true, callAttemptId: attempt.id };
}

export async function stopNdrcCall(
  order: NdrcOrder
): Promise<{ success: boolean; error?: string }> {
  if (
    order.callStatus !== CallStatus.PREPARING &&
    order.callStatus !== CallStatus.DISPATCHED
  ) {
    return { success: false, error: "No active call to stop" };
  }

  const attempt = await db.ndrcCallAttempt.findFirst({
    where: {
      ndrcOrderId: order.id,
      status: { in: [CallStatus.PREPARING, CallStatus.DISPATCHED] },
    },
    orderBy: { startedAt: "desc" },
  });

  if (attempt?.callId) {
    const cancel = await cancelSipCall(attempt.callId);
    if (!cancel.success) {
      console.warn("TTAI cancel call failed — marking stopped locally", cancel.error);
    }
  }

  const endedAt = new Date();
  const reason = "Stopped by user";

  await db.$transaction([
    ...(attempt
      ? [
          db.ndrcCallAttempt.update({
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
    db.ndrcOrder.update({
      where: { id: order.id },
      data: { callStatus: CallStatus.HANG_UP, lastError: reason },
    }),
  ]);

  return { success: true };
}
