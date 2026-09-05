import { cache } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { isAdminEmail } from "@/lib/admin-gate";

function firstEmail(value: unknown): string | null {
  if (typeof value === "string" && value.includes("@")) {
    return value.trim().toLowerCase();
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const email = firstEmail(item);
      if (email) return email;
    }
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return (
      firstEmail(record.email) ??
      firstEmail(record.emailAddress) ??
      firstEmail(record.email_address) ??
      firstEmail(record.primary_email_address)
    );
  }
  return null;
}

function emailFromSessionClaims(claims: unknown): string | null {
  if (!claims || typeof claims !== "object") return null;
  const record = claims as Record<string, unknown>;
  return (
    firstEmail(record.email) ??
    firstEmail(record.emailAddress) ??
    firstEmail(record.primary_email_address) ??
    firstEmail(record.email_addresses)
  );
}

async function emailFromClerkApi(): Promise<string | null> {
  const user = await currentUser();
  const email =
    user?.emailAddresses.find((entry) => entry.id === user.primaryEmailAddressId)
      ?.emailAddress ?? user?.emailAddresses[0]?.emailAddress;
  return email ? email.trim().toLowerCase() : null;
}

/** Local JWT only. Fast. Email is present only if the Clerk session token includes it. */
export const getAuthState = cache(async () => {
  const { userId, sessionClaims } = await auth();
  return {
    userId: userId ?? null,
    emailFromJwt: emailFromSessionClaims(sessionClaims),
  };
});

/**
 * Request-scoped. Prefers the session JWT (no network). Falls back to
 * `currentUser()` once per request if the token has no email claim.
 */
export const getSignedInEmail = cache(async (): Promise<string | null> => {
  const { emailFromJwt } = await getAuthState();
  if (emailFromJwt) return emailFromJwt;
  return emailFromClerkApi();
});

export const isCurrentUserAdmin = cache(async (): Promise<boolean> => {
  const { emailFromJwt } = await getAuthState();
  if (emailFromJwt) return isAdminEmail(emailFromJwt);
  return isAdminEmail(await getSignedInEmail());
});
