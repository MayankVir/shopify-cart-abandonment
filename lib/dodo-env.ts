export const dodoEnvironment =
  process.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode"
    ? "live_mode"
    : "test_mode";

export function isDodoConfigured(): boolean {
  return Boolean(process.env.DODO_PAYMENTS_API_KEY?.trim());
}

export function getDodoTopUpProductId(): string | null {
  const id = process.env.DODO_TOPUP_PRODUCT_ID?.trim();
  return id || null;
}

export function getAppUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.SHOPIFY_APP_URL?.trim() ||
    "http://localhost:3000";
  return url.replace(/\/$/, "");
}
