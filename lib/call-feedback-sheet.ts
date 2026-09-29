import { CallStatus, type Prisma, type Store } from "@prisma/client";
import { formatCallStatus } from "@/lib/call-status";
import { db } from "@/lib/db";
import {
  columnIndexToA1,
  getSheetTitleByGid,
  isGoogleSheetsWriteConfigured,
  readSheetValues,
  writeSheetCells,
} from "@/lib/google-sheets";
import type { LineItemRecord } from "@/lib/line-items";
import { rowToRecord } from "@/lib/sheet-sync";
import { parseSheetUrl } from "@/lib/sheet-url";
import { parseShippingAddressFromUserContext } from "@/lib/shipping-address";
import {
  extractionCallOutcome,
  fetchTtaiSessionDetails,
  formatExtractionFeedback,
  ttaiSessionAnalysisUrl,
} from "@/lib/ttai";

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
  retryCount: "ttai_retry_count",
} as const;

/** One column per dial: `ttai_retry_1`, `ttai_retry_2`, and so on. */
export function attemptColumnName(attemptNumber: number): string {
  return `ttai_retry_${attemptNumber}`;
}

const DID_NOT_CONNECT = new Set<CallStatus>([
  CallStatus.NO_ANSWER,
  CallStatus.BUSY,
  CallStatus.VOICEMAIL,
  CallStatus.INVALID_NUMBER,
  CallStatus.DISPATCH_FAILED,
]);

export interface CallAttemptSheetCells {
  status: CallStatus;
  sessionId?: string | null;
  /** Extraction text for this dial, same shape as `ttai_call_feedback`. */
  feedbackText?: string | null;
  /** `call_outcome` from this dial's extraction, when present. */
  outcomeLabel?: string | null;
}

export function attemptStatusLabel(attempt: CallAttemptSheetCells): string {
  const outcome = attempt.outcomeLabel?.trim();
  if (outcome) return outcome;
  if (DID_NOT_CONNECT.has(attempt.status)) return "did not connect";
  return formatCallStatus(attempt.status);
}

/** Status, extraction, and the session link, stacked in one cell. */
export function attemptSheetCells(
  attempts: CallAttemptSheetCells[],
): Array<{ column: string; value: string }> {
  return attempts.map((attempt, index) => {
    const sessionUrl = attempt.sessionId
      ? ttaiSessionAnalysisUrl(attempt.sessionId)
      : null;
    const parts = [
      attemptStatusLabel(attempt),
      attempt.feedbackText?.trim() || null,
      sessionUrl,
    ].filter((part): part is string => Boolean(part));
    return {
      column: attemptColumnName(index + 1),
      value: parts.join("\n\n"),
    };
  });
}

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
  /** Chronological attempts. Each one is written into its own cell. */
  attempts?: CallAttemptSheetCells[];
  /** The latest attempt failed and another dial was queued. */
  retryScheduled?: boolean;
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
    CALL_FEEDBACK_OUTPUT_COLUMNS.retryCount,
  ];
}

