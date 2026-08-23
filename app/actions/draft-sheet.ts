"use server";

import {
  generateDraftsForSheet,
  inspectDraftSheet,
  type DraftSheetInspection,
  type DraftSheetRowResult,
} from "@/lib/draft-sheet";
import {
  verifyGoogleSheetsWrite,
  type SheetsWriteVerifyResult,
} from "@/lib/google-sheets";
import { parseSheetUrl } from "@/lib/sheet-url";
import { requireAdmin } from "@/lib/admin-gate";
import { assertStoreAccess, StoreAccessError } from "@/lib/store-access";

export async function inspectDraftSheetAction(
  sheetUrl: string
): Promise<{ success: boolean; error?: string; inspection?: DraftSheetInspection }> {
  await requireAdmin();

  try {
    const inspection = await inspectDraftSheet(sheetUrl);
    return { success: true, inspection };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not read sheet",
    };
  }
}

export async function verifyDraftSheetWriteAction(
  sheetUrl: string
): Promise<SheetsWriteVerifyResult> {
  await requireAdmin();

  const parsed = parseSheetUrl(sheetUrl);
  if (!parsed) {
    return {
      ok: false,
      step: "access",
      message:
        "Invalid Google Sheets URL — paste a link like https://docs.google.com/spreadsheets/d/…/edit",
    };
  }

  return verifyGoogleSheetsWrite(parsed);
}

export async function generateDraftSheetBatchAction(input: {
  storeDomain: string;
  sheetUrl: string;
  offset: number;
  limit?: number;
  skipExisting?: boolean;
  onlySheetRows?: number[];
}): Promise<{
  success: boolean;
  error?: string;
  results?: DraftSheetRowResult[];
  nextOffset?: number;
  done?: boolean;
  total?: number;
  writeConfigured?: boolean;
}> {
  await requireAdmin();

  try {
    const store = await assertStoreAccess(input.storeDomain);
    const batch = await generateDraftsForSheet({
      store,
      sheetUrl: input.sheetUrl,
      offset: input.offset,
      limit: input.limit ?? 3,
      skipExisting: input.skipExisting ?? true,
      onlySheetRows: input.onlySheetRows,
    });
    return { success: true, ...batch };
  } catch (error) {
    const message =
      error instanceof StoreAccessError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Draft generation failed";
    return { success: false, error: message };
  }
}
