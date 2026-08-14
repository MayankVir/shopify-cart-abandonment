import { Webhooks } from "@dodopayments/nextjs";
import { NextResponse } from "next/server";
import {
  fulfillTopUpFromPayment,
  resolveTopUpIdFromPayment,
} from "@/lib/billing";

const webhookKey = process.env.DODO_PAYMENTS_WEBHOOK_KEY ?? "";

function readMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export const POST = webhookKey
  ? Webhooks({
      webhookKey,
      onPayload: async (payload) => {
        if (payload.type !== "payment.succeeded") {
          console.info("[dodo-webhook]", payload.type);
          return;
        }

        const data = payload.data as {
          payment_id?: string;
          total_amount?: number;
          metadata?: Record<string, unknown>;
        };

        const paymentId = data.payment_id;
        if (!paymentId) {
          console.warn("[dodo-webhook] payment.succeeded missing payment_id");
          return;
        }

        let topUpId = readMetadataString(data.metadata, "top_up_id");
        let amountCents = data.total_amount;

        if (!topUpId) {
          const resolved = await resolveTopUpIdFromPayment(paymentId);
          topUpId = resolved.topUpId;
          amountCents = resolved.amountCents ?? amountCents;
        }

        if (!topUpId) {
          console.warn("[dodo-webhook] could not resolve top_up_id", paymentId);
          return;
        }

        const fulfilled = await fulfillTopUpFromPayment({
          paymentId,
          topUpId,
          amountCents,
        });

        console.info("[dodo-webhook] payment.succeeded", {
          paymentId,
          topUpId,
          fulfilled,
        });
      },
    })
  : async () =>
      NextResponse.json(
        { error: "Dodo webhook key not configured" },
        { status: 503 }
      );
