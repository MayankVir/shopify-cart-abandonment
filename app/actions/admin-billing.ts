"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getBillingConfig, updateBillingConfig } from "@/lib/billing-config";
import {
  ensureMerchantForUser,
  getMerchantCreditBalanceMinutes,
  grantMinutesToMerchant,
} from "@/lib/billing";
import { requireAdmin } from "@/lib/admin-gate";

export interface AdminActionResult {
  success: boolean;
  error?: string;
}

export async function adminGetBillingConfig() {
  await requireAdmin();
  return getBillingConfig();
}

export async function adminUpdateBillingConfig(data: {
  ratePerMinuteUsd: number;
  freeMinutesOnSignup: number;
  maxGrantPerAction?: number;
}): Promise<AdminActionResult> {
  await requireAdmin();

  if (data.ratePerMinuteUsd <= 0 || data.ratePerMinuteUsd > 1000) {
    return { success: false, error: "Rate must be between 0 and 1000 USD/min" };
  }
  if (data.freeMinutesOnSignup < 0 || data.freeMinutesOnSignup > 10_000) {
    return {
      success: false,
      error: "Signup free minutes must be between 0 and 10000",
    };
  }

  await updateBillingConfig({
    ratePerMinuteUsd: data.ratePerMinuteUsd,
    freeMinutesOnSignup: data.freeMinutesOnSignup,
    ...(data.maxGrantPerAction !== undefined
      ? { maxGrantPerAction: data.maxGrantPerAction }
      : {}),
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/billing");

  return { success: true };
}

export async function adminSearchMerchants(query: string) {
  await requireAdmin();

  const trimmed = query.trim();
  if (!trimmed) return [];

  const merchants = await db.merchant.findMany({
    where: {
      OR: [
        { email: { contains: trimmed, mode: "insensitive" } },
        { clerkUserId: { contains: trimmed } },
      ],
    },
    include: {
      _count: { select: { stores: true } },
    },
    take: 20,
    orderBy: { createdAt: "desc" },
  });

  const results = await Promise.all(
    merchants.map(async (merchant) => ({
      clerkUserId: merchant.clerkUserId,
      email: merchant.email,
      storeCount: merchant._count.stores,
      creditBalanceMinutes: await getMerchantCreditBalanceMinutes(
        merchant.clerkUserId
      ),
    }))
  );

  return results;
}

export async function adminGrantExtraMinutes(data: {
  clerkUserId: string;
  minutes: number;
  reason: string;
}): Promise<AdminActionResult> {
  const { email } = await requireAdmin();
  const config = await getBillingConfig();

  if (!data.clerkUserId.trim()) {
    return { success: false, error: "Merchant is required" };
  }
  if (data.minutes <= 0) {
    return { success: false, error: "Minutes must be greater than 0" };
  }
  if (data.minutes > config.maxGrantPerAction) {
    return {
      success: false,
      error: `Cannot grant more than ${config.maxGrantPerAction} minutes per action`,
    };
  }
  if (!data.reason.trim()) {
    return { success: false, error: "Reason is required" };
  }

  const merchant = await db.merchant.findUnique({
    where: { clerkUserId: data.clerkUserId },
  });
  if (!merchant) {
    return { success: false, error: "Merchant not found" };
  }

  try {
    await grantMinutesToMerchant({
      clerkUserId: data.clerkUserId,
      minutes: data.minutes,
      reason: data.reason.trim(),
      grantedByEmail: email,
      idempotencyKey: `admin-grant:${crypto.randomUUID()}`,
      grantType: "admin_manual",
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Grant failed",
    };
  }

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/billing");

  return { success: true };
}

export async function adminAssignAllStoresToSelf(): Promise<
  AdminActionResult & { assignedCount?: number }
> {
  const { userId, email } = await requireAdmin();

  await ensureMerchantForUser(userId, email);

  const result = await db.store.updateMany({
    data: { clerkUserId: userId },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/admin");

  return { success: true, assignedCount: result.count };
}

export async function adminListCreditGrants(page = 0, pageSize = 25) {
  await requireAdmin();

  const [grants, total] = await Promise.all([
    db.adminCreditGrant.findMany({
      include: {
        merchant: { select: { email: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: page * pageSize,
      take: pageSize,
    }),
    db.adminCreditGrant.count(),
  ]);

  return {
    grants: grants.map((grant) => ({
      id: grant.id,
      clerkUserId: grant.clerkUserId,
      email: grant.merchant.email,
      minutesGranted: Number(grant.minutesGranted),
      reason: grant.reason,
      grantedByEmail: grant.grantedByEmail,
      createdAt: grant.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}
