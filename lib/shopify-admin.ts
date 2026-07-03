import { decryptToken } from "./encryption";
import { variantGidFromWebhook, type LineItemRecord } from "./line-items";
import { normalizePhoneNumber } from "./phone";
import {
  describePollBlockedWhenScopesPresent,
  formatShopifyAccessError,
  isAbandonedCheckoutAccessError,
  missingScopesMessage,
} from "./shopify-errors";

const ADMIN_API_VERSION = "2024-10";

export const ABANDONED_CHECKOUTS_PAGE_SIZE = 5;

/** Shopify Admin API: open = active/unarchived, closed = archived in admin. */
export type ShopifyAbandonedCheckoutStatus = "open" | "closed";

export const SHOPIFY_ABANDONED_CHECKOUT_STATUS = {
  OPEN: "open",
  CLOSED: "closed",
} as const satisfies Record<string, ShopifyAbandonedCheckoutStatus>;

export function shopifyAbandonedCheckoutStatusQuery(
  status: ShopifyAbandonedCheckoutStatus = SHOPIFY_ABANDONED_CHECKOUT_STATUS.OPEN
): string {
  return `status:${status}`;
}

export interface AbandonedCheckoutsPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface FetchAbandonedCheckoutsResult {
  nodes: ShopifyAbandonedCheckoutNode[];
  pageInfo: AbandonedCheckoutsPageInfo;
}

export interface ShopifyAbandonedCheckoutNode {
  id: string;
  name: string;
  abandonedCheckoutUrl: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  customer: {
    email: string | null;
    phone: string | null;
  } | null;
  billingAddress: { phone: string | null } | null;
  shippingAddress: { phone: string | null } | null;
  totalPriceSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  lineItems: {
    nodes: Array<{
      title: string;
      quantity: number;
      variant: { id: string } | null;
    }>;
  };
}

const SHOP_MYSHOPIFY_DOMAINS_QUERY = `
  query ShopMyshopifyDomains {
    shop {
      myshopifyDomain
      primaryDomain {
        host
      }
      domains {
        host
      }
    }
  }
`;

const ABANDONED_CHECKOUTS_QUERY = `
  query AbandonedCheckouts($first: Int!, $after: String, $query: String) {
    abandonedCheckouts(
      first: $first
      after: $after
      query: $query
      sortKey: CREATED_AT
      reverse: true
    ) {
      nodes {
        id
        name
        abandonedCheckoutUrl
        createdAt
        updatedAt
        completedAt
        customer {
          email
          phone
        }
        billingAddress {
          phone
        }
        shippingAddress {
          phone
        }
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        lineItems(first: 20) {
          nodes {
            title
            quantity
            variant {
              id
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export function resolveAdminToken(encryptedOrPlainToken: string): string {
  try {
    return decryptToken(encryptedOrPlainToken);
  } catch {
    return encryptedOrPlainToken;
  }
}

export async function adminGraphql<T>(
  storeDomain: string,
  adminAccessToken: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const token = resolveAdminToken(adminAccessToken);
  const response = await fetch(
    `https://${storeDomain}/admin/api/${ADMIN_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Shopify Admin API error: ${response.status} ${response.statusText}`
    );
  }

  const json = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    const raw = json.errors.map((e) => e.message).join(", ");
    throw new Error(formatShopifyAccessError(raw));
  }

  if (!json.data) {
    throw new Error("Empty response from Shopify Admin API");
  }

  return json.data;
}

