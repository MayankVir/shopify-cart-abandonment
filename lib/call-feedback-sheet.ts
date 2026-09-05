import { CallStatus, type Prisma, type Store } from "@prisma/client";
import { formatCallStatus } from "@/lib/call-status";
import {
  columnIndexToA1,
  getSheetTitleByGid,
  isGoogleSheetsWriteConfigured,
  readSheetValues,
  writeSheetCells,
} from "@/lib/google-sheets";
import type { LineItemRecord } from "@/lib/line-items";
import { parseSheetUrl } from "@/lib/sheet-url";
import { parseShippingAddressFromUserContext } from "@/lib/shipping-address";

export const DEFAULT_CALL_FEEDBACK_KEY_COLUMN = "request_id";

/** Fixed context columns the target sheet must already have (beyond the key
 * column) before we'll write feedback to it. These aren't guaranteed to be
 * filled per-row (e.g. webhook-sourced checkouts have no address on file),
 * but the columns themselves must exist so every provider's sheet has a
 * consistent, complete shape to review calls against. */
export const CALL_FEEDBACK_REQUIRED_COLUMNS = [
  "customer_name",
  "customer_phone",
  "email",
  "address",
  "city",
  "state",
  "pincode",
  "product_ids",
  "variant_ids",
] as const;

export const CALL_FEEDBACK_OUTPUT_COLUMNS = {
  status: "ttai_call_status",
  feedback: "ttai_call_feedback",
} as const;

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export interface CallFeedbackContext {
  checkoutToken: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  productIds?: string | null;
  variantIds?: string | null;
}

/** Derives the fixed context fields from an AbandonedCheckout row. Fields
 * that aren't available for this checkout's source (e.g. address for
 * webhook-synced checkouts) come back empty rather than failing. */
export function buildCallFeedbackContext(checkout: {
  checkoutToken: string;
  customerPhone: string;
  customerEmail: string | null;
  userContext: string;
  lineItemsJson: Prisma.JsonValue;
}): CallFeedbackContext {
  const shipping = parseShippingAddressFromUserContext(checkout.userContext);

  let customerName: string | undefined;
  try {
    const parsed = JSON.parse(checkout.userContext || "{}") as {
      customer_name?: string;
    };
    customerName = parsed.customer_name?.trim() || undefined;
  } catch {
    customerName = undefined;
  }

  const lineItems = Array.isArray(checkout.lineItemsJson)
    ? (checkout.lineItemsJson as unknown as LineItemRecord[])
    : [];
  const productIds = Array.from(
    new Set(lineItems.map((item) => item.product_id).filter(Boolean))
  ).join(", ");
  const variantIds = Array.from(
    new Set(lineItems.map((item) => item.variant_id).filter(Boolean))
  ).join(", ");

  return {
    checkoutToken: checkout.checkoutToken,
    customerPhone: checkout.customerPhone,
    customerEmail: checkout.customerEmail,
    customerName,
    address: shipping?.address,
    city: shipping?.city,
    state: shipping?.state,
    pincode: shipping?.pincode,
    productIds,
    variantIds,
  };
}

export interface CallFeedbackWriteInput extends CallFeedbackContext {
  targetSheetUrl: string;
  keyColumn: string;
  callStatus: CallStatus;
  feedbackText?: string | null;
}

export interface CallFeedbackWriteResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  wroteRow?: "updated" | "appended";
}

export interface CallFeedbackSheetInspection {
  headers: string[];
  missingRequired: string[];
  isEmpty: boolean;
  keyColumn: string;
}

async function readSheetHeadersAndTitle(
  targetSheetUrl: string
): Promise<{ spreadsheetId: string; gid: string; sheetTitle: string; rows: string[][] }> {
  const parsed = parseSheetUrl(targetSheetUrl);
  if (!parsed) {
    throw new Error("Invalid feedback sheet URL");
  }
  const sheetTitle = await getSheetTitleByGid(parsed.spreadsheetId, parsed.gid);
  const rows = await readSheetValues(
    parsed.spreadsheetId,
    sheetTitle,
    "A1:CZ20000"
  );
  return { spreadsheetId: parsed.spreadsheetId, gid: parsed.gid, sheetTitle, rows };
}

