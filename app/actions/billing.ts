"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import {
  bootstrapMerchantBilling,
  createTopUpCheckoutSession,
  getMerchantCreditBalanceMinutes,
  listRecentTopUps,
  minutesForAmountUsd,
  reconcilePendingTopUps,
} from "@/lib/billing";
import { getBillingConfig } from "@/lib/billing-config";
import { isDodoConfigured, getDodoTopUpProductId } from "@/lib/dodo-env";

export async function getMerchantBillingOverview() {
  const { userId } = await auth();
  if (!userId) return null;

  const [status, config] = await Promise.all([
    bootstrapMerchantBilling(),
    getBillingConfig(),
  ]);

  await reconcilePendingTopUps(userId);

  const creditBalanceMinutes = await getMerchantCreditBalanceMinutes(userId);
  const recentTopUps = await listRecentTopUps(userId);

  return {
    clerkUserId: status.clerkUserId,
    email: status.email,
    dodoCustomerId: status.dodoCustomerId,
    creditBalanceMinutes,
    freeMinutesGranted: status.freeMinutesGranted,
    ratePerMinuteUsd: config.ratePerMinuteUsd,
    currency: config.currency,
    paymentsEnabled: isDodoConfigured() && Boolean(getDodoTopUpProductId()),
    recentTopUps,
  };
}

export async function refreshMerchantCreditBalance() {
  const { userId } = await auth();
  if (!userId) return 0;
  return getMerchantCreditBalanceMinutes(userId);
}

export interface TopUpCheckoutResult {
  success: boolean;
  checkoutUrl?: string;
  minutesToGrant?: number;
  error?: string;
}

export async function startTopUpCheckout(
  amountUsd: number
): Promise<TopUpCheckoutResult> {
  const user = await currentUser();
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const email =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
      ?.emailAddress ?? user.emailAddresses[0]?.emailAddress;

  if (!email) {
    return { success: false, error: "Account email is required for checkout" };
  }

  try {
    const session = await createTopUpCheckoutSession({
      clerkUserId: user.id,
      email,
      amountUsd,
    });

    return {
      success: true,
      checkoutUrl: session.checkoutUrl,
      minutesToGrant: session.minutesToGrant,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Checkout failed",
    };
  }
}

export async function syncBillingTopUps(): Promise<{ fulfilled: number }> {
  const { userId } = await auth();
  if (!userId) return { fulfilled: 0 };
  const fulfilled = await reconcilePendingTopUps(userId);
  return { fulfilled };
}

export async function previewTopUpMinutes(amountUsd: number) {
  const config = await getBillingConfig();
  return minutesForAmountUsd(amountUsd, config.ratePerMinuteUsd);
}
