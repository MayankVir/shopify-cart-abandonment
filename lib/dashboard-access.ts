import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin-gate";
import { getAuthState, getSignedInEmail } from "@/lib/clerk-user";

export interface DashboardAccess {
  userId: string;
  hasWorkspace: boolean;
  onboardingSkipped: boolean;
  /** Team and Drafts. Store owners, staff, and platform admins. */
  canSeeTeamAndDrafts: boolean;
  isPlatformAdmin: boolean;
  pendingInviteCount: number;
}

const WORKSPACE_PREFIXES = [
  "/dashboard/analytics",
  "/dashboard/recovery",
  "/dashboard/ndrc",
  "/dashboard/logs",
  "/dashboard/billing",
  "/dashboard/team",
  "/dashboard/drafts",
  "/dashboard/admin",
];

export async function getDashboardAccess(): Promise<DashboardAccess | null> {
  const { userId } = await getAuthState();
  if (!userId) return null;

  const email = await getSignedInEmail();
  const isPlatformAdmin = isAdminEmail(email);

  const [merchant, ownedCount, memberCount, pendingInviteCount] =
    await Promise.all([
      db.merchant.findUnique({
        where: { clerkUserId: userId },
        select: { role: true, onboardingSkippedAt: true },
      }),
      db.store.count({ where: { clerkUserId: userId } }),
      db.storeMember.count({ where: { clerkUserId: userId } }),
      email
        ? db.storeInvite.count({
            where: {
              email,
              acceptedAt: null,
              declinedAt: null,
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
          })
        : Promise.resolve(0),
    ]);

  const hasWorkspace = ownedCount > 0 || memberCount > 0;

  return {
    userId,
    hasWorkspace,
    onboardingSkipped: Boolean(merchant?.onboardingSkippedAt),
    canSeeTeamAndDrafts:
      isPlatformAdmin || merchant?.role === "STAFF" || ownedCount > 0,
    isPlatformAdmin,
    pendingInviteCount,
  };
}

export function workspaceHome(access: DashboardAccess): string {
  if (access.hasWorkspace || access.isPlatformAdmin) return "/dashboard/recovery";
  return access.onboardingSkipped
    ? "/dashboard/welcome"
    : "/dashboard/onboarding";
}

export function enforceDashboardPath(
  pathname: string,
  access: DashboardAccess
): void {
  const path = pathname.split("?")[0] || "/dashboard";

  if (path === "/dashboard") {
    redirect(workspaceHome(access));
  }

  if (
    (path === "/dashboard/welcome" || path.startsWith("/dashboard/welcome/")) &&
    (access.hasWorkspace || access.isPlatformAdmin)
  ) {
    redirect("/dashboard/recovery");
  }

  const needsWorkspace = WORKSPACE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
  const lockedOut = !access.hasWorkspace && !access.isPlatformAdmin;

  if (needsWorkspace && lockedOut) {
    redirect(
      access.onboardingSkipped ? "/dashboard/welcome" : "/dashboard/onboarding"
    );
  }

  const staffOnly =
    path.startsWith("/dashboard/team") || path.startsWith("/dashboard/drafts");
  if (staffOnly && !access.canSeeTeamAndDrafts) {
    redirect(lockedOut ? "/dashboard/welcome" : "/dashboard/recovery");
  }
}

export async function requireTeamAndDrafts(): Promise<DashboardAccess> {
  const access = await getDashboardAccess();
  if (!access) redirect("/sign-in");
  if (!access.canSeeTeamAndDrafts) {
    redirect(access.hasWorkspace ? "/dashboard/recovery" : "/dashboard/welcome");
  }
  return access;
}
