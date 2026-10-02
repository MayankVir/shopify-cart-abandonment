import { db } from "@/lib/db";

/** Inclusive start, exclusive end. Defaults to the current UTC calendar month. */
export function currentBillingCycle(now = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

/**
 * Total talk time, in whole seconds, for every store owned by this merchant
 * during the billing cycle. Cart recovery and NDR calls are both included.
 */
export async function getMerchantCycleDurationSeconds(
  clerkUserId: string,
  cycleStart: Date,
  cycleEnd: Date
): Promise<number> {
  const stores = await db.store.findMany({
    where: { clerkUserId },
    select: { storeDomain: true },
  });
  const domains = stores.map((store) => store.storeDomain);
  if (domains.length === 0) return 0;

  const [cart, ndrc] = await Promise.all([
    db.callAttempt.aggregate({
      where: {
        durationSec: { gt: 0 },
        endedAt: { gte: cycleStart, lt: cycleEnd },
        checkout: { storeDomain: { in: domains } },
      },
      _sum: { durationSec: true },
    }),
    db.ndrcCallAttempt.aggregate({
      where: {
        durationSec: { gt: 0 },
        endedAt: { gte: cycleStart, lt: cycleEnd },
        order: { storeDomain: { in: domains } },
      },
      _sum: { durationSec: true },
    }),
  ]);

  return (cart._sum.durationSec ?? 0) + (ndrc._sum.durationSec ?? 0);
}