/** Checks whether a target sheet is ready for call-feedback write-back:
 * either it's completely empty (we'll bootstrap the full schema on first
 * write) or it already has the key column + all fixed context columns. */
export async function inspectCallFeedbackSheet(
  targetSheetUrl: string,
  keyColumn: string
): Promise<CallFeedbackSheetInspection> {
  if (!isGoogleSheetsWriteConfigured()) {
    throw new Error(
      "Google Sheets write is not configured (missing service account credentials)."
    );
  }

  const normalizedKeyColumn = normalizeHeader(keyColumn || DEFAULT_CALL_FEEDBACK_KEY_COLUMN);
  const { rows } = await readSheetHeadersAndTitle(targetSheetUrl);
  const headers = (rows[0] ?? []).map((cell) => cell.trim());

  if (headers.length === 0) {
    return { headers: [], missingRequired: [], isEmpty: true, keyColumn: normalizedKeyColumn };
  }

  const normalized = headers.map(normalizeHeader);
  const required = [normalizedKeyColumn, ...CALL_FEEDBACK_REQUIRED_COLUMNS];
  const missingRequired = required.filter((name) => !normalized.includes(name));

  return { headers, missingRequired, isEmpty: false, keyColumn: normalizedKeyColumn };
}

function buildBootstrapHeaders(keyColumn: string): string[] {
  return [
    keyColumn,
    ...CALL_FEEDBACK_REQUIRED_COLUMNS,
    CALL_FEEDBACK_OUTPUT_COLUMNS.status,
    CALL_FEEDBACK_OUTPUT_COLUMNS.feedback,
  ];
}

async function ensureFeedbackColumns(
  spreadsheetId: string,
  sheetTitle: string,
  headers: string[],
  keyColumn: string
): Promise<{
  headerIndex: Record<string, number>;
}> {
  const normalizedKeyColumn = normalizeHeader(keyColumn);
  const normalized = headers.map(normalizeHeader);
  const writes: Array<{ a1: string; value: string }> = [];

  if (headers.length === 0) {
    buildBootstrapHeaders(normalizedKeyColumn).forEach((name, index) => {
      writes.push({ a1: `${columnIndexToA1(index)}1`, value: name });
      headers.push(name);
      normalized.push(name);
    });
  } else {
    const required = [normalizedKeyColumn, ...CALL_FEEDBACK_REQUIRED_COLUMNS];
    const missingRequired = required.filter((name) => !normalized.includes(name));
    if (missingRequired.length > 0) {
      throw new Error(
        `Feedback sheet is missing required columns: ${missingRequired.join(", ")}. Add them to the sheet (or point at a sheet that already has them) before writing call feedback.`
      );
    }
  }

  for (const outputColumn of Object.values(CALL_FEEDBACK_OUTPUT_COLUMNS)) {
    if (!normalized.includes(outputColumn)) {
      const index = headers.length;
      writes.push({ a1: `${columnIndexToA1(index)}1`, value: outputColumn });
      headers.push(outputColumn);
      normalized.push(outputColumn);
    }
  }

  if (writes.length) {
    await writeSheetCells(spreadsheetId, sheetTitle, writes);
  }

  const headerIndex: Record<string, number> = {};
  normalized.forEach((name, index) => {
    headerIndex[name] = index;
  });

  return { headerIndex };
}

/**
 * Writes call status + feedback text back to a Google Sheet, matched by the
 * configured key column. Requires the sheet to already declare the fixed
 * context columns (customer_name, customer_phone, email, address, city,
 * state, pincode, product_ids, variant_ids) unless it's completely empty, in
 * which case the full schema is bootstrapped. Updates the row in place if a
 * match is found, otherwise appends a new row. Never throws — always
 * resolves with `{ ok, error }`.
 */
