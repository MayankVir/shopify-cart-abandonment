import { create } from "zustand";
import { writeExtractionFeedbackBatchAction } from "@/app/actions/draft-sheet";
import type { ExtractionFeedbackRowResult } from "@/lib/call-feedback-sheet";

export interface FeedbackSheetProgress {
  done: number;
  total: number;
}

interface FeedbackSheetRunState {
  isWriting: boolean;
  log: ExtractionFeedbackRowResult[];
  progress: FeedbackSheetProgress;
  runError: string | null;
}

interface FeedbackSheetRunActions {
  resetRun: () => void;
  runBatches: (options: {
    storeDomain: string;
    sheetUrl: string;
    onlySheetRows?: number[];
    replaceLog: boolean;
    totalHint: number;
  }) => Promise<void>;
}

let runToken = 0;

function mergeRowResults(
  current: ExtractionFeedbackRowResult[],
  incoming: ExtractionFeedbackRowResult[],
): ExtractionFeedbackRowResult[] {
  const next = [...current];
  for (const row of incoming) {
    const index = next.findIndex(
      (item) => item.sheetRow === row.sheetRow && item.requestId === row.requestId,
    );
    if (index >= 0) next[index] = row;
    else next.push(row);
  }
  return next;
}

const INITIAL_RUN: FeedbackSheetRunState = {
  isWriting: false,
  log: [],
  progress: { done: 0, total: 0 },
  runError: null,
};

export const useFeedbackSheetRun = create<
  FeedbackSheetRunState & FeedbackSheetRunActions
>((set) => ({
  ...INITIAL_RUN,

  resetRun: () => {
    runToken += 1;
    set({ ...INITIAL_RUN });
  },

  runBatches: async (options) => {
    const token = ++runToken;
    set({
      isWriting: true,
      runError: null,
      ...(options.replaceLog ? { log: [] } : {}),
      progress: { done: 0, total: options.totalHint },
    });

    let offset = 0;
    try {
      while (token === runToken) {
        const batch = await writeExtractionFeedbackBatchAction({
          storeDomain: options.storeDomain,
          sheetUrl: options.sheetUrl,
          offset,
          limit: 1,
          onlySheetRows: options.onlySheetRows,
        });
        if (token !== runToken) return;

        if (!batch.success || !batch.results) {
          set({ runError: batch.error ?? "Call feedback write failed" });
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
          error instanceof Error ? error.message : "Call feedback write failed",
      });
    } finally {
      if (token === runToken) {
        set({ isWriting: false });
      }
    }
  },
}));
