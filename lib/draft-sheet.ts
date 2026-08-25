import { lineItemsHaveVariantId } from "@/lib/line-items";
import {
  columnIndexToA1,
  getSheetTitleByGid,
  isGoogleSheetsWriteConfigured,
  readSheetValues,
  writeSheetCells,
} from "@/lib/google-sheets";
import { normalizePhoneNumber } from "@/lib/phone";
import {
  parseCsv,
  parseLineItemsFromSheet,
  rowToRecord,
  tryFetchCsv,
} from "@/lib/sheet-sync";
import { parseSheetUrl, sheetGvizRangeUrl } from "@/lib/sheet-url";
import {
  createDraftOrderForStore,
  getDraftOrderContextForStore,
  serializeDraftOrderContext,
} from "@/lib/shopify-draft-orders";
import { normalizeSheetShipping } from "@/lib/shipping-address";
import type { Store } from "@prisma/client";

export const DRAFT_REQUIRED_COLUMNS = [
  "request_id",
  "is_abandoned",
  "customer_phone",
  "address",
  "pincode",
  "state",
  "city",
  "customer_name",
] as const;

/** Per-row fields that must have a non-blank value or the row is skipped
 * rather than sent to Shopify without them. `city` is intentionally excluded —
 * it's a real column requirement above, but individual rows can legitimately
 * have it blank (unlike address/pincode/state/customer_name). */
export const DRAFT_ROW_REQUIRED_FIELDS = [
  "address",
  "pincode",
  "state",
  "customer_name",
] as const;

export const DRAFT_VARIANT_COLUMNS = ["items_full_json", "variant_ids"] as const;
export const DRAFT_OUTPUT_COLUMNS = [
  "draft_order_id",
  "draft_order_context",
] as const;

export interface DraftSheetInspection {
  spreadsheetId: string;
  gid: string;
  headers: string[];
  missingRequired: string[];
  hasVariantColumn: boolean;
  canGenerate: boolean;
  canWrite: boolean;
  dataRowCount: number;
  writeConfigured: boolean;
}

