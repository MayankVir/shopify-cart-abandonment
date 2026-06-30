const REQUIRED_ADMIN_SCOPES = [
  "read_orders",
] as const;

export function getRequiredAdminScopes(): readonly string[] {
  return REQUIRED_ADMIN_SCOPES;
}

export function isAbandonedCheckoutAccessError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("abandonedcheckouts") ||
    lower.includes("read_orders") ||
    lower.includes("manage_abandoned_checkouts")
  );
}

export const PROTECTED_CUSTOMER_DATA_HELP = [
  "Partner / dev apps: scopes on the app version alone are not enough for Admin API poll.",
  "Also request Protected customer data: Partner Dashboard → App → API access requests →",
  "Protected customer data access → Request access → select Name, Email, Phone, Address (App functionality).",
  "Docs: https://shopify.dev/docs/apps/launch/protected-customer-data",
].join(" ");

export const WEBHOOK_INGEST_HELP =
  "Shopify Admin → Settings → Notifications → Webhooks → Create webhook → Event: Checkout update → URL: your-app/api/webhooks/checkout-update";

export function describePollBlockedWhenScopesPresent(granted: string[]): string {
  const hasOrders = granted.includes("read_orders");
  return [
    hasOrders
      ? "Your shpat_ token already has read_orders — the app version scopes are fine."
      : "Token scope check passed.",
    "Shopify still blocks abandonedCheckouts Admin API poll (misleading error mentions read_orders).",
    "Abandoned checkouts are protected customer data — Partner apps need a separate API access request.",
    PROTECTED_CUSTOMER_DATA_HELP,
    "Apps Script avoided this entirely via checkout webhooks (no Admin poll).",
    WEBHOOK_INGEST_HELP,
  ].join(" ");
}

export function formatShopifyAccessError(raw: string): string {
  if (!isAbandonedCheckoutAccessError(raw)) {
    return raw;
  }

  return [
    "Shopify blocked the optional Admin API poll.",
    "If read_orders is already on your app version, this is usually Protected customer data — not missing scopes.",
    PROTECTED_CUSTOMER_DATA_HELP,
    "Use checkout webhooks instead — same as Apps Script:",
    WEBHOOK_INGEST_HELP,
  ].join(" ");
}

export function missingScopesMessage(granted: string[]): string | null {
  const missing = REQUIRED_ADMIN_SCOPES.filter((s) => !granted.includes(s));
  if (missing.length === 0) return null;
  return [
    `Admin API token (shpat_) is missing: ${missing.join(", ")}.`,
    "Enable under Configuration → Admin API integration (NOT Storefront API).",
    "Or skip polling entirely and use checkout webhooks like Apps Script.",
  ].join(" ");
}
