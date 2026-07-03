import type { Prisma } from "@prisma/client";
import { CallStatus, type Store } from "@prisma/client";
import { db } from "@/lib/db";
import {
  type LineItemRecord,
  mapWebhookLineItems,
  variantGidFromWebhook,
} from "@/lib/line-items";
import { normalizePhoneNumber } from "@/lib/phone";
import { resolveScheduledCallAt } from "@/lib/shopify-admin";
import { parseSheetUrl, sheetCsvCandidateUrls, toSheetCsvExportUrl } from "@/lib/sheet-url";

export const SHEET_HEADERS = [
  "timestamp_incoming_webhook",
  "request_id",
  "token",
  "drop_off_stage",
  "is_abandoned",
  "original_total_price",
  "total_price",
  "total_discount",
  "items_subtotal_price",
  "shipping_price",
  "shipping_title",
  "postpaid_price",
  "cart_items_count",
  "currency",
  "city",
  "email",
  "customer_name",
  "customer_phone",
  "source",
  "abc_url",
  "cart_items",
  "product_ids",
  "variant_ids",
  "skus",
  "item_urls",
  "item_images",
  "address",
  "pincode",
  "state",
  "country",
  "prepaid_discount_type",
  "prepaid_discount_value",
  "prepaid_discount_amount",
  "ip",
  "isp",
  "user_agent",
  "session_id",
  "c_id",
  "abc_email_sent",
  "created_at",
  "updated_at",
  "items_full_json",
] as const;

export interface ParsedSheetRow {
  requestId: string;
  customerPhone: string;
  customerEmail: string | null;
  customerName: string;
  cartValue: number;
  recoveryUrl: string;
  lineItems: LineItemRecord[];
  shopifyCreatedAt: Date | null;
  abandonedAt: Date | null;
  isAbandoned: boolean;
  dropOffStage: string;
  cartItemsSummary: string;
  shippingAddress: {
    address1: string;
    zip: string;
    province: string;
    countryCode: string;
    city: string;
  } | null;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n" || (char === "\r" && next === "\n")) {
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      if (char === "\r") i++;
      continue;
    }

    if (char === "\r") {
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

function rowToRecord(headers: string[], values: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    record[headers[i]] = values[i]?.trim() ?? "";
  }
  return record;
}

function parseBool(value: string): boolean {
  const v = value.trim().toUpperCase();
  return v === "TRUE" || v === "1" || v === "YES";
}

function parseRupee(value: string): number {
  const n = parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

function variantIdFromUrl(url: string | undefined): string {
  if (!url) return "";
  const match = url.match(/[?&]variant=(\d+)/);
  return match?.[1] ?? "";
}

function parseLineItemsFromSheet(record: Record<string, string>): LineItemRecord[] {
  const flatVariantIds = (record.variant_ids || "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const jsonRaw = record.items_full_json?.trim();
  if (jsonRaw) {
    try {
      const items = JSON.parse(jsonRaw) as Array<{
        id?: number | string;
        variant_id?: number | string;
        product_id?: number | string;
        title?: string;
        quantity?: number;
        price?: number;
        final_price?: number;
        sku?: string;
        url?: string;
      }>;
      if (Array.isArray(items) && items.length > 0) {
        return mapWebhookLineItems(
          items.map((item, index) => {
            let variantId =
              typeof item.variant_id === "number"
                ? item.variant_id
                : parseInt(String(item.variant_id ?? ""), 10) || undefined;

            if (!variantId) {
              variantId =
                parseInt(variantIdFromUrl(item.url), 10) ||
                parseInt(flatVariantIds[index] ?? flatVariantIds[0] ?? "", 10) ||
                undefined;
            }

            return {
              variant_id: variantId,
              product_id:
                typeof item.product_id === "number"
                  ? item.product_id
                  : parseInt(String(item.product_id ?? ""), 10) || undefined,
              title: item.title,
              quantity: item.quantity ?? 1,
              price:
                item.price != null
                  ? String(Number(item.price) / 100)
                  : item.final_price != null
                    ? String(Number(item.final_price) / 100)
                    : undefined,
            };
          })
        );
      }
    } catch {
      // fall through to flat columns
    }
  }

  const titles = (record.cart_items || "").split("|").map((s) => s.trim());

  return flatVariantIds.map((variantId, index) => {
    const gid = variantGidFromWebhook(variantId);
    return {
      variant_id: variantId,
      variant_gid: gid,
      title: titles[index] || titles[0] || record.cart_items || "",
      quantity: parseInt(record.cart_items_count || "1", 10) || 1,
      price: "",
    };
  });
}

export function parseSheetRow(record: Record<string, string>): ParsedSheetRow | null {
  const requestId = record.request_id?.trim();
  if (!requestId) return null;

  const phone = normalizePhoneNumber(record.customer_phone);
  if (!phone) return null;

  if (!parseBool(record.is_abandoned ?? "TRUE")) return null;

  const address1 = record.address?.trim();
  const shippingAddress = address1
    ? {
        address1,
        zip: record.pincode?.trim() || "",
        province: record.state?.trim() || "",
        countryCode: record.country?.trim() || "IN",
        city: record.city?.trim() || "",
      }
    : null;

  return {
    requestId,
    customerPhone: phone,
    customerEmail: record.email?.trim() || null,
    customerName: record.customer_name?.trim() || "",
    cartValue: parseRupee(record.total_price || record.items_subtotal_price || "0"),
    recoveryUrl: record.abc_url?.trim() || "",
    lineItems: parseLineItemsFromSheet(record),
    shopifyCreatedAt: parseDate(record.created_at || ""),
    abandonedAt: parseDate(record.updated_at || record.timestamp_incoming_webhook || ""),
    isAbandoned: true,
    dropOffStage: record.drop_off_stage?.trim() || "",
    cartItemsSummary: record.cart_items?.trim() || "",
    shippingAddress,
  };
}

async function tryFetchCsv(url: string): Promise<{ ok: boolean; text: string; status: number }> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "text/csv,text/plain,*/*" },
      cache: "no-store",
      redirect: "follow",
    });
    const text = await response.text();
    const isHtml = text.trimStart().startsWith("<");
    return { ok: response.ok && !isHtml, text, status: response.status };
  } catch {
    return { ok: false, text: "", status: 0 };
  }
}

