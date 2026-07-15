"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { CallStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { buildSessionSummary, fetchTtaiSessionDetails, durationSecFromTtaiSession } from "@/lib/ttai";
import {
  attachSessionDetailsToStore,
  ensureTtaiWebhookStore,
} from "@/lib/ttai-webhook";
import type { CallLogEntry } from "@/store/use-analytics-store";
import { encryptToken, decryptToken } from "@/lib/encryption";
import {
  mergeAlternateShopDomains,
  normalizeStoreDomain,
} from "@/lib/store-domain";
import {
  fetchShopMyshopifyAliases,
  verifyStoreAdminAccess,
} from "@/lib/shopify-admin";
import {
  resolveAdminAccessTokenFromPlainCredentials,
} from "@/lib/shopify-admin-token";

export interface StoreActionResult {
  success: boolean;
  error?: string;
  storeDomain?: string;
  linkedAlternateDomains?: string[];
}


export interface ManualStoreConfig {
  storeDomain: string;
  apiKey: string;
  apiSecret: string;
  storefrontToken: string;
}

function safeDecrypt(value: string | null | undefined): string {
  if (!value) return "";
  try {
    return decryptToken(value);
  } catch {
    return value;
  }
}

export async function getManualStoreConfig(
  storeDomain?: string
): Promise<ManualStoreConfig | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const store = storeDomain
    ? await db.store.findUnique({
        where: { storeDomain: normalizeStoreDomain(storeDomain) },
      })
    : await db.store.findFirst({ orderBy: { createdAt: "desc" } });

  if (!store) return null;

  return {
    storeDomain: store.storeDomain,
    apiKey: safeDecrypt(store.apiKey),
    apiSecret: safeDecrypt(store.apiSecret),
    storefrontToken: safeDecrypt(store.storefrontToken),
  };
}

export async function getStoreDomainsForManualSetup(): Promise<string[]> {
  const { userId } = await auth();
  if (!userId) return [];

  const stores = await db.store.findMany({
    select: { storeDomain: true },
    orderBy: { createdAt: "desc" },
  });
  return stores.map((s) => s.storeDomain);
}

export async function saveManualStoreConfig(formData: FormData): Promise<StoreActionResult> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  const storeDomain = normalizeStoreDomain(
    String(formData.get("storeDomain") ?? "")
  );
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const apiSecret = String(formData.get("apiSecret") ?? "").trim();
  const storefrontToken = String(formData.get("storefrontToken") ?? "").trim();

  if (!storeDomain) {
    return { success: false, error: "Store domain is required" };
  }
  if (!apiKey) {
    return { success: false, error: "Client ID (API Key) is required" };
  }
  if (!apiSecret) {
    return { success: false, error: "Client Secret is required" };
  }

  try {
    const existing = await db.store.findUnique({
      where: { storeDomain },
      select: { alternateShopDomains: true },
    });
    let alternateShopDomains = existing?.alternateShopDomains ?? [];

    const resolved = await resolveAdminAccessTokenFromPlainCredentials({
      storeDomain,
      clientId: apiKey,
      clientSecret: apiSecret,
    });
    const adminTokenForApi = resolved.token;
    console.info(
      "Manual setup: obtained Admin token via client_credentials",
      JSON.stringify({
        storeDomain,
        source: resolved.source,
        expiresInSec: resolved.expiresInSec,
      })
    );

    try {
      const discovered = await fetchShopMyshopifyAliases(
        storeDomain,
        adminTokenForApi
      );
      alternateShopDomains = mergeAlternateShopDomains(
        storeDomain,
        alternateShopDomains,
        discovered
      );
      if (discovered.length > 0) {
        console.info(
          "Auto-linked shop myshopify domains",
          JSON.stringify({ storeDomain, discovered, linked: alternateShopDomains })
        );
      }
    } catch (domainError) {
      console.warn(
        "Could not auto-fetch alternate myshopify domains:",
        domainError instanceof Error ? domainError.message : domainError
      );
    }

    await db.store.upsert({
      where: { storeDomain },
      create: {
        storeDomain,
        alternateShopDomains,
        apiKey: encryptToken(apiKey),
        apiSecret: encryptToken(apiSecret),
        adminAccessToken: encryptToken(""),
        storefrontToken: encryptToken(storefrontToken),
      },
      update: {
        alternateShopDomains,
        apiKey: encryptToken(apiKey),
        apiSecret: encryptToken(apiSecret),
        adminAccessToken: encryptToken(""),
        ...(storefrontToken
          ? { storefrontToken: encryptToken(storefrontToken) }
          : {}),
      },
    });

    const access = await verifyStoreAdminAccess(storeDomain, adminTokenForApi);
    if (!access.ok) {
      console.warn("Scope verification warning on save:", access.error);
    }

    revalidatePath("/dashboard/analytics");
    revalidatePath("/dashboard/billing");
    revalidatePath("/dashboard/recovery");
    revalidatePath("/dashboard/onboarding");
    revalidatePath("/dashboard/admin");

    return {
      success: true,
      storeDomain,
      linkedAlternateDomains: alternateShopDomains,
    };
  } catch (error) {
    console.error("Failed to save store config:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save store",
    };
  }
}

