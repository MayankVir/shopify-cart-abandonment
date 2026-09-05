import { create } from "zustand";
import { generateDraftSheetBatchAction } from "@/app/actions/draft-sheet";
import type { DraftSheetRowResult } from "@/lib/draft-sheet";

export interface DraftSheetProgress {
  done: number;
  total: number;
}

interface DraftSheetRunState {
  isGenerating: boolean;
  log: DraftSheetRowResult[];
  progress: DraftSheetProgress;
  runError: string | null;
}

interface DraftSheetRunActions {
  resetRun: () => void;
  runBatches: (options: {
    storeDomain: string;
    sheetUrl: string;
    skipExisting: boolean;
    onlySheetRows?: number[];
    replaceLog: boolean;
    totalHint: number;
  }) => Promise<void>;
}

let runToken = 0;

function mergeRowResults(
  current: DraftSheetRowResult[],
  incoming: DraftSheetRowResult[]
): DraftSheetRowResult[] {
  const next = [...current];
  for (const row of incoming) {
    const index = next.findIndex(
      (item) => item.sheetRow === row.sheetRow && item.requestId === row.requestId
    );
    if (index >= 0) next[index] = row;
    else next.push(row);
  }
  return next;
}

const INITIAL_RUN: DraftSheetRunState = {
  isGenerating: false,
  log: [],
  progress: { done: 0, total: 0 },
  runError: null,
};

export const useDraftSheetRun = create<
  DraftSheetRunState & DraftSheetRunActions
>((set) => ({
  ...INITIAL_RUN,

  resetRun: () => {
    runToken += 1;
    set({ ...INITIAL_RUN });
  },

  runBatches: async (options) => {
    const token = ++runToken;
    set({
      isGenerating: true,
      runError: null,
      ...(options.replaceLog ? { log: [] } : {}),
      progress: { done: 0, total: options.totalHint },
    });

    let offset = 0;
    try {
      while (token === runToken) {
        const batch = await generateDraftSheetBatchAction({
          storeDomain: options.storeDomain,
          sheetUrl: options.sheetUrl,
          offset,
          limit: 3,
          skipExisting: options.skipExisting,
          onlySheetRows: options.onlySheetRows,
        });
        if (token !== runToken) return;

        if (!batch.success || !batch.results) {
          set({ runError: batch.error ?? "Draft generation failed" });
          break;
        }

        set((state) => ({
          log: options.replaceLog
            ? [...state.log, ...batch.results!]
            : mergeRowResults(state.log, batch.results!),
          progress: {
            done: batch.nextOffset ?? offset,
            total: batch.total ?? options.totalHint,
          },
        }));

        offset = batch.nextOffset ?? offset + batch.results.length;
        if (batch.done) break;
      }
    } catch (error) {
      if (token !== runToken) return;
      set({
        runError:
          error instanceof Error ? error.message : "Draft generation failed",
      });
    } finally {
      if (token === runToken) {
        set({ isGenerating: false });
      }
    }
  },
}));
