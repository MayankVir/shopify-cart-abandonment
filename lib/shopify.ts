import { createHmac, timingSafeEqual } from "crypto";
import { decryptToken } from "./encryption";
import { normalizePhoneNumber } from "./phone";
import {
  buildCartLinesFromRecords,
  type LineItemRecord,
  lineItemsHaveVariantId,
} from "./line-items";

const STOREFRONT_API_VERSION = "2026-04";

export interface StorefrontCartLine {
  merchandiseId: string;
  quantity: number;
}

export interface StorefrontCartResult {
  cartId: string;
  checkoutUrl: string;
}

const CART_CREATE_MUTATION = `
mutation CartCreate($input: CartInput!) {
  cartCreate(input: $input) {
    cart {
      id
      checkoutUrl
    }
    userErrors {
      field
      message
    }
  }
}`;

export async function createStorefrontCart(
  storeDomain: string,
  storefrontToken: string,
  options: {
    lineItems?: LineItemRecord[];
    phone?: string;
    email?: string;
    countryCode?: string;
  } = {}
): Promise<StorefrontCartResult | null> {
  const token = resolveStorefrontToken(storefrontToken);
  const lines = buildCartLinesFromRecords(options.lineItems ?? []);

  if (!lines.length) {
    return null;
  }

  const buyerIdentity: Record<string, string> = {
    countryCode: options.countryCode || "IN",
  };
  const normalizedPhone = normalizePhoneNumber(options.phone);
  const normalizedEmail = String(options.email || "").trim();
  if (normalizedPhone) buyerIdentity.phone = normalizedPhone;
  if (normalizedEmail) buyerIdentity.email = normalizedEmail;

  const response = await fetch(
    `https://${storeDomain}/api/${STOREFRONT_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": token,
      },
      body: JSON.stringify({
        query: CART_CREATE_MUTATION,
        variables: {
          input: {
            lines,
            buyerIdentity,
          },
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Storefront API error: ${response.status} ${response.statusText}`
    );
  }

  const json = (await response.json()) as {
    data?: {
      cartCreate?: {
        cart?: { id: string; checkoutUrl: string };
        userErrors?: Array<{ field: string[]; message: string }>;
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join(", "));
  }

  const result = json.data?.cartCreate;
  const userErrors = result?.userErrors ?? [];
  if (userErrors.length) {
    throw new Error(userErrors.map((e) => e.message).join("; "));
  }

  const cart = result?.cart;
  if (!cart?.id) {
    throw new Error("Storefront cartCreate returned no cart id");
  }

  return {
    cartId: cart.id,
    checkoutUrl: cart.checkoutUrl || "",
  };
}

export function shouldCreateStorefrontCart(
  phone: string,
  lineItems: LineItemRecord[]
): boolean {
  if (!phone && !process.env.SHOPIFY_ALLOW_CART_WITHOUT_PHONE) {
    return false;
  }
  return lineItemsHaveVariantId(lineItems);
}

export function resolveStorefrontToken(
  encryptedOrPlainToken: string
): string {
  try {
    return decryptToken(encryptedOrPlainToken);
  } catch {
    return encryptedOrPlainToken;
  }
}

export interface CheckoutWebhookPayload {
  id?: number;
  token?: string;
  cart_token?: string;
  abandoned_checkout_url?: string;
  total_price?: string;
  currency?: string;
  email?: string | null;
  phone?: string | null;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
  customer?: { email?: string | null };
  billing_address?: { phone?: string | null } | null;
  shipping_address?: { phone?: string | null } | null;
  line_items?: Array<{
    variant_id?: number;
    variantId?: number;
    product_id?: number;
    quantity?: number;
    price?: string;
    title?: string;
  }>;
}

export function extractCheckoutToken(payload: CheckoutWebhookPayload): string {
  if (payload.token) {
    return payload.token.startsWith("CHECKOUT-")
      ? payload.token
      : `CHECKOUT-${payload.token}`;
  }
  if (payload.id) {
    return `CHECKOUT-${payload.id}`;
  }
  throw new Error("Missing checkout token in webhook payload");
}

export function extractPhoneNumber(payload: CheckoutWebhookPayload): string {
  const raw =
    payload.phone?.trim() ||
    payload.billing_address?.phone?.trim() ||
    payload.shipping_address?.phone?.trim() ||
    "";
  return normalizePhoneNumber(raw) || raw;
}

export function extractCheckoutEmail(payload: CheckoutWebhookPayload): string {
  return (
    String(payload.email || "").trim() ||
    String(payload.customer?.email || "").trim() ||
    ""
  );
}

export function extractCartValue(payload: CheckoutWebhookPayload): number {
  const total = parseFloat(payload.total_price ?? "0");
  return Number.isFinite(total) ? total : 0;
}

export function buildWebhookUserContext(
  payload: CheckoutWebhookPayload,
  phone: string,
  email: string,
  lineItems: LineItemRecord[]
): string {
  return JSON.stringify({
    source: "shopify_checkout_webhook",
    checkout_token: payload.token || "",
    cart_token: payload.cart_token || "",
    abandoned_checkout_url: payload.abandoned_checkout_url || "",
    email,
    phone,
    currency: payload.currency || "",
    variant_ids: lineItems.map((i) => i.variant_id).filter(Boolean),
    line_items: lineItems,
  });
}

export function verifyShopifyWebhookHmac(
  rawBody: string,
  hmacHeader: string | null,
  apiSecret: string
): boolean {
  if (!hmacHeader) return false;

  const digest = createHmac("sha256", apiSecret)
    .update(rawBody, "utf8")
    .digest("base64");

  try {
    const digestBuffer = Buffer.from(digest, "utf8");
    const headerBuffer = Buffer.from(hmacHeader, "utf8");
    if (digestBuffer.length !== headerBuffer.length) return false;
    return timingSafeEqual(digestBuffer, headerBuffer);
  } catch {
    return false;
  }
}

export function resolveApiSecret(encryptedOrPlainSecret: string): string {
  try {
    return decryptToken(encryptedOrPlainSecret);
  } catch {
    return encryptedOrPlainSecret;
  }
}
