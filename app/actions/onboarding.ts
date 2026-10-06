"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensureMerchantForUser } from "@/lib/billing";
import { getAuthState, getSignedInEmail } from "@/lib/clerk-user";
import { db } from "@/lib/db";

export async function skipOnboarding(): Promise<void> {
  const { userId } = await getAuthState();
  if (!userId) redirect("/sign-in");

  const email = await getSignedInEmail();
  await ensureMerchantForUser(userId, email);
  await db.merchant.update({
    where: { clerkUserId: userId },
    data: { onboardingSkippedAt: new Date() },
  });

  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/welcome");
}
