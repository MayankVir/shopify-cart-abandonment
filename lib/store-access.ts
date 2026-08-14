import { auth } from "@clerk/nextjs/server";
import { currentUser } from "@clerk/nextjs/server";
import type { Store } from "@prisma/client";
import { db } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin-gate";
import { normalizeStoreDomain } from "@/lib/store-domain";

export class StoreAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreAccessError";
  }
}

export async function getAuthUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const user = await currentUser();
  const email =
    user?.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
      ?.emailAddress ?? user?.emailAddresses[0]?.emailAddress;
  return isAdminEmail(email);
}

export async function getStoresForUser(userId: string) {
  return db.store.findMany({
    where: { clerkUserId: userId },
    select: {
      id: true,
      storeDomain: true,
      name: true,
      ttaiScenarioId: true,
      ttaiTrunkId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function assertStoreAccess(
  storeDomain: string
): Promise<Store> {
  const { userId } = await auth();
  if (!userId) {
    throw new StoreAccessError("Unauthorized");
  }

  const normalized = normalizeStoreDomain(storeDomain);
  const store = await db.store.findUnique({
    where: { storeDomain: normalized },
  });

  if (!store) {
    throw new StoreAccessError("Store not found");
  }

  const admin = await isCurrentUserAdmin();
  if (!admin && store.clerkUserId !== userId) {
    throw new StoreAccessError("You do not have access to this store");
  }

  return store;
}

export async function assertStoreAccessById(storeId: string): Promise<Store> {
  const { userId } = await auth();
  if (!userId) {
    throw new StoreAccessError("Unauthorized");
  }

  const store = await db.store.findUnique({ where: { id: storeId } });
  if (!store) {
    throw new StoreAccessError("Store not found");
  }

  const admin = await isCurrentUserAdmin();
  if (!admin && store.clerkUserId !== userId) {
    throw new StoreAccessError("You do not have access to this store");
  }

  return store;
}

export async function getMerchantForStore(storeDomain: string) {
  const store = await assertStoreAccess(storeDomain);
  if (!store.clerkUserId) {
    throw new StoreAccessError("Store has no owner assigned");
  }

  return db.merchant.findUnique({
    where: { clerkUserId: store.clerkUserId },
  });
}
