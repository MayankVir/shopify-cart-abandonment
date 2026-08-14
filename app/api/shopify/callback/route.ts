import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encryptToken } from "@/lib/encryption";
import { fetchShopName } from "@/lib/shopify-admin";
import { ensureMerchantForUser } from "@/lib/billing";
import { normalizeStoreDomain } from "@/lib/store-domain";

function decodeOAuthState(state: string): {
  userId: string;
  storeDomain: string;
} | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(state, "base64url").toString("utf8")
    ) as { userId?: string; storeDomain?: string };

    if (!parsed.userId || !parsed.storeDomain) return null;

    return {
      userId: parsed.userId,
      storeDomain: normalizeStoreDomain(parsed.storeDomain),
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const shop = searchParams.get("shop");
  const state = searchParams.get("state");

  if (!code || !shop || !state) {
    return NextResponse.json(
      { error: "Missing OAuth parameters" },
      { status: 400 }
    );
  }

  const oauthState = decodeOAuthState(state);
  if (!oauthState) {
    return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 });
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  const appUrl = process.env.SHOPIFY_APP_URL ?? "http://localhost:3000";

  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "Shopify OAuth not configured" },
      { status: 500 }
    );
  }

  const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: apiKey,
      client_secret: apiSecret,
      code,
    }),
  });

  if (!tokenResponse.ok) {
    return NextResponse.json(
      { error: "Failed to exchange OAuth code" },
      { status: 502 }
    );
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
  };

  const storeDomain = shop.replace(/^https?:\/\//, "").replace(/\/$/, "");

  if (oauthState.storeDomain !== storeDomain) {
    return NextResponse.json(
      { error: "OAuth state store mismatch" },
      { status: 400 }
    );
  }

  await ensureMerchantForUser(oauthState.userId);

  await db.store.upsert({
    where: { storeDomain },
    create: {
      storeDomain,
      clerkUserId: oauthState.userId,
      adminAccessToken: encryptToken(tokenData.access_token),
      storefrontToken: encryptToken(""),
    },
    update: {
      clerkUserId: oauthState.userId,
      adminAccessToken: encryptToken(tokenData.access_token),
    },
  });

  try {
    const shopName = await fetchShopName(storeDomain, tokenData.access_token);
    if (shopName) {
      await db.store.update({ where: { storeDomain }, data: { name: shopName } });
    }
  } catch (nameError) {
    console.warn(
      "Could not fetch shop name after OAuth connect:",
      nameError instanceof Error ? nameError.message : nameError
    );
  }

  const redirectUrl = new URL(`${appUrl}/dashboard/onboarding`);
  redirectUrl.searchParams.set("connected", "1");
  redirectUrl.searchParams.set("shop", storeDomain);

  return NextResponse.redirect(redirectUrl);
}
