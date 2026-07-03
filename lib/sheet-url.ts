/**
 * Extract spreadsheet ID and gid from any Google Sheets URL.
 * Returns null if the URL doesn't look like a Sheets URL.
 */
export function parseSheetUrl(
  input: string
): { spreadsheetId: string; gid: string } | null {
  const trimmed = input.trim();
  const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) return null;
  const gidMatch = trimmed.match(/[#&?]gid=(\d+)/);
  return { spreadsheetId: idMatch[1], gid: gidMatch?.[1] ?? "0" };
}

/**
 * Build the two candidate CSV export URLs for a sheet.
 *
 * - `/export` works when the sheet is shared as "Anyone with the link can view".
 * - `/pub` works when the sheet has been "Published to the web".
 */
export function sheetCsvCandidateUrls(
  spreadsheetId: string,
  gid: string
): [string, string] {
  const base = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
  return [
    `${base}/export?format=csv&gid=${gid}&single=true`,
    `${base}/pub?output=csv&gid=${gid}&single=true`,
  ];
}

/** GViz query URL for a specific cell range (paginated CSV slice). */
export function sheetGvizRangeUrl(
  spreadsheetId: string,
  gid: string,
  range: string
): string {
  const base = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
  return `${base}/gviz/tq?tqx=out:csv&gid=${gid}&range=${encodeURIComponent(range)}`;
}

/** Convert a Google Sheets edit/share URL into a CSV export URL. */
export function toSheetCsvExportUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Sheet URL is required");
  }

  if (
    (trimmed.includes("/export?") || trimmed.includes("/pub?")) &&
    (trimmed.includes("format=csv") || trimmed.includes("output=csv"))
  ) {
    return trimmed;
  }

  const parsed = parseSheetUrl(trimmed);
  if (!parsed) {
    throw new Error(
      "Invalid Google Sheets URL — paste a link like https://docs.google.com/spreadsheets/d/…/edit"
    );
  }

  const [exportUrl] = sheetCsvCandidateUrls(parsed.spreadsheetId, parsed.gid);
  return exportUrl;
}
