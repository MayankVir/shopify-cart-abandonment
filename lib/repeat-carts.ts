import { CallStatus, type Store } from "@prisma/client";
import { db } from "@/lib/db";
import { callWindowFromStore, type StoreCallWindowFields } from "@/lib/call-window";
import { computeScheduledCallAt } from "@/lib/shopify-admin";

type RepeatCartStore = Pick<Store, "storeDomain" | "autoCallsEnabled" | "callDelayMinutes"> &
  StoreCallWindowFields;

type CartRow = {
  id: string;
  customerPhone: string;
  callStatus: CallStatus;
  shopifyCreatedAt: Date | null;
  createdAt: Date;
};

function abandonmentMs(row: CartRow): number {
  return (row.shopifyCreatedAt ?? row.createdAt).getTime();
}

/** Newest abandonment first. Ties break on createdAt, then id. */
function compareNewestFirst(a: CartRow, b: CartRow): number {
  const abandoned = abandonmentMs(b) - abandonmentMs(a);
  if (abandoned !== 0) return abandoned;
  const created = b.createdAt.getTime() - a.createdAt.getTime();
  if (created !== 0) return created;
  return a.id < b.id ? 1 : -1;
}

/**
 * For each phone, keep the newest cart callable and mark every other cart that
 * is still waiting as SUPERSEDED so it is never scheduled. Already-started
 * calls are left as they are.
 */
export async function supersedeRepeatCarts(
  store: RepeatCartStore,
  phones: string[]
): Promise<number> {
  const uniquePhones = Array.from(
    new Set(phones.map((phone) => phone.trim()).filter(Boolean))
  );
  if (uniquePhones.length === 0) return 0;

  const carts = await db.abandonedCheckout.findMany({
    where: {
      storeDomain: store.storeDomain,
      customerPhone: { in: uniquePhones },
    },
    select: {
      id: true,
      customerPhone: true,
      callStatus: true,
      shopifyCreatedAt: true,
      createdAt: true,
    },
  });

  const byPhone = new Map<string, CartRow[]>();
  for (const cart of carts) {
    const group = byPhone.get(cart.customerPhone) ?? [];
    group.push(cart);
    byPhone.set(cart.customerPhone, group);
  }

  let superseded = 0;
  const now = new Date();
  const window = callWindowFromStore(store);

  for (const group of Array.from(byPhone.values())) {
    if (group.length < 2) continue;
    group.sort(compareNewestFirst);
    const winner = group[0];

    for (const cart of group.slice(1)) {
      if (cart.callStatus !== CallStatus.PENDING) continue;
      await db.abandonedCheckout.update({
        where: { id: cart.id },
        data: {
          callStatus: CallStatus.SUPERSEDED,
          callScheduled: false,
          autoCallExcluded: true,
          retryReason: null,
          supersededById: winner.id,
          lastError: "A newer cart from this number is being called instead",
        },
      });
      superseded++;
    }

    if (winner.callStatus === CallStatus.SUPERSEDED) {
      const abandonedAt = winner.shopifyCreatedAt ?? winner.createdAt;
      await db.abandonedCheckout.update({
        where: { id: winner.id },
        data: {
          callStatus: CallStatus.PENDING,
          callScheduled: store.autoCallsEnabled,
          autoCallExcluded: false,
          supersededById: null,
          retryReason: null,
          lastError: null,
          scheduledCallAt: computeScheduledCallAt(
            abandonedAt,
            store.callDelayMinutes,
            now,
            window
          ),
        },
      });
    }
  }

  return superseded;
}
