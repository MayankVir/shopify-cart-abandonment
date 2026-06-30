import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encryptToken } from "@/lib/encryption";

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

  await db.store.upsert({
    where: { storeDomain },
    create: {
      storeDomain,
      adminAccessToken: encryptToken(tokenData.access_token),
      storefrontToken: encryptToken(""),
    },
    update: {
      adminAccessToken: encryptToken(tokenData.access_token),
    },
  });

  return NextResponse.redirect(`${appUrl}/dashboard/onboarding?connected=1`);
}
