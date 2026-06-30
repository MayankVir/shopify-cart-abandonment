"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { CallStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { buildSessionSummary, fetchTtaiSessionDetails } from "@/lib/ttai";
import {
  attachSessionDetailsToStore,
  ensureTtaiWebhookStore,
} from "@/lib/ttai-webhook";
import type { CallLogEntry } from "@/store/use-analytics-store";
import { encryptToken, decryptToken } from "@/lib/encryption";
import {
  mergeAlternateShopDomains,
  normalizeStoreDomain,
  parseAlternateShopDomains,
} from "@/lib/store-domain";
import {
  fetchShopMyshopifyAliases,
  verifyStoreAdminAccess,
} from "@/lib/shopify-admin";
import {
  resolveAdminAccessTokenFromPlainCredentials,
  resolveStoreAdminAccessToken,
} from "@/lib/shopify-admin-token";

export interface StoreActionResult {
  success: boolean;
  error?: string;
  storeDomain?: string;
  linkedAlternateDomains?: string[];
}


export interface ManualStoreConfig {
  storeDomain: string;
  alternateShopDomains: string;
  apiKey: string;
  apiSecret: string;
  adminAccessToken: string;
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
    alternateShopDomains: store.alternateShopDomains.join(", "),
    apiKey: safeDecrypt(store.apiKey),
    apiSecret: safeDecrypt(store.apiSecret),
    adminAccessToken: safeDecrypt(store.adminAccessToken),
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

/** Preview *.myshopify.com aliases before save (Client ID + shpss_ or shpat_). */
export async function lookupShopAlternateDomains(
  storeDomain: string,
  credentials: {
    adminAccessToken?: string;
    apiKey?: string;
    apiSecret?: string;
  }
): Promise<{ domains: string[]; error?: string }> {
  const { userId } = await auth();
  if (!userId) {
    return { domains: [], error: "Unauthorized" };
  }

  const normalized = normalizeStoreDomain(storeDomain);
  if (!normalized) {
    return { domains: [], error: "Store domain is required" };
  }

  const hasClientCreds = Boolean(credentials.apiKey?.trim() && credentials.apiSecret?.trim());
  const hasShpat = Boolean(credentials.adminAccessToken?.startsWith("shpat_"));

  if (!hasClientCreds && !hasShpat) {
    return {
      domains: [],
      error: "Client ID + Secret or Admin access token (shpat_) required",
    };
  }

  try {
    const resolved = hasClientCreds
      ? await resolveAdminAccessTokenFromPlainCredentials({
          storeDomain: normalized,
          clientId: credentials.apiKey!.trim(),
          clientSecret: credentials.apiSecret!.trim(),
          adminAccessToken: credentials.adminAccessToken,
        })
      : await resolveStoreAdminAccessToken({
          storeDomain: normalized,
          apiKey: null,
          apiSecret: null,
          adminAccessToken: credentials.adminAccessToken!,
        });

    const discovered = await fetchShopMyshopifyAliases(
      normalized,
      resolved.token
    );
    const linked = mergeAlternateShopDomains(normalized, [], discovered);
    return { domains: linked };
  } catch (error) {
    return {
      domains: [],
      error:
        error instanceof Error
          ? error.message
          : "Could not fetch shop domains from Shopify",
    };
  }
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
  const adminAccessToken = String(formData.get("adminAccessToken") ?? "").trim();
  const storefrontToken = String(formData.get("storefrontToken") ?? "").trim();
  const alternateShopDomainsRaw = String(formData.get("alternateShopDomains") ?? "");
  let alternateShopDomains = parseAlternateShopDomains(
    alternateShopDomainsRaw,
    storeDomain
  );

  if (!storeDomain) {
    return { success: false, error: "Store domain is required" };
  }
  if (!apiKey) {
    return { success: false, error: "Client ID (API Key) is required" };
  }
  if (!apiSecret) {
    return { success: false, error: "Client Secret is required" };
  }
  const hasClientCredentials = Boolean(apiKey && apiSecret);
  const hasShpat = adminAccessToken.startsWith("shpat_");
  if (adminAccessToken && !hasShpat) {
    return {
      success: false,
      error: "Admin access token must start with shpat_ when provided",
    };
  }
  if (!storefrontToken) {
    return { success: false, error: "Storefront public API token is required" };
  }

  try {
    let adminTokenForApi = adminAccessToken;
    if (!hasShpat && hasClientCredentials) {
      const resolved = await resolveAdminAccessTokenFromPlainCredentials({
        storeDomain,
        clientId: apiKey,
        clientSecret: apiSecret,
      });
      adminTokenForApi = resolved.token;
      console.info(
        "Manual setup: obtained Admin token via client_credentials",
        JSON.stringify({
          storeDomain,
          source: resolved.source,
          expiresInSec: resolved.expiresInSec,
        })
      );
    }

    try {
      if (adminTokenForApi) {
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
        adminAccessToken: hasShpat ? encryptToken(adminAccessToken) : encryptToken(""),
        storefrontToken: encryptToken(storefrontToken),
      },
      update: {
        alternateShopDomains,
        apiKey: encryptToken(apiKey),
        apiSecret: encryptToken(apiSecret),
        adminAccessToken: hasShpat ? encryptToken(adminAccessToken) : encryptToken(""),
        storefrontToken: encryptToken(storefrontToken),
      },
    });

    if (adminTokenForApi) {
      const access = await verifyStoreAdminAccess(storeDomain, adminTokenForApi);
      if (!access.ok) {
        console.warn("Scope verification warning on save:", access.error);
      }
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/onboarding");
    revalidatePath("/admin");

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
    (sessionResult.session?.duration != null
      ? Math.round(sessionResult.session.duration)
      : undefined);

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

  revalidatePath("/dashboard");

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