export async function initiateOAuthConnect(
  storeDomain: string
): Promise<{ redirectUrl: string } | { error: string }> {
  const { userId } = await auth();
  if (!userId) {
    return { error: "Unauthorized" };
  }

  const normalized = normalizeStoreDomain(storeDomain);
  if (!normalized) {
    return { error: "Store domain is required" };
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  const appUrl = process.env.SHOPIFY_APP_URL ?? "http://localhost:3000";
  const scopes = process.env.SHOPIFY_SCOPES ?? "read_orders,read_customers,read_checkouts,write_checkouts";

  if (!apiKey) {
    return {
      error: "Shopify OAuth is not configured. Set SHOPIFY_API_KEY in environment.",
    };
  }

  const redirectUri = `${appUrl}/api/shopify/callback`;
  const state = Buffer.from(
    JSON.stringify({ userId, storeDomain: normalized })
  ).toString("base64url");

  const redirectUrl =
    `https://${normalized}/admin/oauth/authorize` +
    `?client_id=${encodeURIComponent(apiKey)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`;

  return { redirectUrl };
}

export async function updateStoreTtaiBindings(
  storeDomain: string,
  ttaiScenarioId: string,
  ttaiTrunkId: string
): Promise<StoreActionResult> {
  try {
    await db.store.update({
      where: { storeDomain },
      data: {
        ttaiScenarioId: ttaiScenarioId.trim() || null,
        ttaiTrunkId: ttaiTrunkId.trim() || null,
      },
    });

    revalidatePath("/admin");

    return { success: true, storeDomain };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Update failed",
    };
  }
}

export async function getStoresForDashboard() {
  const stores = await db.store.findMany({
    select: {
      id: true,
      storeDomain: true,
      ttaiScenarioId: true,
      ttaiTrunkId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return stores;
}

type CheckoutWithLatestAttempt = Prisma.AbandonedCheckoutGetPayload<{
  include: {
    callAttempts: { orderBy: { startedAt: "desc" }; take: 1 };
  };
}>;

function toCallLogEntry(c: CheckoutWithLatestAttempt): CallLogEntry {
  return {
    id: c.id,
    checkoutToken: c.checkoutToken,
    customerPhone: c.customerPhone,
    customerEmail: c.customerEmail,
    cartValue: c.cartValue,
    callStatus: c.callStatus,
    callScheduled: c.callScheduled,
    aiSummary: c.aiSummary,
    lastError: c.lastError,
    sessionId: c.sessionId,
    storeDomain: c.storeDomain,
    checkoutUrl: c.checkoutUrl,
    recoveryUrl: c.recoveryUrl,
    draftOrderId: c.draftOrderId,
    draftOrderName: c.draftOrderName,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    latestAttempt: c.callAttempts[0]
      ? {
          id: c.callAttempts[0].id,
          transcript: c.callAttempts[0].transcript,
          toolCallsJson: c.callAttempts[0].toolCallsJson,
          failureReason: c.callAttempts[0].failureReason,
          failureStage: c.callAttempts[0].failureStage,
          durationSec: c.callAttempts[0].durationSec,
        }
      : null,
  };
}

export async function fetchTtaiSessionDetailsForCallLog(checkoutId: string): Promise<{
  success: boolean;
  error?: string;
  log?: CallLogEntry;
}> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  const checkout = await db.abandonedCheckout.findUnique({
    where: { id: checkoutId },
    include: {
      callAttempts: { orderBy: { startedAt: "desc" }, take: 1 },
    },
  });

  if (!checkout) {
    return { success: false, error: "Call log not found" };
  }

  const attempt = checkout.callAttempts[0];
  if (!attempt) {
    return { success: false, error: "No call attempt found for this checkout" };
  }

  const sessionId = attempt.sessionId ?? checkout.sessionId;
  if (!sessionId) {
    return {
      success: false,
      error: "No TTAI session ID on this call — details can only be fetched after a call is dispatched.",
    };
  }

  const sessionResult = await fetchTtaiSessionDetails(sessionId);
  const baseStore = ensureTtaiWebhookStore(attempt.toolCallsJson, {
    sessionId,
    callId: attempt.callId ?? undefined,
  });
  const finalStore = attachSessionDetailsToStore(baseStore, sessionResult);

  const transcript =
    (sessionResult.success && sessionResult.session
      ? buildSessionSummary(sessionResult.session)
      : undefined) ??
    attempt.transcript ??
    undefined;

  const durationSec =
    attempt.durationSec ??
    durationSecFromTtaiSession(sessionResult.session);

  await db.$transaction([
    db.callAttempt.update({
      where: { id: attempt.id },
      data: {
        transcript,
        toolCallsJson: finalStore as unknown as Prisma.InputJsonValue,
        durationSec,
      },
    }),
    db.abandonedCheckout.update({
      where: { id: checkout.id },
      data: {
        aiSummary: transcript ?? checkout.aiSummary,
        sessionId,
        updatedAt: new Date(),
      },
    }),
  ]);

  const refreshed = await db.abandonedCheckout.findUnique({
    where: { id: checkout.id },
    include: {
      callAttempts: { orderBy: { startedAt: "desc" }, take: 1 },
    },
  });

  revalidatePath("/dashboard/analytics");
  revalidatePath("/dashboard/billing");

  if (!sessionResult.success) {
    return {
      success: false,
      error: sessionResult.error ?? "Failed to fetch session details from TTAI",
      log: refreshed ? toCallLogEntry(refreshed) : undefined,
    };
  }

  return {
    success: true,
    log: refreshed ? toCallLogEntry(refreshed) : undefined,
  };
}

export async function getCheckoutLogsForStore(storeDomain: string) {
  const checkouts = await db.abandonedCheckout.findMany({
    where: {
      storeDomain,
      callStatus: { not: CallStatus.PENDING },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: {
      callAttempts: { orderBy: { startedAt: "desc" }, take: 1 },
    },
  });

  return checkouts.map(toCallLogEntry);
}

export async function getAllStoresForAdmin() {
  return db.store.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { checkouts: true },
      },
    },
  });
}
