import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getSignedInEmail } from "@/lib/clerk-user";

function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const adminEmails = getAdminEmails();
  return adminEmails.includes(email.trim().toLowerCase());
}

export async function requireAdmin(): Promise<{
  userId: string;
  email: string;
}> {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const email = await getSignedInEmail();

  if (!isAdminEmail(email)) {
    redirect("/dashboard/analytics?error=unauthorized");
  }

  return { userId, email: email! };
}

export async function requireAuth(): Promise<{ userId: string }> {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  return { userId };
}
