/**
 * Retry helpers for Shopify's leaky-bucket rate limits. Parallel call dispatch
 * fires several Admin/Storefront requests per shop at once, so a throttled
 * response has to be waited out rather than surfaced as a call failure.
 */

export const SHOPIFY_MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8000;
const JITTER_MS = 250;

export interface ShopifyThrottleStatus {
  maximumAvailable?: number;
  currentlyAvailable?: number;
  restoreRate?: number;
}

export interface ShopifyCostExtension {
  requestedQueryCost?: number;
  actualQueryCost?: number;
  throttleStatus?: ShopifyThrottleStatus;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/** 429 plus 5xx; anything else is a real error and should not be retried. */
export function isRetryableHttpStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export function isThrottledGraphqlError(
  errors: Array<{ message?: string; extensions?: { code?: string } }> | undefined
): boolean {
  if (!errors?.length) return false;
  return errors.some(
    (error) =>
      error.extensions?.code === "THROTTLED" ||
      /throttled/i.test(error.message ?? "")
  );
}

export function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const asDate = Date.parse(header);
  if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now());
  return null;
}

/**
 * Time for the shop's bucket to refill enough for this query, straight from
 * Shopify's own cost extension when it sent one.
 */
export function bucketRefillMs(cost: ShopifyCostExtension | undefined): number | null {
  const requested = cost?.requestedQueryCost;
  const available = cost?.throttleStatus?.currentlyAvailable;
  const restoreRate = cost?.throttleStatus?.restoreRate;
  if (!requested || available === undefined || !restoreRate) return null;
  const deficit = requested - available;
  if (deficit <= 0) return null;
  return Math.ceil((deficit / restoreRate) * 1000);
}

/**
 * Exponential backoff with jitter so the parallel callers in one batch don't
 * all retry on the same tick. Shopify's own hints win when present.
 */
export function retryDelayMs(
  attempt: number,
  hints: { retryAfterMs?: number | null; refillMs?: number | null } = {}
): number {
  const hinted = hints.retryAfterMs ?? hints.refillMs ?? null;
  const base =
    hinted && hinted > 0
      ? hinted
      : BASE_BACKOFF_MS * Math.pow(2, Math.max(0, attempt));
  return Math.min(base, MAX_BACKOFF_MS) + Math.floor(Math.random() * JITTER_MS);
}