export interface DraftSheetRowResult {
  sheetRow: number;
  requestId: string;
  status: "created" | "skipped" | "failed";
  message: string;
  draftOrderId?: string;
  draftOrderContext?: string;
  wroteToSheet: boolean;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function inspectDraftHeaders(headers: string[]): {
  missingRequired: string[];
  hasVariantColumn: boolean;
  canGenerate: boolean;
} {
  const set = new Set(headers.map(normalizeHeader).filter(Boolean));
  const missingRequired = DRAFT_REQUIRED_COLUMNS.filter(
    (name) => !set.has(name)
  );
  const hasVariantColumn = DRAFT_VARIANT_COLUMNS.some((name) => set.has(name));
  return {
    missingRequired,
    hasVariantColumn,
    canGenerate: missingRequired.length === 0 && hasVariantColumn,
  };
}

export async function inspectDraftSheet(
  sheetUrl: string
): Promise<DraftSheetInspection> {
  const parsed = parseSheetUrl(sheetUrl);
  if (!parsed) {
    throw new Error(
      "Invalid Google Sheets URL — paste a link like https://docs.google.com/spreadsheets/d/…/edit"
    );
  }

  const headerUrl = sheetGvizRangeUrl(
    parsed.spreadsheetId,
    parsed.gid,
    "A1:CZ1"
  );
  const headerResult = await tryFetchCsv(headerUrl);
  if (!headerResult.ok) {
    throw new Error(
      "Could not read sheet headers. Share the sheet as \"Anyone with the link can view\" or publish it to the web."
    );
  }

  const headerRows = parseCsv(headerResult.text);
  const headers = (headerRows[0] ?? []).map((cell) => cell.trim()).filter(
    (cell, index, all) => cell !== "" || all.slice(index + 1).some(Boolean)
  );

  const countUrl = sheetGvizRangeUrl(
    parsed.spreadsheetId,
    parsed.gid,
    "A2:A20000"
  );
  const countResult = await tryFetchCsv(countUrl);
  const dataRowCount = countResult.ok
    ? parseCsv(countResult.text).filter((row) =>
        row.some((cell) => cell.trim() !== "")
      ).length
    : 0;

  const check = inspectDraftHeaders(headers);

  return {
    spreadsheetId: parsed.spreadsheetId,
    gid: parsed.gid,
    headers,
    ...check,
    canWrite: check.canGenerate && isGoogleSheetsWriteConfigured(),
    dataRowCount,
    writeConfigured: isGoogleSheetsWriteConfigured(),
  };
}

async function fetchSheetRecords(
  sheetUrl: string
): Promise<{
  spreadsheetId: string;
  gid: string;
  headers: string[];
  records: Array<{ sheetRow: number; record: Record<string, string> }>;
}> {
  const parsed = parseSheetUrl(sheetUrl);
  if (!parsed) {
    throw new Error("Invalid Google Sheets URL");
  }

  let rows: string[][] = [];
  if (isGoogleSheetsWriteConfigured()) {
    try {
      const title = await getSheetTitleByGid(parsed.spreadsheetId, parsed.gid);
      rows = await readSheetValues(parsed.spreadsheetId, title, "A1:CZ20000");
    } catch {
      rows = [];
    }
  }
  if (rows.length === 0) {
    const url = sheetGvizRangeUrl(parsed.spreadsheetId, parsed.gid, "A1:CZ20000");
    const result = await tryFetchCsv(url);
    if (!result.ok) {
      throw new Error("Could not read sheet rows");
    }
    rows = parseCsv(result.text);
  }
  if (rows.length < 2) {
    return {
      spreadsheetId: parsed.spreadsheetId,
      gid: parsed.gid,
      headers: rows[0] ?? [],
      records: [],
    };
  }

  const headers = rows[0].map((cell) => normalizeHeader(cell));
  const records = rows.slice(1).map((values, index) => ({
    sheetRow: index + 2,
    record: rowToRecord(headers, values),
  }));

  return {
    spreadsheetId: parsed.spreadsheetId,
    gid: parsed.gid,
    headers: rows[0].map((cell) => cell.trim()),
    records,
  };
}

async function ensureOutputColumns(
  spreadsheetId: string,
  gid: string,
  headers: string[]
): Promise<{ idIndex: number; contextIndex: number; sheetTitle: string }> {
  const normalized = headers.map(normalizeHeader);
  let idIndex = normalized.indexOf("draft_order_id");
  let contextIndex = normalized.indexOf("draft_order_context");
  const sheetTitle = await getSheetTitleByGid(spreadsheetId, gid);
  const writes: Array<{ a1: string; value: string }> = [];

  if (idIndex < 0) {
    idIndex = headers.length;
    writes.push({
      a1: `${columnIndexToA1(idIndex)}1`,
      value: "draft_order_id",
    });
    headers.push("draft_order_id");
    normalized.push("draft_order_id");
  }
  if (contextIndex < 0) {
    contextIndex = headers.length;
    writes.push({
      a1: `${columnIndexToA1(contextIndex)}1`,
      value: "draft_order_context",
    });
    headers.push("draft_order_context");
  }

  if (writes.length) {
    await writeSheetCells(spreadsheetId, sheetTitle, writes);
  }

  return { idIndex, contextIndex, sheetTitle };
}

export async function generateDraftsForSheet(options: {
  store: Store;
  sheetUrl: string;
  offset: number;
  limit: number;
  skipExisting: boolean;
  onlySheetRows?: number[];
}): Promise<{
  results: DraftSheetRowResult[];
  nextOffset: number;
  done: boolean;
  total: number;
  writeConfigured: boolean;
}> {
  const { spreadsheetId, gid, headers, records } = await fetchSheetRecords(
    options.sheetUrl
  );
  const inspection = inspectDraftHeaders(headers);
  if (!inspection.canGenerate) {
    throw new Error("Sheet is missing columns required to create drafts");
  }
  const scoped = options.onlySheetRows?.length
    ? records.filter((row) => options.onlySheetRows!.includes(row.sheetRow))
    : records;
  const slice = scoped.slice(options.offset, options.offset + options.limit);
  const writeConfigured = isGoogleSheetsWriteConfigured();
  let outputCols: {
    idIndex: number;
    contextIndex: number;
    sheetTitle: string;
  } | null = null;

  if (writeConfigured) {
    outputCols = await ensureOutputColumns(spreadsheetId, gid, [...headers]);
  }

  const results: DraftSheetRowResult[] = [];

  for (const { sheetRow, record } of slice) {
    const requestId = record.request_id?.trim() || "";
    const existingId = record.draft_order_id?.trim() || "";

    if (!requestId) {
      results.push({
        sheetRow,
        requestId: "",
        status: "skipped",
        message: "Missing request_id",
        wroteToSheet: false,
      });
      continue;
    }

    if (options.skipExisting && existingId) {
      results.push({
        sheetRow,
        requestId,
        status: "skipped",
        message: "Already has draft_order_id",
        draftOrderId: existingId,
        wroteToSheet: false,
      });
      continue;
    }

    const lineItems = parseLineItemsFromSheet(record);
    if (!lineItemsHaveVariantId(lineItems)) {
      results.push({
        sheetRow,
        requestId,
        status: "failed",
        message: "No variant IDs in items_full_json or variant_ids",
        wroteToSheet: false,
      });
      continue;
    }

    const shippingAddress = normalizeSheetShipping(record);
    const customerName = record.customer_name?.trim() || "";
    const missingRowFields = DRAFT_ROW_REQUIRED_FIELDS.filter((field) => {
      if (field === "address") return !shippingAddress;
      if (field === "customer_name") return !customerName;
      return !record[field]?.trim();
    });

    if (missingRowFields.length) {
      results.push({
        sheetRow,
        requestId,
        status: "failed",
        message: `Missing ${missingRowFields.join(", ")} — skipped so we don't create a draft without a complete address`,
        wroteToSheet: false,
      });
      continue;
    }

    try {
      const draft = await createDraftOrderForStore(options.store, {
        lineItems,
        phone: normalizePhoneNumber(record.customer_phone) || undefined,
        email: record.email?.trim() || undefined,
        checkoutToken: requestId,
        note: `Draft fill module — ${requestId}`,
        shippingAddress,
        customerName,
      });
      const context = await getDraftOrderContextForStore(
        options.store,
        draft.draftOrderId
      );
      const contextJson = serializeDraftOrderContext(context);

      let wroteToSheet = false;
      if (outputCols) {
        await writeSheetCells(spreadsheetId, outputCols.sheetTitle, [
          {
            a1: `${columnIndexToA1(outputCols.idIndex)}${sheetRow}`,
            value: draft.draftOrderId,
          },
          {
            a1: `${columnIndexToA1(outputCols.contextIndex)}${sheetRow}`,
            value: contextJson,
          },
        ]);
        wroteToSheet = true;
      }

      results.push({
        sheetRow,
        requestId,
        status: "created",
        message: wroteToSheet
          ? "Draft created and written to sheet"
          : "Draft created (sheet write not configured)",
        draftOrderId: draft.draftOrderId,
        draftOrderContext: contextJson,
        wroteToSheet,
      });
    } catch (error) {
      results.push({
        sheetRow,
        requestId,
        status: "failed",
        message: error instanceof Error ? error.message : "Draft create failed",
        wroteToSheet: false,
      });
    }
  }

  const nextOffset = options.offset + slice.length;
  return {
    results,
    nextOffset,
    done: nextOffset >= scoped.length,
    total: scoped.length,
    writeConfigured,
  };
}
