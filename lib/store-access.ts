import { auth, currentUser } from "@clerk/nextjs/server";
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

export type StoreAccessRole = "owner" | "member" | "admin";

export async function getAuthUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

export async function getSignedInEmail(): Promise<string | null> {
  const user = await currentUser();
  const email =
    user?.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
      ?.emailAddress ?? user?.emailAddresses[0]?.emailAddress;
  return email ? email.trim().toLowerCase() : null;
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const email = await getSignedInEmail();
  return isAdminEmail(email);
}

const storeDashboardSelect = {
  id: true,
  storeDomain: true,
  name: true,
  ttaiScenarioId: true,
  ttaiTrunkId: true,
  createdAt: true,
  clerkUserId: true,
} as const;

export async function getStoresForUser(userId: string) {
  const stores = await db.store.findMany({
    where: {
      OR: [
        { clerkUserId: userId },
        { members: { some: { clerkUserId: userId } } },
      ],
    },
    select: storeDashboardSelect,
    orderBy: { createdAt: "desc" },
  });

  return stores.map(({ clerkUserId, ...store }) => ({
    ...store,
    isOwner: clerkUserId === userId,
  }));
}

async function userIsStoreMember(
  storeId: string,
  userId: string
): Promise<boolean> {
  const member = await db.storeMember.findUnique({
    where: {
      storeId_clerkUserId: { storeId, clerkUserId: userId },
    },
    select: { id: true },
  });
  return Boolean(member);
}

export async function getStoreAccessRole(
  store: Pick<Store, "id" | "clerkUserId">,
  userId: string,
  isAdmin: boolean
): Promise<StoreAccessRole | null> {
  if (isAdmin) return "admin";
  if (store.clerkUserId === userId) return "owner";
  if (await userIsStoreMember(store.id, userId)) return "member";
  return null;
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
  const role = await getStoreAccessRole(store, userId, admin);
  if (!role) {
    throw new StoreAccessError("You do not have access to this store");
  }

  return store;
}

export async function assertStoreOwner(storeDomain: string): Promise<Store> {
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
  if (admin) return store;
  if (store.clerkUserId !== userId) {
    throw new StoreAccessError("Only the store owner can do this");
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
  const role = await getStoreAccessRole(store, userId, admin);
  if (!role) {
    throw new StoreAccessError("You do not have access to this store");
  }

  return store;
}

export async function guardStoreAccess(
  storeDomain: string
): Promise<string | null> {
  try {
    await assertStoreAccess(storeDomain);
    return null;
  } catch (error) {
    return error instanceof StoreAccessError ? error.message : "Forbidden";
  }
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

export async function isStoreOwnedBySomeoneElse(
  storeDomain: string,
  userId: string
): Promise<boolean> {
  const existing = await db.store.findUnique({
    where: { storeDomain: normalizeStoreDomain(storeDomain) },
    select: { clerkUserId: true },
  });
  return Boolean(existing?.clerkUserId && existing.clerkUserId !== userId);
}

export const STORE_OWNED_ELSEWHERE_MESSAGE =
  "This store is already connected to another account. Ask the owner to invite you from Team.";
