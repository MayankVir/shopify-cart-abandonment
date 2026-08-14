import { currentUser } from "@clerk/nextjs/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getBillingConfig } from "@/lib/billing-config";
import { getDodoClient } from "@/lib/dodopayments";
import {
  getAppUrl,
  getDodoTopUpProductId,
  isDodoConfigured,
} from "@/lib/dodo-env";

export interface MerchantBillingStatus {
  clerkUserId: string;
  email: string | null;
  dodoCustomerId: string | null;
  creditBalanceMinutes: number;
  freeMinutesGranted: boolean;
}

function toNumber(value: Prisma.Decimal | number): number {
  return typeof value === "number" ? value : Number(value);
}

export async function ensureMerchantForUser(
  clerkUserId: string,
  email?: string | null
) {
  const existing = await db.merchant.findUnique({
    where: { clerkUserId },
  });

  if (existing) {
    if (email && existing.email !== email) {
      return db.merchant.update({
        where: { clerkUserId },
        data: { email },
      });
    }
    return existing;
  }

  let dodoCustomerId: string | null = null;
  const client = getDodoClient();

  if (client) {
    try {
      const customer = await client.customers.create({
        email: email ?? `${clerkUserId}@merchants.local`,
        name: email ?? `Merchant ${clerkUserId.slice(0, 8)}`,
        metadata: { clerk_user_id: clerkUserId },
      });
      dodoCustomerId = customer.customer_id;
    } catch (error) {
      console.error("Failed to create Dodo customer:", error);
    }
  }

  return db.merchant.create({
    data: {
      clerkUserId,
      email: email ?? null,
      dodoCustomerId,
    },
  });
}

export async function getMerchantCreditBalanceMinutes(
  clerkUserId: string
): Promise<number> {
  const merchant = await db.merchant.findUnique({
    where: { clerkUserId },
    select: { balanceMinutes: true },
  });
  if (!merchant) return 0;
  return toNumber(merchant.balanceMinutes);
}

export async function grantSignupCreditsIfNeeded(
  clerkUserId: string
): Promise<void> {
  const idempotencyKey = `signup-grant:${clerkUserId}`;
  const existingGrant = await db.adminCreditGrant.findUnique({
    where: { idempotencyKey },
  });

  if (existingGrant) {
    const merchant = await db.merchant.findUnique({
      where: { clerkUserId },
    });
    if (merchant && !merchant.freeMinutesGranted) {
      await db.merchant.update({
        where: { clerkUserId },
        data: { freeMinutesGranted: true },
      });
    }
    return;
  }

  const merchant = await db.merchant.findUnique({
    where: { clerkUserId },
  });
  if (!merchant) return;

  const config = await getBillingConfig();
  if (config.freeMinutesOnSignup <= 0) {
    await db.merchant.update({
      where: { clerkUserId },
      data: { freeMinutesGranted: true },
    });
    return;
  }

  await grantMinutesToMerchant({
    clerkUserId,
    minutes: config.freeMinutesOnSignup,
    reason: "Welcome bonus on account registration",
    grantedByEmail: "system@signup",
    idempotencyKey,
    grantType: "signup",
  });

  await db.merchant.update({
    where: { clerkUserId },
    data: { freeMinutesGranted: true },
  });
}

export async function grantMinutesToMerchant(params: {
  clerkUserId: string;
  minutes: number;
  reason: string;
  grantedByEmail: string;
  idempotencyKey: string;
  grantType?: "signup" | "admin_manual";
}): Promise<{ alreadyGranted: boolean }> {
  const merchant = await db.merchant.findUnique({
    where: { clerkUserId: params.clerkUserId },
  });

  if (!merchant) {
    throw new Error("Merchant not found");
  }

  const existingGrant = await db.adminCreditGrant.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
  });
  if (existingGrant) {
    return { alreadyGranted: true };
  }

  await db.$transaction(async (tx) => {
    await tx.merchant.update({
      where: { clerkUserId: params.clerkUserId },
      data: { balanceMinutes: { increment: params.minutes } },
    });

    await tx.adminCreditGrant.create({
      data: {
        clerkUserId: params.clerkUserId,
        minutesGranted: params.minutes,
        reason: params.reason,
        grantedByEmail: params.grantedByEmail,
        idempotencyKey: params.idempotencyKey,
      },
    });
  });

  return { alreadyGranted: false };
}

