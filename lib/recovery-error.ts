/** Strip Shopify HTML error pages down to a short reason for logs and the UI. */
export function sanitizeRecoveryError(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";

  const title = raw
    .match(/<title>([^<]+)<\/title>/i)?.[1]
    ?.replace(/^\d+\s*-\s*/, "")
    .trim();
  if (title) return title;

  if (raw.includes("<")) {
    const text = raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 280);
  }

  return raw.trim().slice(0, 280);
}