export async function fetchSheetCsv(sheetUrl: string): Promise<string> {
  const trimmed = sheetUrl.trim();

  // If an explicit export/pub URL was saved, try it directly first.
  if (
    (trimmed.includes("/export?") || trimmed.includes("/pub?")) &&
    (trimmed.includes("format=csv") || trimmed.includes("output=csv"))
  ) {
    const result = await tryFetchCsv(trimmed);
    if (result.ok) return result.text;
  }

  // Otherwise derive the spreadsheet ID and try both formats.
  const parsed = parseSheetUrl(trimmed);
  if (!parsed) {
    throw new Error(
      "Invalid Google Sheets URL — paste a link like https://docs.google.com/spreadsheets/d/…/edit"
    );
  }

  const candidates = sheetCsvCandidateUrls(parsed.spreadsheetId, parsed.gid);
  for (const url of candidates) {
    const result = await tryFetchCsv(url);
    if (result.ok) return result.text;
  }

  throw new Error(
    "Could not fetch the Google Sheet as CSV. Make sure the sheet is shared as:\n" +
    '• "Anyone with the link" -> Viewer (for /export URL), or\n' +
    "• File -> Share -> Publish to web -> CSV (for /pub URL).\n" +
    `Tried: ${candidates.join(" and ")}`
  );
}

export function parseSheetCsv(text: string): ParsedSheetRow[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const expected = SHEET_HEADERS as readonly string[];

  const headerOk =
    headers.length >= expected.length &&
    expected.every((name, i) => headers[i] === name);

  if (!headerOk) {
    throw new Error(
      `Sheet header mismatch — expected ${expected.length} columns starting with request_id. Got: ${headers.slice(0, 5).join(", ")}…`
    );
  }

  const parsed: ParsedSheetRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const record = rowToRecord([...expected], rows[i]);
    const row = parseSheetRow(record);
    if (row) parsed.push(row);
  }

  return parsed;
}

export async function syncAbandonedCheckoutsFromSheet(
  store: Pick<Store, "storeDomain" | "sheetUrl" | "callDelayMinutes">
): Promise<{ synced: number; skipped: number }> {
  if (!store.sheetUrl?.trim()) {
    throw new Error("Sheet URL is not configured for this store");
  }

  const csv = await fetchSheetCsv(store.sheetUrl);
  const rows = parseSheetCsv(csv);

  let synced = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.lineItems.some((item) => item.variant_gid)) {
      skipped++;
      continue;
    }

    const checkoutToken = row.requestId;
    const existing = await db.abandonedCheckout.findUnique({
      where: { checkoutToken },
    });

    const referenceDate =
      row.abandonedAt ?? row.shopifyCreatedAt ?? new Date();
    const scheduledCallAt = resolveScheduledCallAt(
      existing,
      referenceDate,
      store.callDelayMinutes
    );

    const lineItemsJson = row.lineItems as unknown as Prisma.InputJsonValue;
    const userContext = JSON.stringify({
      source: "gokwik_sheet",
      drop_off_stage: row.dropOffStage,
      customer_name: row.customerName,
      cart_items_summary: row.cartItemsSummary,
      shipping_address: row.shippingAddress,
    });

    const lineItemsChanged =
      existing &&
      JSON.stringify(existing.lineItemsJson) !== JSON.stringify(row.lineItems);

    if (existing) {
      await db.abandonedCheckout.update({
        where: { id: existing.id },
        data: {
          customerPhone: row.customerPhone,
          customerEmail: row.customerEmail,
          cartValue: row.cartValue,
          recoveryUrl: row.recoveryUrl || existing.recoveryUrl,
          lineItemsJson,
          userContext,
          shopifyCreatedAt: row.shopifyCreatedAt ?? existing.shopifyCreatedAt,
          scheduledCallAt,
          callScheduled:
            existing.callScheduled || Boolean(row.customerPhone && scheduledCallAt),
          storeDomain: store.storeDomain,
          ...(lineItemsChanged
            ? { draftOrderId: "", draftOrderName: "" }
            : {}),
        },
      });
    } else {
      await db.abandonedCheckout.create({
        data: {
          checkoutToken,
          customerPhone: row.customerPhone,
          customerEmail: row.customerEmail,
          cartValue: row.cartValue,
          recoveryUrl: row.recoveryUrl,
          lineItemsJson,
          userContext,
          shopifyCreatedAt: row.shopifyCreatedAt,
          scheduledCallAt,
          callScheduled: Boolean(row.customerPhone),
          callStatus: CallStatus.PENDING,
          storeDomain: store.storeDomain,
        },
      });
    }

    synced++;
  }

  await db.store.update({
    where: { storeDomain: store.storeDomain },
    data: { lastSheetSyncAt: new Date() },
  });

  return { synced, skipped };
}
