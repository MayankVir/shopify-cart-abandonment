export interface ShippingAddressFields {
  address: string;
  pincode: string;
  state: string;
  country: string;
  city?: string;
}

/** Prefer sheet keys; accept older Shopify-shaped keys already in DB. */
export function normalizeSheetShipping(
  raw: Record<string, string> | null | undefined
): ShippingAddressFields | null {
  if (!raw) return null;
  const address = (raw.address ?? raw.address1 ?? "").trim();
  if (!address) return null;
  return {
    address,
    pincode: (raw.pincode ?? raw.zip ?? "").trim(),
    state: (raw.state ?? raw.province ?? "").trim(),
    country: (raw.country ?? raw.countryCode ?? "IN").trim() || "IN",
    city: (raw.city ?? "").trim() || undefined,
  };
}

export function parseShippingAddressFromUserContext(
  userContext: string
): ShippingAddressFields | null {
  if (!userContext?.trim()) return null;
  try {
    const parsed = JSON.parse(userContext) as {
      shipping_address?: Record<string, string> | null;
    };
    return normalizeSheetShipping(parsed.shipping_address);
  } catch {
    return null;
  }
}

/** Concatenates address, pincode, state, country into one display string. */
export function formatShippingAddress(
  fields: {
    address?: string;
    pincode?: string;
    state?: string;
    country?: string;
  } | null
): string {
  if (!fields) return "";
  return [fields.address, fields.pincode, fields.state, fields.country]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

export function formatShippingAddressFromUserContext(userContext: string): string {
  return formatShippingAddress(parseShippingAddressFromUserContext(userContext));
}
