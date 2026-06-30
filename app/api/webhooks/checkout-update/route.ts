import { NextRequest, NextResponse } from "next/server";
import { CallStatus, CheckoutSyncMode, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  buildWebhookUserContext,
  extractCartValue,
  extractCheckoutEmail,
  extractCheckoutToken,
  extractPhoneNumber,
  resolveApiSecret,
  verifyShopifyWebhookHmac,
} from "@/lib/shopify";
import { mapWebhookLineItems } from "@/lib/line-items";
import { isActiveCall } from "@/lib/call-status";
import { resolveScheduledCallAt } from "@/lib/shopify-admin";
import {
  findStoreForWebhook,
  getLastWebhookDebug,
  normalizeStoreDomain,
  rememberShopDomainAlias,
  setLastWebhookDebug,
} from "@/lib/store-domain";

export async function POST(request: NextRequest) {
  const shopDomainHeader = request.headers.get("x-shopify-shop-domain");
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
  const webhookTopic = request.headers.get("x-shopify-topic");

  console.info(
    "[checkout-webhook] incoming",
    JSON.stringify({
      shop: shopDomainHeader,
      topic: webhookTopic,
      hasHmac: Boolean(hmacHeader),
    })
  );

  if (!shopDomainHeader) {
    return NextResponse.json(
      { error: "Missing x-shopify-shop-domain header" },
      { status: 400 }
    );
  }

  const shopDomain = normalizeStoreDomain(shopDomainHeader);
  const rawBody = await request.text();
  const registered = await db.store.findMany({ select: { storeDomain: true } });
  const registeredDomains = registered.map((s) => s.storeDomain);

  const store = await findStoreForWebhook(shopDomainHeader, rawBody, hmacHeader);
  if (!store) {
    const message =
      registeredDomains.length === 0
        ? `No store connected in this app. Connect ${shopDomain} under Manual Setup.`
        : hmacHeader
          ? `Webhook arrived as ${shopDomain} but your app has ${registeredDomains.join(", ")}. ` +
            `These can be the same Shopify store (different *.myshopify.com hosts). ` +
            `Add ${shopDomain} under Manual Setup → Alternate shop domains, and confirm the webhook signing secret ` +
            `(Settings → Notifications → key at bottom of page — not Dev Dashboard shpss_).`
          : `Webhook is from ${shopDomain} but could not match ${registeredDomains.join(", ")}. ` +
            `Add the domain as an alternate in Manual Setup.`;

    setLastWebhookDebug({
      at: new Date().toISOString(),
      receivedShopDomain: shopDomain,
      registeredDomains,
      status: "rejected_domain",
      message,
    });

    console.warn(
      "Webhook store lookup failed",
      JSON.stringify({
        received: shopDomainHeader,
        normalized: shopDomain,
        registered: registeredDomains,
      })
    );

    return NextResponse.json(
      {
        error: `Store not registered: ${shopDomain}`,
        hint: message,
        registeredDomains,
      },
      { status: 404 }
    );
  }

  if (store.checkoutSyncMode === CheckoutSyncMode.POLLING) {
    setLastWebhookDebug({
      at: new Date().toISOString(),
      receivedShopDomain: shopDomain,
      registeredDomains,
      status: "ignored",
      message:
        "Polling mode is active — checkout webhooks are acknowledged but not ingested.",
      matchedStoreDomain: store.storeDomain,
    });

    console.info(
      "[checkout-webhook] skipped (polling mode)",
      JSON.stringify({ shop: shopDomain, store: store.storeDomain })
    );

    return NextResponse.json({
      ok: true,
      action: "skipped",
      reason: "polling_mode_active",
    });
  }

  if (normalizeStoreDomain(shopDomainHeader) !== normalizeStoreDomain(store.storeDomain)) {
    await rememberShopDomainAlias(store, shopDomainHeader);
  }

  if (store.apiSecret) {
    const secret = resolveApiSecret(store.apiSecret);
    if (!verifyShopifyWebhookHmac(rawBody, hmacHeader, secret)) {
      const message =
        "Webhook HMAC failed. If the webhook was created under Shopify Admin → Settings → Notifications, " +
        "use the signing key shown at the bottom of that page (not the Dev Dashboard shpss_). " +
        "Re-save it in Manual Setup → Client Secret field.";

      setLastWebhookDebug({
        at: new Date().toISOString(),
        receivedShopDomain: shopDomain,
        registeredDomains,
        status: "rejected_hmac",
        message,
        matchedStoreDomain: store.storeDomain,
      });

      console.warn(
        "[checkout-webhook] HMAC rejected",
        JSON.stringify({ shop: shopDomain, store: store.storeDomain })
      );

      return NextResponse.json({ error: "Invalid webhook signature", hint: message }, { status: 401 });
    }
  }

  let payload: Parameters<typeof extractCheckoutToken>[0] & {
    completed_at?: string | null;
    created_at?: string;
    updated_at?: string;
    line_items?: Parameters<typeof mapWebhookLineItems>[0];
  };

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (payload.completed_at) {
    setLastWebhookDebug({
      at: new Date().toISOString(),
      receivedShopDomain: shopDomain,
      registeredDomains,
      status: "ignored",
      message: "Checkout already completed — ignored.",
      matchedStoreDomain: store.storeDomain,
    });
    return NextResponse.json({ ok: true, action: "ignored", reason: "completed" });
  }

  let checkoutToken: string;
  try {
    checkoutToken = extractCheckoutToken(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid payload" },
      { status: 422 }
    );
  }

  const incomingPhone = extractPhoneNumber(payload);
  const customerEmail = extractCheckoutEmail(payload) || null;
  const cartValue = extractCartValue(payload);
  const lineItems = mapWebhookLineItems(payload.line_items);
  const lineItemsJson = lineItems as unknown as Prisma.InputJsonValue;
  const userContext = buildWebhookUserContext(
    payload,
    incomingPhone,
    customerEmail || "",
    lineItems
  );
  const shopifyCreatedAt = payload.created_at
    ? new Date(payload.created_at)
    : payload.updated_at
      ? new Date(payload.updated_at)
      : new Date();

  const existing = await db.abandonedCheckout.findUnique({
    where: { checkoutToken },
  });

  const scheduledCallAt = resolveScheduledCallAt(
    existing,
    existing?.shopifyCreatedAt ?? shopifyCreatedAt,
    store.callDelayMinutes
  );

  if (existing && !incomingPhone) {
    setLastWebhookDebug({
      at: new Date().toISOString(),
      receivedShopDomain: shopDomain,
      registeredDomains,
      status: "ignored",
      message: "Duplicate webhook without phone — skipped.",
      matchedStoreDomain: store.storeDomain,
    });
    return NextResponse.json({
      ok: true,
      action: "skipped",
      reason: "Duplicate webhook without phone — loop prevention",
      checkoutToken,
    });
  }

  if (existing) {
    if (isActiveCall(existing.callStatus)) {
      return NextResponse.json({
        ok: true,
        action: "skipped",
        reason: "Call already in progress",
      });
    }

    const updated = await db.abandonedCheckout.update({
      where: { checkoutToken },
      data: {
        customerPhone: incomingPhone || existing.customerPhone,
        customerEmail: customerEmail ?? existing.customerEmail,
        cartValue: cartValue || existing.cartValue,
        recoveryUrl: payload.abandoned_checkout_url || existing.recoveryUrl,
        lineItemsJson: lineItems.length
          ? lineItemsJson
          : (existing.lineItemsJson as Prisma.InputJsonValue),
        userContext: userContext || existing.userContext,
        shopifyCreatedAt: existing.shopifyCreatedAt ?? shopifyCreatedAt,
        scheduledCallAt,
      },
    });

    setLastWebhookDebug({
      at: new Date().toISOString(),
      receivedShopDomain: shopDomain,
      registeredDomains,
      status: "accepted",
      message: `Updated checkout ${updated.checkoutToken}`,
      matchedStoreDomain: store.storeDomain,
    });

    return NextResponse.json({
      ok: true,
      action: "updated",
      checkout: { id: updated.id, checkoutToken: updated.checkoutToken },
    });
  }

  if (!incomingPhone && !customerEmail) {
    setLastWebhookDebug({
      at: new Date().toISOString(),
      receivedShopDomain: shopDomain,
      registeredDomains,
      status: "ignored",
      message: "No phone or email on checkout — ignored.",
      matchedStoreDomain: store.storeDomain,
    });
    return NextResponse.json({
      ok: true,
      action: "ignored",
      reason: "no contact info",
    });
  }

  const created = await db.abandonedCheckout.create({
    data: {
      checkoutToken,
      customerPhone: incomingPhone,
      customerEmail,
      cartValue,
      recoveryUrl: payload.abandoned_checkout_url ?? "",
      lineItemsJson,
      userContext,
      shopifyCreatedAt,
      scheduledCallAt,
      callScheduled: Boolean(incomingPhone),
      callStatus: CallStatus.PENDING,
      storeDomain: store.storeDomain,
    },
  });

  setLastWebhookDebug({
    at: new Date().toISOString(),
    receivedShopDomain: shopDomain,
    registeredDomains,
    status: "accepted",
    message: `Created checkout ${created.checkoutToken}`,
    matchedStoreDomain: store.storeDomain,
  });

  return NextResponse.json(
    {
      ok: true,
      action: "created",
      checkout: {
        id: created.id,
        checkoutToken: created.checkoutToken,
        customerPhone: created.customerPhone,
      },
    },
    { status: 201 }
  );
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/webhooks/checkout-update",
    method: "POST",
    requiredHeader: "x-shopify-shop-domain",
    lastWebhook: getLastWebhookDebug(),
  });
}