async function ensureFeedbackColumns(
  spreadsheetId: string,
  sheetTitle: string,
  headers: string[],
  keyColumn: string,
  extraColumns: string[] = [],
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

  for (const outputColumn of [
    ...Object.values(CALL_FEEDBACK_OUTPUT_COLUMNS),
    ...extraColumns,
  ]) {
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

    const attemptCells = attemptSheetCells(input.attempts ?? []);
    const retryCount =
      input.attempts == null
        ? ""
        : String(
            Math.max(0, input.attempts.length - 1) +
              (input.retryScheduled ? 1 : 0),
          );

    const { headerIndex } = await ensureFeedbackColumns(
      parsed.spreadsheetId,
      sheetTitle,
      headers,
      keyColumn,
      attemptCells.map((cell) => cell.column),
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

    const attemptWrites = attemptCells.flatMap((cell) => {
      const index = headerIndex[cell.column];
      if (index == null || !cell.value) return [];
      return [{ index, value: cell.value }];
    });
    const retryCountIndex = headerIndex[CALL_FEEDBACK_OUTPUT_COLUMNS.retryCount];

    if (matchedRow > 0) {
      await writeSheetCells(parsed.spreadsheetId, sheetTitle, [
        { a1: `${columnIndexToA1(statusIndex)}${matchedRow}`, value: statusLabel },
        {
          a1: `${columnIndexToA1(feedbackIndex)}${matchedRow}`,
          value: feedbackText,
        },
        ...(retryCount
          ? [
              {
                a1: `${columnIndexToA1(retryCountIndex)}${matchedRow}`,
                value: retryCount,
              },
            ]
          : []),
        ...attemptWrites.map((cell) => ({
          a1: `${columnIndexToA1(cell.index)}${matchedRow}`,
          value: cell.value,
        })),
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
      ...(retryCount
        ? { [CALL_FEEDBACK_OUTPUT_COLUMNS.retryCount]: retryCount }
        : {}),
      ...Object.fromEntries(attemptCells.map((cell) => [cell.column, cell.value])),
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

/** Loads each dial in order: status, extraction, and the session link. */
export async function loadAttemptSheetCells(
  checkoutId: string,
): Promise<CallAttemptSheetCells[]> {
  const attempts = await db.callAttempt.findMany({
    where: { abandonedCheckoutId: checkoutId },
    orderBy: { startedAt: "asc" },
    select: { status: true, sessionId: true },
  });
  const cells: CallAttemptSheetCells[] = [];
  for (const attempt of attempts) {
    let feedbackText: string | null = null;
    let outcomeLabel: string | null = null;
    if (attempt.sessionId) {
      const session = await fetchTtaiSessionDetails(attempt.sessionId);
      if (session.success) {
        feedbackText = formatExtractionFeedback(session.session?.extraction_results);
        outcomeLabel = extractionCallOutcome(session.session?.extraction_results);
      }
    }
    cells.push({
      status: attempt.status,
      sessionId: attempt.sessionId,
      feedbackText,
      outcomeLabel,
    });
  }
  return cells;
}

/** Writes the latest status plus one cell per dial. */
export async function writeCheckoutCallFeedback(
  store: Pick<
    Store,
    "callFeedbackSheetEnabled" | "callFeedbackSheetUrl" | "sheetUrl" | "callFeedbackKeyColumn"
  >,
  checkout: {
    id: string;
    checkoutToken: string;
    customerPhone: string;
    customerEmail: string | null;
    userContext: string;
    lineItemsJson: Prisma.JsonValue;
    aiSummary?: string | null;
  },
  options: {
    callStatus: CallStatus;
    feedbackText?: string | null;
    retryScheduled?: boolean;
  },
): Promise<CallFeedbackWriteResult> {
  const attempts = await loadAttemptSheetCells(checkout.id);
  return writeCallFeedbackIfEnabled(store, {
    ...buildCallFeedbackContext(checkout),
    callStatus: options.callStatus,
    feedbackText: options.feedbackText ?? checkout.aiSummary,
    attempts,
    retryScheduled: Boolean(options.retryScheduled),
  });
}

export interface ExtractionFeedbackRowResult {
  sheetRow: number;
  requestId: string;
  status: "written" | "skipped" | "failed";
  message: string;
  wroteToSheet: boolean;
}

/**
 * Walks the draft sheet and writes each dial into its own cell (status,
 * extraction, and session link). Also refreshes `ttai_call_feedback`.
 */
export async function writeExtractionFeedbackForSheet(options: {
  storeDomain: string;
  sheetUrl: string;
  offset: number;
  limit: number;
  onlySheetRows?: number[];
  /** Google Sheet row to resume from, inclusive. Row 1 is the header. */
  startSheetRow?: number;
}): Promise<{
  results: ExtractionFeedbackRowResult[];
  nextOffset: number;
  done: boolean;
  total: number;
}> {
  if (!isGoogleSheetsWriteConfigured()) {
    throw new Error(
      "Google Sheets write is not configured (missing service account credentials).",
    );
  }

  const parsed = parseSheetUrl(options.sheetUrl);
  if (!parsed) {
    throw new Error("Invalid Google Sheets URL");
  }

  const sheetTitle = await getSheetTitleByGid(parsed.spreadsheetId, parsed.gid);
  const rows = await readSheetValues(parsed.spreadsheetId, sheetTitle, "A1:CZ20000");
  const rawHeaders = (rows[0] ?? []).map((cell) => cell.trim());
  const headers = rawHeaders.map(normalizeHeader);
  const requestIndex = headers.indexOf("request_id");
  if (requestIndex < 0) {
    throw new Error("Sheet is missing the request_id column");
  }

  let feedbackIndex = headers.indexOf(CALL_FEEDBACK_OUTPUT_COLUMNS.feedback);
  if (feedbackIndex < 0) {
    feedbackIndex = rawHeaders.length;
    rawHeaders.push(CALL_FEEDBACK_OUTPUT_COLUMNS.feedback);
    await writeSheetCells(parsed.spreadsheetId, sheetTitle, [
      {
        a1: `${columnIndexToA1(feedbackIndex)}1`,
        value: CALL_FEEDBACK_OUTPUT_COLUMNS.feedback,
      },
    ]);
  }

  const records = rows
    .slice(1)
    .map((values, index) => ({
      sheetRow: index + 2,
      record: rowToRecord(headers, values),
    }))
    .filter((row) => Object.values(row.record).some((value) => value.trim()));

  const startSheetRow =
    options.startSheetRow != null && options.startSheetRow >= 2
      ? options.startSheetRow
      : null;
  const fromStart =
    startSheetRow == null
      ? records
      : records.filter((row) => row.sheetRow >= startSheetRow);
  const scoped = options.onlySheetRows?.length
    ? records.filter((row) => options.onlySheetRows!.includes(row.sheetRow))
    : fromStart;
  const slice = scoped.slice(options.offset, options.offset + options.limit);
  const results: ExtractionFeedbackRowResult[] = [];

  for (const { sheetRow, record } of slice) {
    const requestId = record.request_id?.trim() || "";
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

    const checkout = await db.abandonedCheckout.findUnique({
      where: { checkoutToken: requestId },
      select: { id: true, storeDomain: true },
    });

    if (!checkout || checkout.storeDomain !== options.storeDomain) {
      results.push({
        sheetRow,
        requestId,
        status: "skipped",
        message: "No call for this request",
        wroteToSheet: false,
      });
      continue;
    }

    const attemptCells = await loadAttemptSheetCells(checkout.id);
    if (attemptCells.length === 0) {
      results.push({
        sheetRow,
        requestId,
        status: "skipped",
        message: "No call for this request",
        wroteToSheet: false,
      });
      continue;
    }

    const perAttempt = attemptSheetCells(attemptCells);
    const latestFeedback = [...attemptCells]
      .reverse()
      .find((row) => row.feedbackText)?.feedbackText;
    const normalizedHeaders = rawHeaders.map(normalizeHeader);
    const headerWrites: Array<{ a1: string; value: string }> = [];
    for (const column of perAttempt.map((cell) => cell.column)) {
      if (normalizedHeaders.includes(column)) continue;
      const index = rawHeaders.length;
      headerWrites.push({ a1: `${columnIndexToA1(index)}1`, value: column });
      rawHeaders.push(column);
      normalizedHeaders.push(column);
    }
    if (headerWrites.length) {
      await writeSheetCells(parsed.spreadsheetId, sheetTitle, headerWrites);
    }
    const headerIndex: Record<string, number> = {};
    normalizedHeaders.forEach((name, index) => {
      headerIndex[name] = index;
    });
    const resolvedFeedbackIndex =
      headerIndex[CALL_FEEDBACK_OUTPUT_COLUMNS.feedback] ?? feedbackIndex;

    const writes: Array<{ a1: string; value: string }> = [];
    if (latestFeedback) {
      writes.push({
        a1: `${columnIndexToA1(resolvedFeedbackIndex)}${sheetRow}`,
        value: latestFeedback,
      });
    }
    for (const cell of perAttempt) {
      const index = headerIndex[cell.column];
      if (index == null || !cell.value) continue;
      writes.push({
        a1: `${columnIndexToA1(index)}${sheetRow}`,
        value: cell.value,
      });
    }

    if (writes.length === 0) {
      results.push({
        sheetRow,
        requestId,
        status: "skipped",
        message: "No extraction on this call",
        wroteToSheet: false,
      });
      continue;
    }

    await writeSheetCells(parsed.spreadsheetId, sheetTitle, writes);
    const outcome = attemptCells.map((row) => row.outcomeLabel).find(Boolean);
    results.push({
      sheetRow,
      requestId,
      status: "written",
      message: outcome ? `Updated retries · ${outcome}` : "Updated retries",
      wroteToSheet: true,
    });
  }

  const nextOffset = options.offset + slice.length;
  return {
    results,
    nextOffset,
    done: nextOffset >= scoped.length,
    total: scoped.length,
  };
}
