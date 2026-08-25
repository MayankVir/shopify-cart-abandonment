"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  assertStoreOwner,
  assertStoreAccess,
  getAuthUserId,
  getSignedInEmail,
  getStoreAccessRole,
  isCurrentUserAdmin,
  StoreAccessError,
} from "@/lib/store-access";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function revalidateTeamPaths() {
  revalidatePath("/dashboard/team");
  revalidatePath("/dashboard");
}

export interface StoreTeamMemberRow {
  id: string;
  clerkUserId: string;
  email: string;
  createdAt: string;
}

export interface StoreTeamInviteRow {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  isExpired: boolean;
}

export interface StoreTeamView {
  storeDomain: string;
  storeName: string | null;
  role: "owner" | "member" | "admin";
  ownerEmail: string | null;
  members: StoreTeamMemberRow[];
  pendingInvites: StoreTeamInviteRow[];
}

export interface PendingInviteForMeRow {
  id: string;
  storeDomain: string;
  storeName: string | null;
  invitedByEmail: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface StoreTeamActionResult {
  success: boolean;
  error?: string;
}

export async function getStoreTeam(
  storeDomain: string
): Promise<StoreTeamView | null> {
  let store;
  try {
    store = await assertStoreAccess(storeDomain);
  } catch {
    return null;
  }

  const userId = await getAuthUserId();
  if (!userId) return null;

  const admin = await isCurrentUserAdmin();
  const role = await getStoreAccessRole(store, userId, admin);
  if (!role) return null;

  const [members, owner] = await Promise.all([
    db.storeMember.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: "asc" },
    }),
    store.clerkUserId
      ? db.merchant.findUnique({
          where: { clerkUserId: store.clerkUserId },
          select: { email: true },
        })
      : null,
  ]);

  let pendingInvites: StoreTeamInviteRow[] = [];
  if (role === "owner" || role === "admin") {
    const invites = await db.storeInvite.findMany({
      where: {
        storeId: store.id,
        acceptedAt: null,
        declinedAt: null,
        revokedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });
    const now = Date.now();
    pendingInvites = invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      createdAt: invite.createdAt.toISOString(),
      expiresAt: invite.expiresAt.toISOString(),
      isExpired: invite.expiresAt.getTime() <= now,
    }));
  }

  return {
    storeDomain: store.storeDomain,
    storeName: store.name,
    role,
    ownerEmail: owner?.email ?? null,
    members: members.map((m) => ({
      id: m.id,
      clerkUserId: m.clerkUserId,
      email: m.email,
      createdAt: m.createdAt.toISOString(),
    })),
    pendingInvites,
  };
}

export async function listPendingInvitesForMe(): Promise<
  PendingInviteForMeRow[]
