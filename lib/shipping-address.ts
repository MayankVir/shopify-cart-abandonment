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

/** Shopify's MailingAddressInput shape (draftOrderCreate shippingAddress/billingAddress).
 * `provinceCode` is a region code (HR), not a name (Haryana). Invalid codes are
 * dropped silently — the rest of the address still saves, State stays blank. */
export interface MailingAddressInput {
  firstName?: string;
  lastName?: string;
  address1: string;
  address2?: string;
  city?: string;
  provinceCode?: string;
  zip?: string;
  countryCode: string;
  phone?: string;
}

function foldKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Shopify Admin `countries.json` codes for India — not always ISO 3166-2
 * (Chhattisgarh is CG not CT, Uttarakhand is UK not UT, Telangana is TS not TG). */
const IN_PROVINCE_CODE_BY_KEY: Record<string, string> = {
  an: "AN",
  "andaman": "AN",
  "andaman nicobar": "AN",
  "andaman and nicobar": "AN",
  "andaman and nicobar islands": "AN",
  ap: "AP",
  "andhra": "AP",
  "andhra pradesh": "AP",
  ar: "AR",
  "arunachal": "AR",
  "arunachal pradesh": "AR",
  as: "AS",
  assam: "AS",
  br: "BR",
  bihar: "BR",
  ch: "CH",
  chandigarh: "CH",
  cg: "CG",
  ct: "CG",
  chhattisgarh: "CG",
  chattisgarh: "CG",
  dn: "DN",
  "dadra": "DN",
  "dadra and nagar haveli": "DN",
  "dadra nagar haveli": "DN",
  dd: "DD",
  daman: "DD",
  diu: "DD",
  "daman and diu": "DD",
  "daman diu": "DD",
  dl: "DL",
  delhi: "DL",
  "new delhi": "DL",
  "nct of delhi": "DL",
  "nct delhi": "DL",
  ga: "GA",
  goa: "GA",
  gj: "GJ",
  gujarat: "GJ",
  hr: "HR",
  haryana: "HR",
  hariyana: "HR",
  harayana: "HR",
  hp: "HP",
  "himachal": "HP",
  "himachal pradesh": "HP",
  jk: "JK",
  "jammu": "JK",
  kashmir: "JK",
  "jammu and kashmir": "JK",
  "jammu kashmir": "JK",
  "j k": "JK",
  jh: "JH",
  jharkhand: "JH",
  jharkand: "JH",
  ka: "KA",
  karnataka: "KA",
  karnatak: "KA",
  kl: "KL",
  kerala: "KL",
  la: "LA",
  ladakh: "LA",
  ld: "LD",
  lakshadweep: "LD",
  mp: "MP",
  "madhya pradesh": "MP",
  mh: "MH",
  maharashtra: "MH",
  maharastra: "MH",
  mn: "MN",
  manipur: "MN",
  ml: "ML",
  meghalaya: "ML",
  mz: "MZ",
  mizoram: "MZ",
  nl: "NL",
  nagaland: "NL",
  or: "OR",
  od: "OR",
  odisha: "OR",
  orissa: "OR",
  py: "PY",
  puducherry: "PY",
  pondicherry: "PY",
  pondichery: "PY",
  pb: "PB",
  punjab: "PB",
  rj: "RJ",
  rajasthan: "RJ",
  sk: "SK",
  sikkim: "SK",
  tn: "TN",
  "tamil nadu": "TN",
  tamilnadu: "TN",
  ts: "TS",
  tg: "TS",
  telangana: "TS",
  tr: "TR",
  tripura: "TR",
  up: "UP",
  "uttar pradesh": "UP",
  uk: "UK",
  ut: "UK",
  ul: "UK",
  uttarakhand: "UK",
  uttaranchal: "UK",
  uttrakhand: "UK",
  wb: "WB",
  "west bengal": "WB",
  bengal: "WB",
};

export function resolveCountryCode(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "IN";
  const folded = foldKey(value).replace(/\s+/g, "");
  if (folded === "in" || folded === "ind" || folded === "india" || folded === "bharat") {
    return "IN";
  }
  if (/^[a-z]{2}$/i.test(value)) return value.toUpperCase();
  return value;
}

export function resolveProvinceCode(
  raw: string | undefined,
  countryCode: string
): string | undefined {
  const value = (raw ?? "").trim();
  if (!value) return undefined;

  if (countryCode === "IN") {
    return IN_PROVINCE_CODE_BY_KEY[foldKey(value)];
  }

  if (/^[a-z]{2}$/i.test(value)) return value.toUpperCase();
  return undefined;
}

/** Shopify caps address1/address2 at 255 chars each. Splits on the nearest
 * preceding space so we don't cut a word in half, and folds embedded
 * newlines (common in multi-line sheet cells) into a single line. */
const ADDRESS_LINE_MAX = 255;

function sanitizeAddressText(raw: string): string {
  return raw.replace(/[\r\n]+/g, ", ").replace(/\s{2,}/g, " ").trim();
}

export function splitAddressLines(raw: string): { address1: string; address2?: string } {
  const cleaned = sanitizeAddressText(raw);
  if (cleaned.length <= ADDRESS_LINE_MAX) {
    return { address1: cleaned };
  }

  const lastSpace = cleaned.lastIndexOf(" ", ADDRESS_LINE_MAX);
  const splitAt = lastSpace > 0 ? lastSpace : ADDRESS_LINE_MAX;
  return {
    address1: cleaned.slice(0, splitAt).trim(),
    address2: cleaned.slice(splitAt).trim().slice(0, ADDRESS_LINE_MAX),
  };
}

/** Splits a single "full name" sheet column into Shopify's separate fields.
 * Single-word names are duplicated into lastName so address labels don't
 * render with a blank surname. */
export function splitCustomerName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  const parts = trimmed.split(/\s+/);
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ") || parts[0],
  };
}

/** Builds the MailingAddressInput to send to Shopify's draftOrderCreate mutation.
 * Returns null when there's no address to send (no name-only address is possible
 * since Shopify has no separate "customer name" field on a draft order). */
export function toMailingAddressInput(
  fields: ShippingAddressFields | null | undefined,
  customerName?: string,
  phone?: string
): MailingAddressInput | null {
  if (!fields?.address?.trim()) return null;

  const { firstName, lastName } = splitCustomerName(customerName ?? "");
  const { address1, address2 } = splitAddressLines(fields.address);
  const countryCode = resolveCountryCode(fields.country);
  const provinceCode = resolveProvinceCode(fields.state, countryCode);

  if (fields.state?.trim() && countryCode === "IN" && !provinceCode) {
    throw new Error(
      `Unknown Indian state "${fields.state.trim()}" — Shopify provinceCode needs HR, not Haryana`
    );
  }

  return {
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    address1,
    ...(address2 ? { address2 } : {}),
    ...(fields.city?.trim() ? { city: fields.city.trim() } : {}),
    ...(provinceCode ? { provinceCode } : {}),
    ...(fields.pincode?.trim() ? { zip: fields.pincode.trim() } : {}),
    countryCode,
    ...(phone?.trim() ? { phone: phone.trim() } : {}),
  };
}
