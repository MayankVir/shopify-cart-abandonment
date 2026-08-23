import type { Prisma } from "@prisma/client";
import { CallStatus, type Store } from "@prisma/client";
import { db } from "@/lib/db";
import {
  type LineItemRecord,
  lineItemsChanged,
  lineItemsHaveVariantId,
  mapWebhookLineItems,
  variantGidFromWebhook,
} from "@/lib/line-items";
import { normalizePhoneNumber } from "@/lib/phone";
import { nextCallScheduledFlag } from "@/lib/call-status";
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

export function parseCsv(text: string): string[][] {
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

export function rowToRecord(headers: string[], values: string[]): Record<string, string> {
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

function extractVariantIdToken(token: string): string {
  const trimmed = token
    .trim()
    .replace(/^['"`\[\]]+|['"`\[\]]+$/g, "")
    .trim();
  if (!trimmed) return "";
  const gid = trimmed.match(/gid:\/\/shopify\/ProductVariant\/(\d+)/i);
  if (gid) return gid[1];
  const fromUrl = variantIdFromUrl(trimmed);
  if (fromUrl) return fromUrl;
  if (/^\d+$/.test(trimmed)) return trimmed;
  return "";
}

/** Parse `123,456`, `[123, 456]`, `["123","456"]`, or GIDs into numeric variant IDs. */
export function parseVariantIdList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  let text = raw.trim();
  if (text.startsWith("'")) text = text.slice(1).trim();

  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) {
      const fromJson = parsed
        .flatMap((item) => {
          if (typeof item === "number" || typeof item === "string") {
            return [extractVariantIdToken(String(item))];
          }
          if (item && typeof item === "object") {
            const obj = item as Record<string, unknown>;
            const candidate =
              obj.variant_id ??
              obj.variantId ??
              obj.merchandiseId ??
              obj.admin_graphql_api_id ??
              obj.variant_gid;
            return [extractVariantIdToken(String(candidate ?? ""))];
          }
          return [];
        })
        .filter(Boolean);
      if (fromJson.length) return fromJson;
    }
  } catch {
    // not JSON — keep splitting
  }

  const ids = text
    .split(/[,;|]/)
    .map(extractVariantIdToken)
    .filter(Boolean);
  if (ids.length) return ids;

  // Don't scrape digits out of draft-order JSON / notes.
  if (text.startsWith("{") || /draftorder/i.test(text)) return [];

  const fallback: string[] = [];
  const digitRe = /\d{8,}/g;
  let match: RegExpExecArray | null = digitRe.exec(text);
  while (match) {
    fallback.push(match[0]);
    match = digitRe.exec(text);
  }
  return fallback;
}

function looksLikeDraftContext(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  const note = String(obj.note ?? "");
  return (
    /draftorder/i.test(note) ||
    (typeof obj.status === "string" &&
      !("line_items" in obj) &&
      !("items" in obj) &&
      !("variant_id" in obj) &&
      !("variantId" in obj))
  );
}

function collectVariantIdsFromRecord(record: Record<string, string>): string[] {
  const named = parseVariantIdList(
    record.variant_ids || record.variant_id || ""
  );
  if (named.length) return named;

  for (const [key, value] of Object.entries(record)) {
    if (!/variant/.test(key) || key.includes("json")) continue;
    const ids = parseVariantIdList(value);
    if (ids.length > 0) return ids;
  }
  return [];
}

function variantIdFromItem(item: Record<string, unknown>): string {
  const candidate =
    item.variant_id ??
    item.variantId ??
    item.merchandiseId ??
    item.admin_graphql_api_id ??
    item.variant_gid ??
    item.url;
  return extractVariantIdToken(String(candidate ?? ""));
}

function coerceItemsFullJson(raw: string): unknown {
  let text = raw.trim();
  if (text.startsWith("'")) text = text.slice(1).trim();
  try {
    let parsed: unknown = JSON.parse(text);
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        return parsed;
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

export function parseLineItemsFromSheet(record: Record<string, string>): LineItemRecord[] {
  const flatVariantIds = collectVariantIdsFromRecord(record);
  const jsonRaw = record.items_full_json?.trim();

  if (jsonRaw) {
    const parsed = coerceItemsFullJson(jsonRaw);
    if (!looksLikeDraftContext(parsed)) {
      const items = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object"
          ? ((parsed as { line_items?: unknown; items?: unknown }).line_items ??
            (parsed as { line_items?: unknown; items?: unknown }).items)
          : null;

      if (Array.isArray(items) && items.length > 0) {
        const allIds = items.every(
          (item) => typeof item === "number" || typeof item === "string"
        );
        if (allIds) {
          const ids = items
            .map((item) => extractVariantIdToken(String(item)))
            .filter(Boolean);
          if (ids.length) {
            return ids.map((variantId) => ({
              variant_id: variantId,
              variant_gid: variantGidFromWebhook(variantId),
              title: "",
              quantity: 1,
              price: "",
            }));
          }
        } else {
          const mapped = mapWebhookLineItems(
            items.map((item, index) => {
              const obj = (item && typeof item === "object" ? item : {}) as Record<
                string,
                unknown
              >;
              const variantId =
                variantIdFromItem(obj) ||
                flatVariantIds[index] ||
                flatVariantIds[0] ||
                "";
              const productId = obj.product_id ?? obj.productId;
              const price = obj.price ?? obj.final_price;
              return {
                variant_id: variantId ? Number(variantId) || undefined : undefined,
                variantId: variantId ? Number(variantId) || undefined : undefined,
                product_id:
                  typeof productId === "number"
                    ? productId
                    : parseInt(String(productId ?? ""), 10) || undefined,
                title: typeof obj.title === "string" ? obj.title : undefined,
                quantity:
                  typeof obj.quantity === "number"
                    ? obj.quantity
                    : parseInt(String(obj.quantity ?? "1"), 10) || 1,
                price:
                  price != null
                    ? String(
                        Number(price) > 1000 ? Number(price) / 100 : Number(price)
                      )
                    : undefined,
              };
            })
          );
          if (lineItemsHaveVariantId(mapped)) {
            return mapped;
          }
        }
      }

      const idsFromJson = parseVariantIdList(jsonRaw);
      if (idsFromJson.length) {
        return idsFromJson.map((variantId) => ({
          variant_id: variantId,
          variant_gid: variantGidFromWebhook(variantId),
          title: "",
          quantity: 1,
          price: "",
        }));
      }
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

export async function tryFetchCsv(url: string): Promise<{ ok: boolean; text: string; status: number }> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "text/csv,text/plain,*/*" },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
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
    | "storeDomain"
    | "sheetUrl"
    | "callDelayMinutes"
    | "sheetSyncDirection"
    | "autoCallsEnabled"
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

    const shouldClearDraft =
      Boolean(existing) &&
      lineItemsChanged(existing!.lineItemsJson, row.lineItems);

    if (existing) {
      if (shouldClearDraft && existing.draftOrderId) {
        console.info(
          "[sheet] clearing draftOrderId after line-item change",
          JSON.stringify({
            checkoutToken,
            previousDraftOrderId: existing.draftOrderId,
          })
        );
      }

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
          callScheduled: nextCallScheduledFlag(
            store.autoCallsEnabled,
            row.customerPhone || existing.customerPhone,
            existing
          ),
          storeDomain: store.storeDomain,
          ...(shouldClearDraft
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
          callScheduled: nextCallScheduledFlag(
            store.autoCallsEnabled,
            row.customerPhone
          ),
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
