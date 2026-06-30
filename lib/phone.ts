const E164_RE = /^\+[1-9]\d{7,14}$/;

export function normalizePhoneNumber(value: string | null | undefined): string {
  const cleaned = String(value || "")
    .trim()
    .replace(/[\s().-]/g, "");
  if (!cleaned) return "";
  const normalized = cleaned.startsWith("00")
    ? `+${cleaned.slice(2)}`
    : cleaned.startsWith("+")
      ? cleaned
      : cleaned.length === 10
        ? `+1${cleaned}`
        : `+${cleaned}`;
  return E164_RE.test(normalized) ? normalized : "";
}

export function maskPhone(value: string | null | undefined): string {
  const s = String(value || "").trim();
  return s.length > 4 ? `***${s.slice(-4)}` : "***";
}
