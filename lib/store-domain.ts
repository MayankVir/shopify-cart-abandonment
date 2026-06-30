import { db } from "@/lib/db";
import type { Store } from "@prisma/client";
import { resolveApiSecret, verifyShopifyWebhookHmac } from "@/lib/shopify";

export interface WebhookDebugInfo {
  at: string;
  receivedShopDomain: string;
  registeredDomains: string[];
  status: "accepted" | "rejected_domain" | "rejected_hmac" | "ignored";
  message: string;
  matchedStoreDomain?: string;
}

let lastWebhookDebug: WebhookDebugInfo | null = null;

export function getLastWebhookDebug(): WebhookDebugInfo | null {
  return lastWebhookDebug;
}

export function setLastWebhookDebug(info: WebhookDebugInfo): void {
  lastWebhookDebug = info;
}

/** Canonical form: lowercase host without protocol or trailing slash. */
export function normalizeStoreDomain(domain: string): string {
  let normalized = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");

  if (normalized && !normalized.includes(".")) {
    normalized = `${normalized}.myshopify.com`;
  }

  return normalized;
}

function domainLookupCandidates(domain: string): string[] {
  const normalized = normalizeStoreDomain(domain);
  const candidates = new Set<string>([normalized]);

  if (normalized.endsWith(".myshopify.com")) {
    candidates.add(normalized.replace(/\.myshopify\.com$/, ""));
  }

  return Array.from(candidates);
}

/** Resolve a Store row from Shopify webhook header or manual input. */
export async function findStoreByDomain(
  shopDomain: string
): Promise<Store | null> {
  for (const candidate of domainLookupCandidates(shopDomain)) {
    const store = await db.store.findUnique({ where: { storeDomain: candidate } });
    if (store) return store;
  }

  const normalized = normalizeStoreDomain(shopDomain);
  const byAlias = await db.store.findFirst({
    where: { alternateShopDomains: { has: normalized } },
  });
  if (byAlias) return byAlias;

  return null;
}

/** Remember another *.myshopify.com host for the same Shopify shop. */
export async function rememberShopDomainAlias(
  store: Store,
  shopDomainHeader: string
): Promise<void> {
  const alias = normalizeStoreDomain(shopDomainHeader);
  if (alias === normalizeStoreDomain(store.storeDomain)) return;
  if (store.alternateShopDomains.includes(alias)) return;

  await db.store.update({
    where: { id: store.id },
    data: {
      alternateShopDomains: { push: alias },
    },
  });
}

export function parseAlternateShopDomains(
  raw: string,
  primaryDomain: string
): string[] {
  const primary = normalizeStoreDomain(primaryDomain);
  const seen = new Set<string>();

  for (const part of raw.split(/[,;\n]+/)) {
    const normalized = normalizeStoreDomain(part.trim());
    if (!normalized || normalized === primary || seen.has(normalized)) continue;
    seen.add(normalized);
  }

  return Array.from(seen);
}

/** Combine manual + discovered *.myshopify.com hosts, excluding the primary domain. */
export function mergeAlternateShopDomains(
  primaryDomain: string,
  manual: string[],
  discovered: string[]
): string[] {
  const primary = normalizeStoreDomain(primaryDomain);
  const seen = new Set<string>();

  for (const part of [...manual, ...discovered]) {
    const normalized = normalizeStoreDomain(part);
    if (!normalized || normalized === primary) continue;
    if (!normalized.endsWith(".myshopify.com")) continue;
    seen.add(normalized);
  }

  return Array.from(seen);
}

/** Match store by domain alias, then by HMAC against any registered secret. */
export async function findStoreForWebhook(
  shopDomainHeader: string,
  rawBody: string,
  hmacHeader: string | null
): Promise<Store | null> {
  const byDomain = await findStoreByDomain(shopDomainHeader);
  if (byDomain) return byDomain;

  if (!hmacHeader) return null;

  const stores = await db.store.findMany({
    where: { apiSecret: { not: null } },
  });

  for (const store of stores) {
    const secret = resolveApiSecret(store.apiSecret!);
    if (verifyShopifyWebhookHmac(rawBody, hmacHeader, secret)) {
      console.info(
        "Webhook matched store via HMAC (alternate myshopify.com domain)",
        JSON.stringify({
          header: shopDomainHeader,
          matchedStore: store.storeDomain,
        })
      );
      await rememberShopDomainAlias(store, shopDomainHeader);
      return store;
    }
  }

  console.warn(
    "Webhook HMAC did not match any registered store secret",
    JSON.stringify({
      header: shopDomainHeader,
      storesChecked: stores.map((s) => s.storeDomain),
    })
  );

  return null;
}

export async function listKnownShopDomains(store: Store): Promise<string[]> {
  return [
    normalizeStoreDomain(store.storeDomain),
    ...store.alternateShopDomains.map(normalizeStoreDomain),
  ];
}
