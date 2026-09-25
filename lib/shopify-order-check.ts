import type { Store } from "@prisma/client";
import { adminGraphql } from "@/lib/shopify-admin";
import { resolveStoreAdminAccessToken } from "@/lib/shopify-admin-token";
import { normalizePhoneNumber } from "@/lib/phone";

/**
 * Result of asking Shopify whether this phone placed an order after abandoning.
 * `unknown` means the lookup itself failed (missing scope, throttled) — the
 * caller must treat that as "not checked" and place the call anyway.
 */
export type OrderCheck =
  | { status: "ordered"; orderName: string; processedAt: string }
  | { status: "none" }
  | { status: "unknown"; reason: string };

interface OrderCheckQueryResult {
  customers: {
    nodes: Array<{
      orders: {
        nodes: Array<{ name: string; processedAt: string }>;
      };
    }>;
  };
}

const ORDER_CHECK_QUERY = `
query OrderPlacedAfter($q: String!, $since: String!) {
  customers(first: 1, query: $q) {
    nodes {
      orders(first: 5, sortKey: PROCESSED_AT, reverse: true, query: $since) {
        nodes { name processedAt }
      }
    }
  }
}`;

/** Shopify's `processed_at` filter is date-granular, so the exact boundary is applied in JS. */
function processedAtSinceQuery(since: Date): string {
  const yyyy = since.getUTCFullYear();
  const mm = String(since.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(since.getUTCDate()).padStart(2, "0");
  return `processed_at:>=${yyyy}-${mm}-${dd}`;
}

/**
 * The newest order this phone placed strictly after `since`. Scoped through
 * `customers(query: "phone:…")` because that shape is already proven against
 * the store's granted scopes.
 */
export async function findOrderPlacedAfter(
  store: Pick<Store, "storeDomain" | "apiKey" | "apiSecret" | "adminAccessToken">,
  phone: string,
  since: Date
): Promise<OrderCheck> {
  const normalized = normalizePhoneNumber(phone);
  if (!normalized) return { status: "none" };

  try {
    const { token } = await resolveStoreAdminAccessToken(store);
    const data = await adminGraphql<OrderCheckQueryResult>(
      store.storeDomain,
      token,
      ORDER_CHECK_QUERY,
      {
        q: `phone:${normalized}`,
        since: processedAtSinceQuery(since),
      }
    );

    const orders = data.customers.nodes[0]?.orders.nodes ?? [];
    const ordered = orders
      .filter((order) => new Date(order.processedAt).getTime() > since.getTime())
      .sort(
        (a, b) =>
          new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime()
      );

    const latest = ordered[0];
    if (!latest) return { status: "none" };

    return {
      status: "ordered",
      orderName: latest.name,
      processedAt: latest.processedAt,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      "[order-check] lookup failed",
      JSON.stringify({ store: store.storeDomain, reason })
    );
    return { status: "unknown", reason };
  }
}