export async function fetchGrantedAdminScopes(
  storeDomain: string,
  adminAccessToken: string
): Promise<string[]> {
  const token = resolveAdminToken(adminAccessToken);
  const response = await fetch(
    `https://${storeDomain}/admin/oauth/access_scopes.json`,
    {
      headers: { "X-Shopify-Access-Token": token },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Could not read token scopes (HTTP ${response.status}). Regenerate your Admin API token.`
    );
  }

  const json = (await response.json()) as {
    access_scopes?: Array<{ handle: string }>;
  };

  return (json.access_scopes ?? []).map((s) => s.handle);
}

export interface AdminAccessVerification {
  ok: boolean;
  granted: string[];
  scopesOk: boolean;
  pollOk: boolean;
  error?: string;
}

const ABANDONED_CHECKOUT_PROBE = `
  query AbandonedCheckoutProbe {
    abandonedCheckouts(first: 1) {
      nodes {
        id
      }
    }
  }
`;

export async function verifyStoreAdminAccess(
  storeDomain: string,
  adminAccessToken: string
): Promise<AdminAccessVerification> {
  try {
    const granted = await fetchGrantedAdminScopes(storeDomain, adminAccessToken);
    const scopeError = missingScopesMessage(granted);
    if (scopeError) {
      return {
        ok: false,
        granted,
        scopesOk: false,
        pollOk: false,
        error: scopeError,
      };
    }

    try {
      await adminGraphql<{
        abandonedCheckouts: { nodes: Array<{ id: string }> };
      }>(storeDomain, adminAccessToken, ABANDONED_CHECKOUT_PROBE);

      return { ok: true, granted, scopesOk: true, pollOk: true };
    } catch (pollError) {
      const message =
        pollError instanceof Error ? pollError.message : String(pollError);

      if (isAbandonedCheckoutAccessError(message)) {
        return {
          ok: true,
          granted,
          scopesOk: true,
          pollOk: false,
          error: describePollBlockedWhenScopesPresent(granted),
        };
      }

      throw pollError;
    }
  } catch (error) {
    return {
      ok: false,
      granted: [],
      scopesOk: false,
      pollOk: false,
      error: error instanceof Error ? error.message : "Scope verification failed",
    };
  }
}

/** All *.myshopify.com hosts for this shop (permanent + primary + registered). */
export async function fetchShopMyshopifyAliases(
  storeDomain: string,
  adminAccessToken: string
): Promise<string[]> {
  const data = await adminGraphql<{
    shop: {
      myshopifyDomain: string;
      primaryDomain: { host: string };
      domains: Array<{ host: string }>;
    };
  }>(storeDomain, adminAccessToken, SHOP_MYSHOPIFY_DOMAINS_QUERY);

  const hosts = new Set<string>();

  const addHost = (host: string | null | undefined) => {
    if (!host) return;
    const normalized = host.trim().toLowerCase();
    if (normalized.endsWith(".myshopify.com")) {
      hosts.add(normalized);
    }
  };

  addHost(data.shop.myshopifyDomain);
  addHost(data.shop.primaryDomain?.host);
  for (const domain of data.shop.domains ?? []) {
    addHost(domain.host);
  }

  return Array.from(hosts);
}

export async function fetchShopifyAbandonedCheckouts(
  storeDomain: string,
  adminAccessToken: string,
  options: {
    first?: number;
    after?: string | null;
    /** open = unarchived (default). closed = archived in Shopify admin. */
    status?: ShopifyAbandonedCheckoutStatus;
  } = {}
): Promise<FetchAbandonedCheckoutsResult> {
  const first = options.first ?? ABANDONED_CHECKOUTS_PAGE_SIZE;
  const after = options.after ?? undefined;
  const status = options.status ?? SHOPIFY_ABANDONED_CHECKOUT_STATUS.OPEN;

  try {
    return await fetchAbandonedCheckoutsGraphql(
      storeDomain,
      adminAccessToken,
      first,
      after,
      shopifyAbandonedCheckoutStatusQuery(status)
    );
  } catch (graphqlError) {
    const message =
      graphqlError instanceof Error ? graphqlError.message : String(graphqlError);

    if (!isAbandonedCheckoutAccessError(message)) {
      throw graphqlError;
    }

    console.warn(
      "GraphQL abandonedCheckouts blocked, trying REST checkouts.json fallback"
    );

    try {
      const nodes = await fetchAbandonedCheckoutsRest(
        storeDomain,
        adminAccessToken,
        first,
        status
      );
      return {
        nodes,
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    } catch {
      throw graphqlError;
    }
  }
}

async function fetchAbandonedCheckoutsGraphql(
  storeDomain: string,
  adminAccessToken: string,
  first: number,
  after: string | undefined,
  query: string
): Promise<FetchAbandonedCheckoutsResult> {
  const data = await adminGraphql<{
    abandonedCheckouts: {
      nodes: ShopifyAbandonedCheckoutNode[];
      pageInfo: AbandonedCheckoutsPageInfo;
    };
  }>(storeDomain, adminAccessToken, ABANDONED_CHECKOUTS_QUERY, {
    first,
    after: after ?? null,
    query,
  });

  const nodes = data.abandonedCheckouts.nodes.filter((node) => !node.completedAt);

  return {
    nodes,
    pageInfo: data.abandonedCheckouts.pageInfo,
  };
}

interface RestCheckoutRow {
  id?: number;
  token?: string;
  email?: string | null;
  phone?: string | null;
  total_price?: string;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
  abandoned_checkout_url?: string;
  billing_address?: { phone?: string | null } | null;
  shipping_address?: { phone?: string | null } | null;
  line_items?: Array<{
    title?: string;
    quantity?: number;
    variant_id?: number;
    price?: string;
  }>;
}

async function fetchAbandonedCheckoutsRest(
  storeDomain: string,
  adminAccessToken: string,
  limit: number,
  status: ShopifyAbandonedCheckoutStatus = SHOPIFY_ABANDONED_CHECKOUT_STATUS.OPEN
): Promise<ShopifyAbandonedCheckoutNode[]> {
  const token = resolveAdminToken(adminAccessToken);
  const url = new URL(
    `https://${storeDomain}/admin/api/${ADMIN_API_VERSION}/checkouts.json`
  );
  url.searchParams.set("limit", String(Math.min(limit, 250)));
  url.searchParams.set("status", status);

  const response = await fetch(url.toString(), {
    headers: { "X-Shopify-Access-Token": token },
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      formatShopifyAccessError(
        `REST checkouts.json HTTP ${response.status}: ${body.slice(0, 200)}`
      )
    );
  }

  let json: { checkouts?: RestCheckoutRow[] };
  try {
    json = JSON.parse(body) as { checkouts?: RestCheckoutRow[] };
  } catch {
    throw new Error("REST checkouts.json returned invalid JSON");
  }

  return (json.checkouts ?? [])
    .filter((c) => !c.completed_at)
    .map((c) => restCheckoutToNode(c));
}

function restCheckoutToNode(c: RestCheckoutRow): ShopifyAbandonedCheckoutNode {
  const token = c.token ?? "";
  const checkoutToken = token ? `CHECKOUT-${token}` : "";
  const gid =
    c.id != null
      ? `gid://shopify/AbandonedCheckout/${c.id}`
      : checkoutToken || `rest-${Date.now()}`;

  return {
    id: gid,
    name: checkoutToken || gid,
    abandonedCheckoutUrl: c.abandoned_checkout_url ?? "",
    createdAt: c.created_at ?? new Date().toISOString(),
    updatedAt: c.updated_at ?? c.created_at ?? new Date().toISOString(),
    completedAt: c.completed_at ?? null,
    customer: {
      email: c.email ?? null,
      phone: c.phone ?? null,
    },
    billingAddress: c.billing_address
      ? { phone: c.billing_address.phone ?? null }
      : null,
    shippingAddress: c.shipping_address
      ? { phone: c.shipping_address.phone ?? null }
      : null,
    totalPriceSet: {
      shopMoney: {
        amount: c.total_price ?? "0",
        currencyCode: "USD",
      },
    },
    lineItems: {
      nodes: (c.line_items ?? []).map((item) => ({
        title: item.title ?? "",
        quantity: item.quantity ?? 1,
        variant: item.variant_id
          ? { id: `gid://shopify/ProductVariant/${item.variant_id}` }
          : null,
      })),
    },
  };
}

export function checkoutTokenFromNode(node: ShopifyAbandonedCheckoutNode): string {
  if (node.name?.startsWith("CHECKOUT-")) {
    return node.name;
  }
  return gidToCheckoutToken(node.id);
}

export function gidToCheckoutToken(gid: string): string {
  const match = gid.match(/(\d+)$/);
  return match ? `CHECKOUT-${match[1]}` : gid.replace(/[^a-zA-Z0-9-]/g, "-");
}

export function extractCheckoutPhone(node: ShopifyAbandonedCheckoutNode): string {
  const raw =
    node.customer?.phone?.trim() ||
    node.billingAddress?.phone?.trim() ||
    node.shippingAddress?.phone?.trim() ||
    "";
  return normalizePhoneNumber(raw) || raw;
}

export function mapAdminLineItems(node: ShopifyAbandonedCheckoutNode): LineItemRecord[] {
  return (node.lineItems?.nodes || []).map((item) => {
    const variantGid = item.variant?.id || "";
    const numericId = variantGid.match(/(\d+)$/)?.[1] || "";
    return {
      variant_id: numericId,
      variant_gid: variantGid || variantGidFromWebhook(numericId),
      title: item.title || "",
      quantity: item.quantity || 1,
    };
  });
}

export function parseShopMoney(node: ShopifyAbandonedCheckoutNode): number {
  const amount = parseFloat(node.totalPriceSet?.shopMoney?.amount ?? "0");
  return Number.isFinite(amount) ? amount : 0;
}

export function computeScheduledCallAt(
  shopifyCreatedAt: Date,
  callDelayMinutes: number,
  now: Date = new Date()
): Date {
  const delayMs = callDelayMinutes * 60 * 1000;
  const fromAbandonment = new Date(shopifyCreatedAt.getTime() + delayMs);

  // Fresh abandonments: call N minutes after the customer left checkout.
  if (fromAbandonment.getTime() > now.getTime()) {
    return fromAbandonment;
  }

  // Stale rows: abandonment + delay is already in the past — eligible now.
  return now;
}

/** Recompute schedule on sync; keep existing only for carts still inside their delay window. */
export function resolveScheduledCallAt(
  existing: { scheduledCallAt: Date | null } | null,
  shopifyCreatedAt: Date,
  callDelayMinutes: number,
  now: Date = new Date()
): Date {
  const computed = computeScheduledCallAt(shopifyCreatedAt, callDelayMinutes, now);
  const delayMs = callDelayMinutes * 60 * 1000;
  const fromAbandonment = new Date(shopifyCreatedAt.getTime() + delayMs);
  const delayWindowPassed = fromAbandonment.getTime() <= now.getTime();

  if (!existing?.scheduledCallAt) {
    return computed;
  }

  // Overdue carts: always recompute so old "now + delay" anchors are corrected.
  if (delayWindowPassed) {
    return computed;
  }

  if (existing.scheduledCallAt.getTime() > now.getTime()) {
    return existing.scheduledCallAt;
  }

  return computed;
}

export function formatTimeUntilCall(scheduledCallAt: Date | null): {
  label: string;
  isReady: boolean;
  msRemaining: number;
} {
  if (!scheduledCallAt) {
    return { label: "Not scheduled", isReady: false, msRemaining: Infinity };
  }

  const msRemaining = scheduledCallAt.getTime() - Date.now();

  if (msRemaining <= 0) {
    return { label: "Ready to call", isReady: true, msRemaining: 0 };
  }

  const totalMinutes = Math.ceil(msRemaining / 60_000);
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return {
      label: mins > 0 ? `${hours}h ${mins}m` : `${hours}h`,
      isReady: false,
      msRemaining,
    };
  }

  return {
    label: `${totalMinutes}m`,
    isReady: false,
    msRemaining,
  };
}

export const TERMINAL_CALL_STATUSES = [
  "COMPLETED",
  "NO_ANSWER",
  "BUSY",
  "INVALID_NUMBER",
  "HANG_UP",
  "VOICEMAIL",
] as const;

export const FAILURE_CALL_STATUSES = [
  "CART_CREATE_FAILED",
  "DRAFT_CREATE_FAILED",
  "ENRICH_FAILED",
  "DISPATCH_FAILED",
] as const;

export function isRetryableStatus(status: string): boolean {
  return (
    status === "PENDING" ||
    FAILURE_CALL_STATUSES.includes(status as (typeof FAILURE_CALL_STATUSES)[number])
  );
}
