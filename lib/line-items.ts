export interface LineItemRecord {
  variant_id: string;
  variant_gid: string;
  product_id?: string;
  title: string;
  quantity: number;
  price?: string;
}

export function variantGidFromWebhook(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  const raw = String(value).trim();
  if (!raw) return "";
  if (raw.startsWith("gid://shopify/ProductVariant/")) return raw;
  if (/^\d+$/.test(raw)) return `gid://shopify/ProductVariant/${raw}`;
  return "";
}

export function mapWebhookLineItems(
  items: Array<{
    variant_id?: number;
    variantId?: number;
    product_id?: number;
    productId?: number;
    title?: string;
    quantity?: number;
    price?: string;
  }> | null | undefined
): LineItemRecord[] {
  return (items || []).map((item) => {
    const variantId = item.variant_id ?? item.variantId ?? "";
    const variantGid = variantGidFromWebhook(variantId);
    return {
      variant_id: String(variantId),
      variant_gid: variantGid,
      product_id: String(item.product_id ?? item.productId ?? ""),
      title: item.title || "",
      quantity: item.quantity || 1,
      price: item.price || "",
    };
  });
}

export function lineItemsHaveVariantId(items: LineItemRecord[]): boolean {
  return items.some((item) => item.variant_gid);
}

/** Stable compare for detecting real cart changes (ignores key order / extra fields). */
export function lineItemsFingerprint(
  items: LineItemRecord[] | unknown
): string {
  if (!Array.isArray(items)) return "[]";
  return JSON.stringify(
    (items as LineItemRecord[])
      .map((item) => ({
        variant_id: String(item?.variant_id ?? ""),
        variant_gid: String(item?.variant_gid ?? ""),
        quantity: Number(item?.quantity) || 1,
      }))
      .sort((a, b) =>
        `${a.variant_gid}:${a.variant_id}`.localeCompare(
          `${b.variant_gid}:${b.variant_id}`
        )
      )
  );
}

export function lineItemsChanged(
  previous: unknown,
  next: LineItemRecord[]
): boolean {
  return lineItemsFingerprint(previous) !== lineItemsFingerprint(next);
}

export function buildCartLinesFromRecords(items: LineItemRecord[]) {
  return items
    .map((item) => {
      if (!item.variant_gid) return null;
      const qty = parseInt(String(item.quantity || "1"), 10);
      return {
        merchandiseId: item.variant_gid,
        quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      };
    })
    .filter(Boolean) as Array<{ merchandiseId: string; quantity: number }>;
}
