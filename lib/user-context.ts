function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseUserContextJson(raw: string | null | undefined): Record<string, unknown> {
  if (!raw?.trim()) return {};
  try {
    return asRecord(JSON.parse(raw)) ?? {};
  } catch {
    return {};
  }
}

function nameFromParts(...parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
}

export function parseCustomerNameFromUserContext(
  userContext: string | null | undefined
): string {
  const parsed = parseUserContextJson(userContext);
  if (typeof parsed.customer_name === "string" && parsed.customer_name.trim()) {
    return parsed.customer_name.trim();
  }

  const address = asRecord(parsed.shipping_address);
  if (!address) return "";

  if (typeof address.name === "string" && address.name.trim()) {
    return address.name.trim();
  }

  return nameFromParts(
    typeof address.first_name === "string" ? address.first_name : undefined,
    typeof address.last_name === "string" ? address.last_name : undefined
  );
}

export function withCustomerName(
  userContext: string | null | undefined,
  name: string
): string {
  const parsed = parseUserContextJson(userContext);
  parsed.customer_name = name.trim();
  return JSON.stringify(parsed);
}

export function mergeIncomingUserContext(
  incomingContext: string,
  existingContext?: string | null
): string {
  const incoming = parseUserContextJson(incomingContext);
  const incomingName = parseCustomerNameFromUserContext(incomingContext);
  const existingName = parseCustomerNameFromUserContext(existingContext);
  incoming.customer_name = incomingName || existingName;
  return JSON.stringify(incoming);
}
