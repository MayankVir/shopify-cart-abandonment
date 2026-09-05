import type { Store } from "@prisma/client";
import { adminGraphql } from "@/lib/shopify-admin";
import { resolveStoreAdminAccessToken } from "@/lib/shopify-admin-token";
import { normalizePhoneNumber } from "@/lib/phone";

export const DEFAULT_REPEAT_CUSTOMER_WINDOW_DAYS = 180;
export const MIN_REPEAT_CUSTOMER_WINDOW_DAYS = 1;
export const MAX_REPEAT_CUSTOMER_WINDOW_DAYS = 3650;

export interface RepeatCustomerInfo {
  isRepeatCustomer: boolean;
  orderCount: number;
  lastOrderAt: string | null;
}

interface RepeatCustomerQueryResult {
  customers: {
    nodes: Array<{
      orders: {
        nodes: Array<{ processedAt: string }>;
      };
    }>;
  };
}

const REPEAT_CUSTOMER_QUERY = `
query RepeatCustomer($q: String!, $since: String!) {
  customers(first: 1, query: $q) {
    nodes {
      orders(first: 10, sortKey: PROCESSED_AT, reverse: true, query: $since) {
        nodes { processedAt }
      }
    }
  }
}`;

export function clampRepeatCustomerWindowDays(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_REPEAT_CUSTOMER_WINDOW_DAYS;
  return Math.min(
    MAX_REPEAT_CUSTOMER_WINDOW_DAYS,
    Math.max(MIN_REPEAT_CUSTOMER_WINDOW_DAYS, Math.round(value))
  );
}

function processedAtSinceQuery(windowDays: number): string {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - clampRepeatCustomerWindowDays(windowDays));
  const yyyy = since.getUTCFullYear();
  const mm = String(since.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(since.getUTCDate()).padStart(2, "0");
  return `processed_at:>=${yyyy}-${mm}-${dd}`;
}

/**
 * Look up Shopify orders for this phone within the lookback window.
 * Returns null on any failure (no match, missing scope, API error) so the
 * caller can treat it as "not checked" rather than "not a repeat customer".
 */
export async function getRepeatCustomerInfo(
  store: Pick<Store, "storeDomain" | "apiKey" | "apiSecret" | "adminAccessToken">,
  phone: string,
  windowDays: number
): Promise<RepeatCustomerInfo | null> {
  const normalized = normalizePhoneNumber(phone);
  if (!normalized) return null;

  try {
    const { token } = await resolveStoreAdminAccessToken(store);
    const data = await adminGraphql<RepeatCustomerQueryResult>(
      store.storeDomain,
      token,
      REPEAT_CUSTOMER_QUERY,
      {
        q: `phone:${normalized}`,
        since: processedAtSinceQuery(windowDays),
      }
    );

    const customer = data.customers.nodes[0];
    if (!customer) {
      return { isRepeatCustomer: false, orderCount: 0, lastOrderAt: null };
    }

    const orders = customer.orders.nodes;
    const lastOrderAt = orders[0]?.processedAt ?? null;
    return {
      isRepeatCustomer: orders.length > 0,
      orderCount: orders.length,
      lastOrderAt,
    };
  } catch (error) {
    console.warn(
      "[repeat-customer] lookup failed",
      JSON.stringify({
        store: store.storeDomain,
        error: error instanceof Error ? error.message : String(error),
      })
    );
    return null;
  }
}