export async function bootstrapMerchantBilling(): Promise<MerchantBillingStatus> {
  const user = await currentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  const email =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
      ?.emailAddress ?? user.emailAddresses[0]?.emailAddress;

  const merchant = await ensureMerchantForUser(user.id, email ?? null);
  await grantSignupCreditsIfNeeded(user.id);

  const creditBalanceMinutes = await getMerchantCreditBalanceMinutes(user.id);

  return {
    clerkUserId: merchant.clerkUserId,
    email: merchant.email,
    dodoCustomerId: merchant.dodoCustomerId,
    creditBalanceMinutes,
    freeMinutesGranted: merchant.freeMinutesGranted,
  };
}

export async function hasBillableMinutes(clerkUserId: string): Promise<{
  allowed: boolean;
  balanceMinutes: number;
  reason?: string;
}> {
  const balance = await getMerchantCreditBalanceMinutes(clerkUserId);

  if (balance > 0) {
    return { allowed: true, balanceMinutes: balance };
  }

  return {
    allowed: false,
    balanceMinutes: balance,
    reason: "No call minutes remaining. Add minutes on the Billing page.",
  };
}

export async function recordCallUsage(params: {
  clerkUserId: string;
  minutes: number;
  callType: "recovery" | "ndrc";
  storeDomain: string;
  sourceId: string;
  occurredAt: Date;
}): Promise<void> {
  if (params.minutes <= 0) return;

  const eventId = `ivr-minutes:${params.callType}:${params.sourceId}`;

  await db.$transaction(async (tx) => {
    const existing = await tx.usageEventOutbox.findUnique({
      where: { eventId },
    });
    if (existing?.ingestedAt) return;

    await tx.usageEventOutbox.upsert({
      where: { eventId },
      create: {
        eventId,
        clerkUserId: params.clerkUserId,
        minutes: params.minutes,
        callType: params.callType,
        storeDomain: params.storeDomain,
        sourceId: params.sourceId,
        occurredAt: params.occurredAt,
        ingestedAt: new Date(),
      },
      update: { ingestedAt: new Date() },
    });

    await tx.merchant.update({
      where: { clerkUserId: params.clerkUserId },
      data: { balanceMinutes: { decrement: params.minutes } },
    });
  });
}

export function minutesFromDurationSec(
  durationSec: number | null | undefined
): number {
  if (!durationSec || durationSec <= 0) return 0;
  return Math.max(0.01, Math.round((durationSec / 60) * 100) / 100);
}

export function minutesForAmountUsd(
  amountUsd: number,
  ratePerMinuteUsd: number
): number {
  if (ratePerMinuteUsd <= 0) return 0;
  return Math.round((amountUsd / ratePerMinuteUsd) * 100) / 100;
}

const MIN_TOP_UP_USD = 5;
const MAX_TOP_UP_USD = 500;

export async function createTopUpCheckoutSession(params: {
  clerkUserId: string;
  email: string;
  amountUsd: number;
}): Promise<{ checkoutUrl: string; topUpId: string; minutesToGrant: number }> {
  if (!isDodoConfigured()) {
    throw new Error("Payments are not configured");
  }

  const productId = getDodoTopUpProductId();
  if (!productId) {
    throw new Error("Top-up product is not configured");
  }

  if (params.amountUsd < MIN_TOP_UP_USD || params.amountUsd > MAX_TOP_UP_USD) {
    throw new Error(
      `Amount must be between $${MIN_TOP_UP_USD} and $${MAX_TOP_UP_USD}`
    );
  }

  const config = await getBillingConfig();
  const minutesToGrant = minutesForAmountUsd(
    params.amountUsd,
    config.ratePerMinuteUsd
  );

  const merchant = await ensureMerchantForUser(params.clerkUserId, params.email);

  const topUp = await db.billingTopUp.create({
    data: {
      clerkUserId: params.clerkUserId,
      amountUsd: params.amountUsd,
      minutesToGrant,
      ratePerMinuteUsd: config.ratePerMinuteUsd,
      status: "PENDING",
    },
  });

  const client = getDodoClient();
  if (!client) {
    throw new Error("Payments are not configured");
  }

  const amountCents = Math.round(params.amountUsd * 100);
  const appUrl = getAppUrl();

  const session = await client.checkoutSessions.create({
    product_cart: [
      {
        product_id: productId,
        quantity: 1,
        amount: amountCents,
      },
    ],
    customer: merchant.dodoCustomerId
      ? { customer_id: merchant.dodoCustomerId }
      : { email: params.email, name: params.email },
    metadata: {
      top_up_id: topUp.id,
      clerk_user_id: params.clerkUserId,
      minutes_to_grant: minutesToGrant.toFixed(2),
    },
    return_url: `${appUrl}/dashboard/billing?topup=success`,
    cancel_url: `${appUrl}/dashboard/billing?topup=cancelled`,
  });

  if (!session.checkout_url) {
    throw new Error("Failed to create checkout session");
  }

  await db.billingTopUp.update({
    where: { id: topUp.id },
    data: { dodoSessionId: session.session_id },
  });

  return {
    checkoutUrl: session.checkout_url,
    topUpId: topUp.id,
    minutesToGrant,
  };
}

