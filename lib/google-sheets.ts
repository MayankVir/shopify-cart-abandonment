import { createSign } from "crypto";
import { existsSync, readFileSync } from "fs";
import path from "path";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export function isGoogleSheetsWriteConfigured(): boolean {
  return Boolean(readServiceAccount());
}

export function getGoogleSheetsServiceAccountEmail(): string | null {
  return readServiceAccount()?.email ?? null;
}

export type SheetsWriteVerifyStep = "config" | "auth" | "access" | "write";

export interface SheetsWriteVerifyResult {
  ok: boolean;
  email?: string;
  sheetTitle?: string;
  step: SheetsWriteVerifyStep;
  message: string;
}

function parseServiceAccountJson(raw: string): {
  email: string;
  privateKey: string;
} | null {
  try {
    const parsed = JSON.parse(raw) as {
      client_email?: string;
      private_key?: string;
    };
    if (parsed.client_email && parsed.private_key) {
      return {
        email: parsed.client_email,
        privateKey: parsed.private_key.replace(/\\n/g, "\n"),
      };
    }
  } catch {
    return null;
  }
  return null;
}

function readServiceAccountFromFile(filePath: string): {
  email: string;
  privateKey: string;
} | null {
  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);
  if (!existsSync(resolved)) return null;
  return parseServiceAccountJson(readFileSync(resolved, "utf8"));
}

function readServiceAccount(): { email: string; privateKey: string } | null {
  const filePath =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH?.trim() ||
    "google-service-account.json";
  const fromDefaultFile = readServiceAccountFromFile(filePath);
  if (fromDefaultFile) return fromDefaultFile;

  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (json) {
    if (json.endsWith(".json") || json.startsWith("./") || json.startsWith("/")) {
      const fromPath = readServiceAccountFromFile(json);
      if (fromPath) return fromPath;
    }
    const parsed = parseServiceAccountJson(json);
    if (parsed) return parsed;
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n"
  );
  if (email && privateKey) {
    return { email, privateKey };
  }
  return null;
}

function signJwt(email: string, privateKey: string): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" })
  ).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      iss: email,
      scope: SHEETS_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  ).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(privateKey, "base64url");
  return `${header}.${payload}.${signature}`;
}

async function getAccessToken(): Promise<string> {
  const account = readServiceAccount();
  if (!account) {
    throw new Error(
      "Google Sheets write is not configured. Add GOOGLE_SERVICE_ACCOUNT_JSON (or EMAIL + PRIVATE_KEY) and share the sheet with that service account as Editor."
    );
  }

  const assertion = signJwt(account.email, account.privateKey);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await response.json()) as {
    access_token?: string;
    error_description?: string;
    error?: string;
  };
  if (!response.ok || !json.access_token) {
    throw new Error(
      json.error_description || json.error || "Google auth failed"
    );
  }
  return json.access_token;
}

