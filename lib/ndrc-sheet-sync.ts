import { CallStatus, type Store } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizePhoneNumber } from "@/lib/phone";
import { parseCsv, tryFetchCsv } from "@/lib/sheet-sync";
import { parseSheetUrl, sheetGvizRangeUrl } from "@/lib/sheet-url";

/**
 * NDRC sheets don't have a fixed column order like the abandoned-cart plugin
 * sheet, so we resolve columns by header name (case-insensitive, with a few
 * common aliases) instead of requiring an exact header match.
 */
const NDRC_COLUMN_ALIASES: Record<string, string[]> = {
  orderId: ["order_id", "orderid", "order id", "order_number", "order name", "name"],
  phone: ["customer_phone", "phone", "phone_number", "mobile", "mobile_number"],
  email: ["email", "customer_email"],
  orderValue: ["order_value", "total_price", "value", "amount", "order_amount"],
  attempts: [
    "attempts",
    "attempt",
    "delivery_attempts",
    "attempt_count",
    "no_of_attempts",
    "ndr_attempts",
  ],
  address: ["address", "shipping_address"],
  pincode: ["pincode", "zip", "postal_code", "zipcode"],
  state: ["state", "province"],
  country: ["country"],
  city: ["city"],
  courier: ["courier", "courier_name", "logistics_partner", "carrier"],
  awb: ["awb", "awb_number", "tracking_number", "tracking_id", "waybill"],
};

type NdrcColumnMap = Partial<Record<keyof typeof NDRC_COLUMN_ALIASES, number>>;

function buildColumnMap(headerRow: string[]): NdrcColumnMap {
  const normalized = headerRow.map((h) => h.trim().toLowerCase());
  const map: NdrcColumnMap = {};
  for (const key of Object.keys(NDRC_COLUMN_ALIASES) as Array<
    keyof typeof NDRC_COLUMN_ALIASES
  >) {
    const idx = normalized.findIndex((h) => NDRC_COLUMN_ALIASES[key].includes(h));
    if (idx !== -1) map[key] = idx;
  }
  return map;
}

function cell(row: string[], map: NdrcColumnMap, key: keyof typeof NDRC_COLUMN_ALIASES): string {
  const idx = map[key];
  if (idx == null) return "";
  return (row[idx] ?? "").trim();
}

export interface ParsedNdrcRow {
  orderId: string;
  customerPhone: string;
  customerEmail: string | null;
  orderValue: number;
  attempts: number;
  courierName: string;
  awbNumber: string;
  shippingAddress: {
    address: string;
    pincode: string;
    state: string;
    country: string;
    city: string;
  } | null;
}

function parseNdrcRow(row: string[], map: NdrcColumnMap): ParsedNdrcRow | null {
  const orderId = cell(row, map, "orderId");
  if (!orderId) return null;

  const phone = normalizePhoneNumber(cell(row, map, "phone"));
  if (!phone) return null;

  const address = cell(row, map, "address");
  const shippingAddress = address
    ? {
        address,
        pincode: cell(row, map, "pincode"),
        state: cell(row, map, "state"),
        country: cell(row, map, "country") || "IN",
        city: cell(row, map, "city"),
      }
    : null;

  const attempts = parseInt(cell(row, map, "attempts"), 10) || 0;
  const orderValue = parseFloat(cell(row, map, "orderValue").replace(/,/g, "")) || 0;

  return {
    orderId,
    customerPhone: phone,
    customerEmail: cell(row, map, "email") || null,
    orderValue,
    attempts,
    courierName: cell(row, map, "courier"),
    awbNumber: cell(row, map, "awb"),
    shippingAddress,
  };
}

export function parseNdrcSheetCsv(text: string): ParsedNdrcRow[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];

  const map = buildColumnMap(rows[0]);
  if (map.orderId == null || map.phone == null) {
    throw new Error(
      "Could not find order id / phone columns in the NDRC sheet. Expected headers like order_id, phone, attempts, address, pincode, state, country."
    );
  }

  const parsed: ParsedNdrcRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = parseNdrcRow(rows[i], map);
    if (row) parsed.push(row);
  }
  return parsed;
}

export interface NdrcSheetSyncResult {
  synced: number;
  skippedLowAttempts: number;
  skippedInvalid: number;
  totalRows: number;
}

export async function syncNdrcOrdersFromSheet(
  store: Pick<Store, "storeDomain" | "ndrcSheetUrl" | "ndrcMinAttempts">
): Promise<NdrcSheetSyncResult> {
  if (!store.ndrcSheetUrl?.trim()) {
    throw new Error("NDRC sheet URL is not configured for this store");
  }

  const parsed = parseSheetUrl(store.ndrcSheetUrl.trim());
  if (!parsed) {
    throw new Error(
      "Invalid Google Sheets URL — paste a link like https://docs.google.com/spreadsheets/d/…/edit"
    );
  }

  const url = sheetGvizRangeUrl(parsed.spreadsheetId, parsed.gid, "A1:Z20000");
  const result = await tryFetchCsv(url);
  if (!result.ok) {
    throw new Error(
      'Could not read the NDRC sheet. Make sure it is shared as "Anyone with the link can view" or published to the web.'
    );
  }

  const rawRows = parseCsv(result.text);
  const totalRows = Math.max(0, rawRows.length - 1);
  const rows = parseNdrcSheetCsv(result.text);
  const minAttempts = Math.max(1, store.ndrcMinAttempts || 1);

  let synced = 0;
  let skippedLowAttempts = 0;
  const skippedInvalid = totalRows - rows.length;

  for (const row of rows) {
    if (row.attempts < minAttempts) {
      skippedLowAttempts++;
      continue;
    }

    const userContext = JSON.stringify({
      source: "ndrc_sheet",
      shipping_address: row.shippingAddress,
    });

    await db.ndrcOrder.upsert({
      where: {
        storeDomain_orderId: {
          storeDomain: store.storeDomain,
          orderId: row.orderId,
        },
      },
      update: {
        customerPhone: row.customerPhone,
        customerEmail: row.customerEmail,
        orderValue: row.orderValue,
        attempts: row.attempts,
        courierName: row.courierName,
        awbNumber: row.awbNumber,
        userContext,
      },
      create: {
        storeDomain: store.storeDomain,
        orderId: row.orderId,
        customerPhone: row.customerPhone,
        customerEmail: row.customerEmail,
        orderValue: row.orderValue,
        attempts: row.attempts,
        courierName: row.courierName,
        awbNumber: row.awbNumber,
        userContext,
        callStatus: CallStatus.PENDING,
      },
    });
    synced++;
  }

  await db.store.update({
    where: { storeDomain: store.storeDomain },
    data: { lastNdrcSheetSyncAt: new Date() },
  });

  return { synced, skippedLowAttempts, skippedInvalid, totalRows };
}