export async function fulfillTopUpFromPayment(params: {
  paymentId: string;
  topUpId: string;
  amountCents?: number;
}): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const topUp = await tx.billingTopUp.findUnique({
      where: { id: params.topUpId },
    });

    if (!topUp) {
      console.warn("[billing] top-up not found:", params.topUpId);
      return false;
    }

    if (topUp.status === "COMPLETED") {
      return true;
    }

    if (params.amountCents != null) {
      const expectedCents = Math.round(toNumber(topUp.amountUsd) * 100);
      const received = params.amountCents;
      const amountMatches =
        received === expectedCents ||
        received === Math.round(toNumber(topUp.amountUsd));
      if (!amountMatches) {
        console.warn(
          "[billing] amount mismatch for top-up (still fulfilling)",
          params.topUpId,
          { received, expectedCents }
        );
      }
    }

    await tx.billingTopUp.update({
      where: { id: topUp.id },
      data: {
        status: "COMPLETED",
        dodoPaymentId: params.paymentId,
        completedAt: new Date(),
      },
    });

    await tx.merchant.update({
      where: { clerkUserId: topUp.clerkUserId },
      data: {
        balanceMinutes: { increment: toNumber(topUp.minutesToGrant) },
      },
    });

    return true;
  });
}

function isPaymentSucceeded(status: string | undefined | null): boolean {
  return status?.toLowerCase() === "succeeded";
}

export async function reconcilePendingTopUps(clerkUserId: string): Promise<number> {
  const client = getDodoClient();
  if (!client) return 0;

  const pending = await db.billingTopUp.findMany({
    where: {
      clerkUserId,
      status: "PENDING",
      dodoSessionId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  let fulfilled = 0;

  for (const topUp of pending) {
    if (!topUp.dodoSessionId) continue;

    try {
      const session = await client.checkoutSessions.retrieve(topUp.dodoSessionId);

      if (
        isPaymentSucceeded(session.payment_status) &&
        session.payment_id
      ) {
        const ok = await fulfillTopUpFromPayment({
          paymentId: session.payment_id,
          topUpId: topUp.id,
        });
        if (ok) fulfilled += 1;
        continue;
      }

      if (session.payment_id) {
        const payment = await client.payments.retrieve(session.payment_id);
        if (isPaymentSucceeded(payment.status)) {
          const ok = await fulfillTopUpFromPayment({
            paymentId: session.payment_id,
            topUpId: topUp.id,
            amountCents: payment.total_amount,
          });
          if (ok) fulfilled += 1;
        }
      }
    } catch (error) {
      console.error(
        "[billing] failed to reconcile top-up",
        topUp.id,
        error
      );
    }
  }

  return fulfilled;
}

export async function resolveTopUpIdFromPayment(paymentId: string): Promise<{
  topUpId: string | null;
  amountCents?: number;
}> {
  const client = getDodoClient();
  if (!client) return { topUpId: null };

  try {
    const payment = await client.payments.retrieve(paymentId);
    const metadata = payment.metadata as Record<string, unknown> | undefined;
    const metadataTopUpId =
      typeof metadata?.top_up_id === "string" ? metadata.top_up_id : null;

    if (metadataTopUpId) {
      return { topUpId: metadataTopUpId, amountCents: payment.total_amount };
    }

    if (payment.checkout_session_id) {
      const topUp = await db.billingTopUp.findFirst({
        where: { dodoSessionId: payment.checkout_session_id },
      });
      if (topUp) {
        return { topUpId: topUp.id, amountCents: payment.total_amount };
      }
    }
  } catch (error) {
    console.error("[billing] failed to resolve payment", paymentId, error);
  }

  return { topUpId: null };
}

export async function listRecentTopUps(clerkUserId: string, limit = 10) {
  const topUps = await db.billingTopUp.findMany({
    where: { clerkUserId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return topUps.map((topUp) => ({
    id: topUp.id,
    amountUsd: toNumber(topUp.amountUsd),
    minutesToGrant: toNumber(topUp.minutesToGrant),
    status: topUp.status,
    createdAt: topUp.createdAt.toISOString(),
    completedAt: topUp.completedAt?.toISOString() ?? null,
  }));
}
