import { db } from "@/lib/db";

/** Store owners can open Team and Drafts. Invited members stay MEMBER until granted. */
export async function grantStaffRole(clerkUserId: string): Promise<void> {
  await db.merchant.updateMany({
    where: { clerkUserId, role: { not: "STAFF" } },
    data: { role: "STAFF" },
  });
}
