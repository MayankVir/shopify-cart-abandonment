import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
  }).format(value);
}

export function formatShortUrl(url: string, maxLength = 48): string {
  try {
    const { host, pathname } = new URL(url);
    const compact = `${host}${pathname}`;
    if (compact.length <= maxLength) return compact;
    return `${compact.slice(0, maxLength - 1)}…`;
  } catch {
    if (url.length <= maxLength) return url;
    return `${url.slice(0, maxLength - 1)}…`;
  }
}

export function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}