> {
  const email = await getSignedInEmail();
  if (!email) return [];

  const invites = await db.storeInvite.findMany({
    where: {
      email,
      acceptedAt: null,
      declinedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: {
      store: {
        select: {
          storeDomain: true,
          name: true,
          clerkUserId: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const ownerIds = Array.from(
    new Set(
      invites
        .map((invite) => invite.store.clerkUserId)
        .filter((id): id is string => Boolean(id))
    )
  );

  const merchants = ownerIds.length
    ? await db.merchant.findMany({
        where: { clerkUserId: { in: ownerIds } },
        select: { clerkUserId: true, email: true },
      })
    : [];
  const ownerEmailById = new Map(
    merchants.map((m) => [m.clerkUserId, m.email])
  );

  return invites.map((invite) => ({
    id: invite.id,
    storeDomain: invite.store.storeDomain,
    storeName: invite.store.name,
    invitedByEmail: invite.store.clerkUserId
      ? ownerEmailById.get(invite.store.clerkUserId) ?? null
      : null,
    createdAt: invite.createdAt.toISOString(),
    expiresAt: invite.expiresAt.toISOString(),
  }));
}

export async function getPendingInviteCountForMe(): Promise<number> {
  const email = await getSignedInEmail();
  if (!email) return 0;

  return db.storeInvite.count({
    where: {
      email,
      acceptedAt: null,
      declinedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
}

export async function createStoreInvite(
  storeDomain: string,
  rawEmail: string
): Promise<StoreTeamActionResult> {
  let store;
  try {
    store = await assertStoreOwner(storeDomain);
  } catch (error) {
    return {
      success: false,
      error: error instanceof StoreAccessError ? error.message : "Forbidden",
    };
  }

  const email = normalizeEmail(rawEmail);
  if (!EMAIL_RE.test(email)) {
    return { success: false, error: "Enter a valid email address" };
  }

  const ownerEmail = store.clerkUserId
    ? (
        await db.merchant.findUnique({
          where: { clerkUserId: store.clerkUserId },
          select: { email: true },
        })
      )?.email
    : null;
  if (ownerEmail && normalizeEmail(ownerEmail) === email) {
    return { success: false, error: "You already own this store" };
  }

  const existingMember = await db.storeMember.findFirst({
    where: { storeId: store.id, email },
  });
  if (existingMember) {
    return { success: false, error: "This person already has access" };
  }

  const userId = await getAuthUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);

  const existingInvite = await db.storeInvite.findUnique({
    where: { storeId_email: { storeId: store.id, email } },
  });

  if (existingInvite) {
    const isOpenAndValid =
      !existingInvite.acceptedAt &&
      !existingInvite.declinedAt &&
      !existingInvite.revokedAt &&
      existingInvite.expiresAt.getTime() > now.getTime();

    if (isOpenAndValid) {
      return { success: false, error: "Already invited — waiting on them to accept" };
    }

    await db.storeInvite.update({
      where: { id: existingInvite.id },
      data: {
        createdByClerkUserId: userId,
        expiresAt,
        acceptedAt: null,
        declinedAt: null,
        revokedAt: null,
      },
    });
  } else {
    await db.storeInvite.create({
      data: {
        storeId: store.id,
        email,
        createdByClerkUserId: userId,
        expiresAt,
      },
    });
  }

  revalidateTeamPaths();
  return { success: true };
}

export async function revokeStoreInvite(
  inviteId: string
): Promise<StoreTeamActionResult> {
  const invite = await db.storeInvite.findUnique({
    where: { id: inviteId },
    include: { store: true },
  });
  if (!invite) return { success: false, error: "Invite not found" };

  try {
    await assertStoreOwner(invite.store.storeDomain);
  } catch (error) {
    return {
      success: false,
      error: error instanceof StoreAccessError ? error.message : "Forbidden",
    };
  }

  await db.storeInvite.update({
    where: { id: inviteId },
    data: { revokedAt: new Date() },
  });

  revalidateTeamPaths();
  return { success: true };
}

export async function removeStoreMember(
  memberId: string
): Promise<StoreTeamActionResult> {
  const member = await db.storeMember.findUnique({
    where: { id: memberId },
    include: { store: true },
  });
  if (!member) return { success: false, error: "Member not found" };

  try {
    await assertStoreOwner(member.store.storeDomain);
  } catch (error) {
    return {
      success: false,
      error: error instanceof StoreAccessError ? error.message : "Forbidden",
    };
  }

  await db.storeMember.delete({ where: { id: memberId } });

  revalidateTeamPaths();
  return { success: true };
}

export async function acceptStoreInvite(
  inviteId: string
): Promise<StoreTeamActionResult> {
  const userId = await getAuthUserId();
  const email = await getSignedInEmail();
  if (!userId || !email) return { success: false, error: "Unauthorized" };

  const invite = await db.storeInvite.findUnique({
    where: { id: inviteId },
    include: { store: true },
  });
  if (!invite) return { success: false, error: "Invite not found" };

  if (invite.email !== email) {
    return {
      success: false,
      error: "This invite was sent to a different email address",
    };
  }
  if (invite.revokedAt) {
    return { success: false, error: "This invite was revoked by the owner" };
  }
  if (invite.declinedAt) {
    return { success: false, error: "This invite was already declined" };
  }
  if (invite.acceptedAt) {
    return { success: true };
  }
  if (invite.expiresAt.getTime() <= Date.now()) {
    return {
      success: false,
      error: "This invite expired. Ask the owner to send a new one.",
    };
  }
  if (invite.store.clerkUserId === userId) {
    return { success: false, error: "You already own this store" };
  }

  await db.$transaction([
    db.storeMember.upsert({
      where: {
        storeId_clerkUserId: { storeId: invite.storeId, clerkUserId: userId },
      },
      create: { storeId: invite.storeId, clerkUserId: userId, email },
      update: {},
    }),
    db.storeInvite.update({
      where: { id: inviteId },
      data: { acceptedAt: new Date() },
    }),
  ]);

  revalidateTeamPaths();
  return { success: true };
}

export async function declineStoreInvite(
  inviteId: string
): Promise<StoreTeamActionResult> {
  const email = await getSignedInEmail();
  if (!email) return { success: false, error: "Unauthorized" };

  const invite = await db.storeInvite.findUnique({ where: { id: inviteId } });
  if (!invite) return { success: false, error: "Invite not found" };
  if (invite.email !== email) {
    return {
      success: false,
      error: "This invite was sent to a different email address",
    };
  }

  await db.storeInvite.update({
    where: { id: inviteId },
    data: { declinedAt: new Date() },
  });

  revalidateTeamPaths();
  return { success: true };
}