export function columnIndexToA1(index0: number): string {
  let n = index0 + 1;
  let result = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function a1ColumnToIndex(letters: string): number {
  let n = 0;
  for (const char of letters.toUpperCase()) {
    n = n * 26 + (char.charCodeAt(0) - 64);
  }
  return n - 1;
}

function parseA1Cell(a1: string): { columnIndex: number; row: number } | null {
  const match = a1.trim().match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return null;
  const row = Number(match[2]);
  if (!Number.isFinite(row) || row < 1) return null;
  return { columnIndex: a1ColumnToIndex(match[1]), row };
}

async function sheetsFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(`https://sheets.googleapis.com/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Sheets API ${response.status}: ${text.slice(0, 400)}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function getSheetMeta(
  spreadsheetId: string,
  gid?: string,
  title?: string
): Promise<{
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
}> {
  const data = await sheetsFetch<{
    sheets?: Array<{
      properties?: {
        sheetId?: number;
        title?: string;
        gridProperties?: { rowCount?: number; columnCount?: number };
      };
    }>;
  }>(`/spreadsheets/${spreadsheetId}?fields=sheets.properties`);

  const wantedGid = gid != null && gid !== "" ? Number(gid) : NaN;
  const match =
    (Number.isFinite(wantedGid)
      ? data.sheets?.find((sheet) => sheet.properties?.sheetId === wantedGid)
      : undefined) ??
    (title
      ? data.sheets?.find((sheet) => sheet.properties?.title === title)
      : undefined) ??
    data.sheets?.[0];
  const resolvedTitle = match?.properties?.title;
  const sheetId = match?.properties?.sheetId;
  if (!resolvedTitle || sheetId == null) {
    throw new Error("Could not resolve the Google Sheet tab name");
  }
  return {
    sheetId,
    title: resolvedTitle,
    rowCount: Math.max(1, match?.properties?.gridProperties?.rowCount ?? 1),
    columnCount: Math.max(1, match?.properties?.gridProperties?.columnCount ?? 1),
  };
}

async function ensureSheetGridFits(
  spreadsheetId: string,
  sheetTitle: string,
  updates: Array<{ a1: string }>
): Promise<void> {
  let maxColumn = 0;
  let maxRow = 0;
  for (const update of updates) {
    const cell = parseA1Cell(update.a1);
    if (!cell) continue;
    maxColumn = Math.max(maxColumn, cell.columnIndex + 1);
    maxRow = Math.max(maxRow, cell.row);
  }
  if (maxColumn < 1 && maxRow < 1) return;

  const meta = await getSheetMeta(spreadsheetId, undefined, sheetTitle);
  const requests: Array<Record<string, unknown>> = [];
  if (maxColumn > meta.columnCount) {
    requests.push({
      appendDimension: {
        sheetId: meta.sheetId,
        dimension: "COLUMNS",
        length: maxColumn - meta.columnCount,
      },
    });
  }
  if (maxRow > meta.rowCount) {
    requests.push({
      appendDimension: {
        sheetId: meta.sheetId,
        dimension: "ROWS",
        length: maxRow - meta.rowCount,
      },
    });
  }
  if (!requests.length) return;

  await sheetsFetch(`/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
}

export async function getSheetTitleByGid(
  spreadsheetId: string,
  gid: string
): Promise<string> {
  const meta = await getSheetMeta(spreadsheetId, gid);
  return meta.title;
}

function quoteSheetTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

export async function writeSheetCells(
  spreadsheetId: string,
  sheetTitle: string,
  updates: Array<{ a1: string; value: string }>
): Promise<void> {
  if (updates.length === 0) return;

  await ensureSheetGridFits(spreadsheetId, sheetTitle, updates);

  const quoted = quoteSheetTitle(sheetTitle);
  await sheetsFetch(`/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: updates.map((update) => ({
        range: `${quoted}!${update.a1}`,
        values: [[update.value]],
      })),
    }),
  });
}

export async function readSheetValues(
  spreadsheetId: string,
  sheetTitle: string,
  a1Range: string
): Promise<string[][]> {
  const range = `${quoteSheetTitle(sheetTitle)}!${a1Range}`;
  const data = await sheetsFetch<{ values?: string[][] }>(
    `/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`
  );
  return data.values ?? [];
}

async function readSheetCell(
  spreadsheetId: string,
  sheetTitle: string,
  a1: string
): Promise<string> {
  const range = `${quoteSheetTitle(sheetTitle)}!${a1}`;
  const data = await sheetsFetch<{ values?: string[][] }>(
    `/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`
  );
  return data.values?.[0]?.[0] ?? "";
}

function friendlySheetsError(error: unknown, email: string): string {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();

  if (lower.includes("invalid_grant") || lower.includes("invalid jwt")) {
    return "Google rejected the service account key. Re-download the JSON and restart the server.";
  }
  if (lower.includes("accessnotconfigured") || lower.includes("has not been used")) {
    return "Enable the Google Sheets API on this Google Cloud project, then retry.";
  }
  if (
    lower.includes("403") ||
    lower.includes("permission") ||
    lower.includes("forbidden")
  ) {
    return `The sheet is not writable by ${email}. Share it as Editor with that address.`;
  }
  if (lower.includes("404") || lower.includes("not found")) {
    return "Google could not find this spreadsheet. Check the URL.";
  }
  return raw.slice(0, 280);
}

export async function verifyGoogleSheetsWrite(options: {
  spreadsheetId: string;
  gid: string;
}): Promise<SheetsWriteVerifyResult> {
  const account = readServiceAccount();
  if (!account) {
    return {
      ok: false,
      step: "config",
      message:
        "Service account JSON was not found or could not be parsed. Point GOOGLE_SERVICE_ACCOUNT_JSON_PATH at a .json file and restart the server.",
    };
  }

  try {
    await getAccessToken();
  } catch (error) {
    return {
      ok: false,
      email: account.email,
      step: "auth",
      message: friendlySheetsError(error, account.email),
    };
  }

  let sheetTitle: string;
  let probeCell: string;
  try {
    const meta = await getSheetMeta(options.spreadsheetId, options.gid);
    sheetTitle = meta.title;
    probeCell = `${columnIndexToA1(meta.columnCount - 1)}${meta.rowCount}`;
  } catch (error) {
    return {
      ok: false,
      email: account.email,
      step: "access",
      message: friendlySheetsError(error, account.email),
    };
  }

  const marker = `cartrecover-write-ok ${Date.now()}`;
  let previous = "";
  try {
    previous = await readSheetCell(options.spreadsheetId, sheetTitle, probeCell);
    await writeSheetCells(options.spreadsheetId, sheetTitle, [
      { a1: probeCell, value: marker },
    ]);
    const written = await readSheetCell(
      options.spreadsheetId,
      sheetTitle,
      probeCell
    );
    if (written !== marker) {
      throw new Error("Wrote a test cell but Google did not return the same value.");
    }
    await writeSheetCells(options.spreadsheetId, sheetTitle, [
      { a1: probeCell, value: previous },
    ]);
  } catch (error) {
    try {
      await writeSheetCells(options.spreadsheetId, sheetTitle, [
        { a1: probeCell, value: previous },
      ]);
    } catch {
      // Best-effort restore of the unused probe cell.
    }
    return {
      ok: false,
      email: account.email,
      sheetTitle,
      step: "write",
      message: friendlySheetsError(error, account.email),
    };
  }

  return {
    ok: true,
    email: account.email,
    sheetTitle,
    step: "write",
    message: `Write works as ${account.email} on tab “${sheetTitle}”.`,
  };
}
