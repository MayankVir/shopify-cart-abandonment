/** Admin API scopes requested on Install / Connect Shopify. */
export const SHOPIFY_OAUTH_SCOPES = [
  "read_orders",
  "read_customers",
  "read_checkouts",
  "write_checkouts",
  "read_products",
] as const;

export function shopifyOAuthScopeString(): string {
  const fromEnv = process.env.SHOPIFY_SCOPES?.trim();
  if (fromEnv) return fromEnv;
  return SHOPIFY_OAUTH_SCOPES.join(",");
}
