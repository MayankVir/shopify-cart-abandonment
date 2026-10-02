export const BILLING_CURRENCIES = ["INR", "USD", "GBP", "EUR"] as const;

export type BillingCurrency = (typeof BILLING_CURRENCIES)[number];

/**
 * Display rates: how many rupees equal one unit of the other currency.
 * Used only to show the same plan prices outside India.
 */
export const DISPLAY_INR_PER_UNIT: Record<BillingCurrency, number> = {
  INR: 1,
  USD: 84,
  GBP: 112,
  EUR: 98,
};

const EURO_COUNTRIES = new Set([
  "AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR",
  "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK",
]);

const TIME_ZONE_CURRENCY: Record<string, BillingCurrency> = {
  "Asia/Kolkata": "INR",
  "Asia/Calcutta": "INR",
  "Europe/London": "GBP",
  "Europe/Paris": "EUR",
  "Europe/Berlin": "EUR",
  "Europe/Madrid": "EUR",
  "Europe/Rome": "EUR",
  "Europe/Amsterdam": "EUR",
  "Europe/Brussels": "EUR",
  "Europe/Vienna": "EUR",
  "Europe/Dublin": "EUR",
  "Europe/Lisbon": "EUR",
  "Europe/Helsinki": "EUR",
  "Europe/Athens": "EUR",
};

export function currencyForCountry(country: string | null | undefined): BillingCurrency {
  const code = country?.trim().toUpperCase();
  if (!code || code === "XX") return "USD";
  if (code === "IN") return "INR";
  if (code === "GB") return "GBP";
  if (code === "US") return "USD";
  if (EURO_COUNTRIES.has(code)) return "EUR";
  return "USD";
}

export function currencyFromTimeZone(timeZone: string | null | undefined): BillingCurrency {
  if (!timeZone) return "USD";
  return TIME_ZONE_CURRENCY[timeZone] ?? "USD";
}

export function convertFromInr(amountInr: number, currency: BillingCurrency): number {
  if (currency === "INR") return amountInr;
  return amountInr / DISPLAY_INR_PER_UNIT[currency];
}

export function formatBillingMoney(
  amountInr: number,
  currency: BillingCurrency,
  fractionDigits?: number
): string {
  const converted = convertFromInr(amountInr, currency);
  const digits = fractionDigits ?? (currency === "INR" ? 0 : 0);
  const rounded = digits === 0 ? Math.round(converted) : Math.round(converted * 100) / 100;
  return new Intl.NumberFormat(localeFor(currency), {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(rounded);
}

function localeFor(currency: BillingCurrency): string {
  if (currency === "INR") return "en-IN";
  if (currency === "GBP") return "en-GB";
  if (currency === "EUR") return "en-IE";
  return "en-US";
}
