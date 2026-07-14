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
import { parseSheetUrl, sheetGvizRangeUrl } from "@/lib/sheet-url";
import {
  SHEET_SYNC_DIRECTIONS,
  sheetRowRangeLabel,
  type SheetSyncDirectionValue,
} from "@/lib/sheet-sync-direction";

export const SHEET_SYNC_PAGE_SIZE = 10;

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
    address: string;
    pincode: string;
    state: string;
    country: string;
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

function columnIndexToLetter(index: number): string {
  let n = index;
  let result = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function sheetRangeForPage(
  page: number,
  pageSize: number,
  options: {
    direction: SheetSyncDirectionValue;
    totalDataRows?: number;
  }
): { range: string; includesHeader: boolean } | null {
  const lastCol = columnIndexToLetter(SHEET_HEADERS.length);
  const direction = options.direction;

  if (direction === SHEET_SYNC_DIRECTIONS.TOP) {
    const dataStartRow = 2 + page * pageSize;
    const dataEndRow = dataStartRow + pageSize - 1;

    if (page === 0) {
      return {
        range: `A1:${lastCol}${dataEndRow}`,
        includesHeader: true,
      };
    }

    return {
      range: `A${dataStartRow}:${lastCol}${dataEndRow}`,
      includesHeader: false,
    };
  }

  const totalDataRows = options.totalDataRows ?? 0;
  if (totalDataRows <= 0) {
    return null;
  }

  const totalPages = Math.ceil(totalDataRows / pageSize);
  if (page >= totalPages) {
    return null;
  }

  const pageIndexFromTop = totalPages - 1 - page;
  const dataStartRow = 2 + pageIndexFromTop * pageSize;
  const lastDataRow = 1 + totalDataRows;
  const dataEndRow = Math.min(dataStartRow + pageSize - 1, lastDataRow);

  return {
    range: `A${dataStartRow}:${lastCol}${dataEndRow}`,
    includesHeader: false,
  };
}

function countSheetDataRows(text: string, includesHeader: boolean): number {
  const rows = parseCsv(text);
  if (includesHeader) {
    return Math.max(0, rows.length - 1);
  }
  return rows.length;
}

export async function fetchSheetDataRowCount(sheetUrl: string): Promise<number> {
  const trimmed = sheetUrl.trim();
  const parsed = parseSheetUrl(trimmed);
  if (!parsed) {
    throw new Error(
      "Invalid Google Sheets URL — paste a link like https://docs.google.com/spreadsheets/d/…/edit"
    );
  }

  const url = sheetGvizRangeUrl(parsed.spreadsheetId, parsed.gid, "A2:A20000");
  const result = await tryFetchCsv(url);
  if (!result.ok) {
    throw new Error(
      "Could not read sheet row count. Make sure the sheet is shared as \"Anyone with the link can view\" or published to the web."
    );
  }

  return parseCsv(result.text).filter((row) =>
    row.some((cell) => cell.trim() !== "")
  ).length;
}

export async function fetchSheetCsvPage(
  sheetUrl: string,
  page = 0,
  pageSize = SHEET_SYNC_PAGE_SIZE,
  options: {
    direction?: SheetSyncDirectionValue;
    totalDataRows?: number;
  } = {}
): Promise<{ csv: string; includesHeader: boolean }> {
  const trimmed = sheetUrl.trim();
  const parsed = parseSheetUrl(trimmed);
  if (!parsed) {
    throw new Error(
      "Invalid Google Sheets URL — paste a link like https://docs.google.com/spreadsheets/d/…/edit"
    );
  }

  const direction = options.direction ?? SHEET_SYNC_DIRECTIONS.BOTTOM;
  let totalDataRows = options.totalDataRows;

  if (direction === SHEET_SYNC_DIRECTIONS.BOTTOM && totalDataRows == null) {
    totalDataRows = await fetchSheetDataRowCount(trimmed);
  }

  const rangeSpec = sheetRangeForPage(page, pageSize, {
    direction,
    totalDataRows,
  });

  if (!rangeSpec) {
    throw new Error("No more sheet rows to sync for this page.");
  }

  const { range, includesHeader } = rangeSpec;
  const url = sheetGvizRangeUrl(parsed.spreadsheetId, parsed.gid, range);
  const result = await tryFetchCsv(url);

  if (result.ok) {
    return { csv: result.text, includesHeader };
  }

  throw new Error(
    `Could not fetch sheet range ${range}. Make sure the sheet is shared as "Anyone with the link can view" or published to the web.`
  );
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

  const address = record.address?.trim();
  const shippingAddress = address
    ? {
        address,
        pincode: record.pincode?.trim() || "",
        state: record.state?.trim() || "",
        country: record.country?.trim() || "IN",
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

export function parseSheetCsv(
  text: string,
  options?: { dataOnly?: boolean }
): ParsedSheetRow[] {
  const rows = parseCsv(text);
  const expected = SHEET_HEADERS as readonly string[];
  const dataOnly = options?.dataOnly ?? false;

  let headers: string[];
  let dataStartIndex: number;

  if (dataOnly) {
    if (rows.length === 0) return [];
    headers = [...expected];
    dataStartIndex = 0;
  } else {
    if (rows.length < 2) return [];
    headers = rows[0].map((h) => h.trim().toLowerCase());
    dataStartIndex = 1;

    const headerOk =
      headers.length >= expected.length &&
      expected.every((name, i) => headers[i] === name);

    if (!headerOk) {
      throw new Error(
        `Sheet header mismatch — expected ${expected.length} columns starting with request_id. Got: ${headers.slice(0, 5).join(", ")}…`
      );
    }
  }

  const parsed: ParsedSheetRow[] = [];
  for (let i = dataStartIndex; i < rows.length; i++) {
    const record = rowToRecord([...expected], rows[i]);
    const row = parseSheetRow(record);
    if (row) parsed.push(row);
  }

  return parsed;
}

export async function fetchSheetCsv(sheetUrl: string): Promise<string> {
  const { csv } = await fetchSheetCsvPage(sheetUrl, 0, SHEET_SYNC_PAGE_SIZE);
  return csv;
}

export interface SheetSyncResult {
  synced: number;
  skipped: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  totalDataRows: number;
  rowRangeLabel: string;
  syncDirection: SheetSyncDirectionValue;
}

export async function syncAbandonedCheckoutsFromSheet(
  store: Pick<
    Store,
    "storeDomain" | "sheetUrl" | "callDelayMinutes" | "sheetSyncDirection"
  >,
  options: { page?: number; pageSize?: number } = {}
): Promise<SheetSyncResult> {
  if (!store.sheetUrl?.trim()) {
    throw new Error("Sheet URL is not configured for this store");
  }

  const page = options.page ?? 0;
  const pageSize = options.pageSize ?? SHEET_SYNC_PAGE_SIZE;
  const syncDirection =
    store.sheetSyncDirection === "TOP"
      ? SHEET_SYNC_DIRECTIONS.TOP
      : SHEET_SYNC_DIRECTIONS.BOTTOM;

  const totalDataRows = await fetchSheetDataRowCount(store.sheetUrl);

  const { csv, includesHeader } = await fetchSheetCsvPage(
    store.sheetUrl,
    page,
    pageSize,
    { direction: syncDirection, totalDataRows }
  );
  const rawRowCount = countSheetDataRows(csv, includesHeader);
  const rows = parseSheetCsv(csv, { dataOnly: !includesHeader });

  const totalPages = Math.ceil(Math.max(totalDataRows, 1) / pageSize);
  const hasMore = page + 1 < totalPages && rawRowCount > 0;

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

    const abandonedAt = row.abandonedAt ?? row.shopifyCreatedAt;
    const referenceDate = abandonedAt ?? new Date();
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
          shopifyCreatedAt: abandonedAt ?? existing.shopifyCreatedAt,
          scheduledCallAt,
          callScheduled: false,
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
          shopifyCreatedAt: abandonedAt,
          scheduledCallAt,
          callScheduled: false,
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

  return {
    synced,
    skipped,
    page,
    pageSize,
    hasMore,
    totalDataRows,
    rowRangeLabel: sheetRowRangeLabel(
      page,
      pageSize,
      totalDataRows,
      syncDirection
    ),
    syncDirection,
  };
}
