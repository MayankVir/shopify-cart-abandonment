export const SHEET_SYNC_DIRECTIONS = {
  TOP: "TOP",
  BOTTOM: "BOTTOM",
} as const;

export type SheetSyncDirectionValue =
  (typeof SHEET_SYNC_DIRECTIONS)[keyof typeof SHEET_SYNC_DIRECTIONS];

export function isSheetSyncDirection(
  value: string
): value is SheetSyncDirectionValue {
  return value === SHEET_SYNC_DIRECTIONS.TOP || value === SHEET_SYNC_DIRECTIONS.BOTTOM;
}

export function sheetRowRangeLabel(
  page: number,
  pageSize: number,
  totalDataRows: number,
  direction: SheetSyncDirectionValue
): string {
  if (totalDataRows <= 0) return "";

  if (direction === SHEET_SYNC_DIRECTIONS.TOP) {
    const start = page * pageSize + 1;
    const end = Math.min((page + 1) * pageSize, totalDataRows);
    return `Rows ${start}–${end} (from top)`;
  }

  const totalPages = Math.ceil(totalDataRows / pageSize);
  const pageIndexFromTop = totalPages - 1 - page;
  const start = pageIndexFromTop * pageSize + 1;
  const end = Math.min(start + pageSize - 1, totalDataRows);
  return `Rows ${start}–${end} of ${totalDataRows} (from bottom)`;
}