export async function writeCallFeedbackToSheet(
  input: CallFeedbackWriteInput
): Promise<CallFeedbackWriteResult> {
  try {
    if (!isGoogleSheetsWriteConfigured()) {
      return {
        ok: false,
        error:
          "Google Sheets write is not configured (missing service account credentials).",
      };
    }

    const parsed = parseSheetUrl(input.targetSheetUrl);
    if (!parsed) {
      return { ok: false, error: "Invalid feedback sheet URL" };
    }

    const keyColumn = normalizeHeader(input.keyColumn || DEFAULT_CALL_FEEDBACK_KEY_COLUMN);
    const { sheetTitle, rows } = await readSheetHeadersAndTitle(input.targetSheetUrl);
    const headers = (rows[0] ?? []).map((cell) => cell.trim());

    const { headerIndex } = await ensureFeedbackColumns(
      parsed.spreadsheetId,
      sheetTitle,
      headers,
      keyColumn
    );

    const keyIndex = headerIndex[keyColumn];
    const statusIndex = headerIndex[CALL_FEEDBACK_OUTPUT_COLUMNS.status];
    const feedbackIndex = headerIndex[CALL_FEEDBACK_OUTPUT_COLUMNS.feedback];

    const statusLabel = formatCallStatus(input.callStatus);
    const feedbackText = input.feedbackText?.trim() ?? "";

    let matchedRow = -1;
    for (let i = 1; i < rows.length; i++) {
      const cell = rows[i]?.[keyIndex]?.trim();
      if (cell && cell === input.checkoutToken) {
        matchedRow = i + 1; // 1-based sheet row
        break;
      }
    }

    if (matchedRow > 0) {
      await writeSheetCells(parsed.spreadsheetId, sheetTitle, [
        { a1: `${columnIndexToA1(statusIndex)}${matchedRow}`, value: statusLabel },
        {
          a1: `${columnIndexToA1(feedbackIndex)}${matchedRow}`,
          value: feedbackText,
        },
      ]);
      return { ok: true, wroteRow: "updated" };
    }

    const newRow = Math.max(rows.length, 1) + 1;
    const cellValues: Partial<Record<string, string>> = {
      [keyColumn]: input.checkoutToken,
      customer_name: input.customerName ?? "",
      customer_phone: input.customerPhone ?? "",
      email: input.customerEmail ?? "",
      address: input.address ?? "",
      city: input.city ?? "",
      state: input.state ?? "",
      pincode: input.pincode ?? "",
      product_ids: input.productIds ?? "",
      variant_ids: input.variantIds ?? "",
      [CALL_FEEDBACK_OUTPUT_COLUMNS.status]: statusLabel,
      [CALL_FEEDBACK_OUTPUT_COLUMNS.feedback]: feedbackText,
    };

    const writes: Array<{ a1: string; value: string }> = [];
    for (const [column, value] of Object.entries(cellValues)) {
      const index = headerIndex[column];
      if (index == null || !value) continue;
      writes.push({ a1: `${columnIndexToA1(index)}${newRow}`, value });
    }

    await writeSheetCells(parsed.spreadsheetId, sheetTitle, writes);
    return { ok: true, wroteRow: "appended" };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to write call feedback to sheet",
    };
  }
}

/** Store-level convenience wrapper — resolves the target URL + key column and respects the auto-write toggle. */
export async function writeCallFeedbackIfEnabled(
  store: Pick<
    Store,
    "callFeedbackSheetEnabled" | "callFeedbackSheetUrl" | "sheetUrl" | "callFeedbackKeyColumn"
  >,
  input: Omit<CallFeedbackWriteInput, "targetSheetUrl" | "keyColumn">
): Promise<CallFeedbackWriteResult> {
  if (!store.callFeedbackSheetEnabled) {
    return { ok: false, skipped: true };
  }
  return writeCallFeedbackForStore(store, input);
}

/** Same as `writeCallFeedbackIfEnabled` but ignores the auto-write toggle — used by the manual "write to sheet" action. */
export async function writeCallFeedbackForStore(
  store: Pick<Store, "callFeedbackSheetUrl" | "sheetUrl" | "callFeedbackKeyColumn">,
  input: Omit<CallFeedbackWriteInput, "targetSheetUrl" | "keyColumn">
): Promise<CallFeedbackWriteResult> {
  const targetSheetUrl = store.callFeedbackSheetUrl?.trim() || store.sheetUrl?.trim();
  if (!targetSheetUrl) {
    return {
      ok: false,
      skipped: true,
      error: "No feedback sheet URL configured for this store",
    };
  }
  const keyColumn = store.callFeedbackKeyColumn?.trim() || DEFAULT_CALL_FEEDBACK_KEY_COLUMN;
  return writeCallFeedbackToSheet({ ...input, targetSheetUrl, keyColumn });
}
