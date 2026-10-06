import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fetchShopBestsellers, type ShopBestseller } from "@/lib/shopify-admin";

export interface StoreCatalog {
  currency: string | null;
  bestsellers: ShopBestseller[];
}

export function mergeStoreCatalog(
  existing: Prisma.JsonValue,
  catalog: StoreCatalog
): Prisma.InputJsonValue {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, Prisma.JsonValue>) }
      : {};
  return { ...base, catalog };
}

/** Writes bestsellers only after the products query succeeds. A missing scope throws and leaves the store unchanged. */
export async function rememberStoreCatalog(
  storeDomain: string,
  adminAccessToken: string,
  currency: string | null
): Promise<void> {
  const bestsellers = await fetchShopBestsellers(storeDomain, adminAccessToken, currency);
  const store = await db.store.findUnique({
    where: { storeDomain },
    select: { voicePromptJson: true },
  });
  if (!store) return;

  await db.store.update({
    where: { storeDomain },
    data: {
      voicePromptJson: mergeStoreCatalog(store.voicePromptJson, { currency, bestsellers }),
    },
  });
}

/** Extra agent context. Empty until a product fetch has succeeded for this store. */
export function catalogAgentNote(voicePromptJson: Prisma.JsonValue): string {
  if (!voicePromptJson || typeof voicePromptJson !== "object" || Array.isArray(voicePromptJson)) {
    return "";
  }
  const catalog = (voicePromptJson as { catalog?: StoreCatalog }).catalog;
  if (!catalog?.bestsellers?.length) return "";

  const lines = catalog.bestsellers.map((item) => {
    const price = item.price ? ` — ${item.price}` : "";
    return `${item.name}${price} (${item.handle})`;
  });
  const currency = catalog.currency ? `Store currency: ${catalog.currency}. ` : "";
  return `${currency}Bestsellers: ${lines.join("; ")}.`;
}
