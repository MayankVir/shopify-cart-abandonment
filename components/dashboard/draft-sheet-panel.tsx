"use client";

import { useEffect, useState, useTransition } from "react";
import { getStoreRecoverySettings } from "@/app/actions/abandoned-checkouts";
import { FileSpreadsheet, Loader2, Play, RotateCcw, ShieldCheck } from "lucide-react";
import {
  inspectDraftSheetAction,
  verifyDraftSheetWriteAction,
} from "@/app/actions/draft-sheet";
import type { DraftSheetInspection } from "@/lib/draft-sheet";
import type { SheetsWriteVerifyResult } from "@/lib/google-sheets";
import { useAnalyticsStore } from "@/store/use-analytics-store";
import { useDraftSheetRun } from "@/store/use-draft-sheet-run";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export function DraftSheetPanel() {
  const selectedStoreDomain = useAnalyticsStore((s) => s.selectedStoreDomain);
  const [sheetUrl, setSheetUrl] = useState("");
  const [inspection, setInspection] = useState<DraftSheetInspection | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [isInspecting, startInspect] = useTransition();
  const [isVerifying, startVerify] = useTransition();
  const [verifyResult, setVerifyResult] = useState<SheetsWriteVerifyResult | null>(
    null
  );
  const [skipExisting, setSkipExisting] = useState(true);

  const isGenerating = useDraftSheetRun((s) => s.isGenerating);
  const log = useDraftSheetRun((s) => s.log);
  const progress = useDraftSheetRun((s) => s.progress);
  const runError = useDraftSheetRun((s) => s.runError);
  const runBatches = useDraftSheetRun((s) => s.runBatches);
  const resetRun = useDraftSheetRun((s) => s.resetRun);

  useEffect(() => {
    if (!selectedStoreDomain) return;
    getStoreRecoverySettings(selectedStoreDomain).then((settings) => {
      if (settings?.sheetUrl && !sheetUrl) {
        setSheetUrl(settings.sheetUrl);
      }
    });
  }, [selectedStoreDomain]);

  function handleInspect() {
    setInspectError(null);
    setInspection(null);
    resetRun();
    startInspect(async () => {
      const result = await inspectDraftSheetAction(sheetUrl);
      if (!result.success || !result.inspection) {
        setInspectError(result.error ?? "Could not read sheet");
        return;
      }
      setInspection(result.inspection);
    });
  }

  function handleVerifyWrite() {
    setVerifyResult(null);
    startVerify(async () => {
      const result = await verifyDraftSheetWriteAction(sheetUrl);
      setVerifyResult(result);
    });
  }

  async function handleGenerate() {
    if (!inspection?.canGenerate || !selectedStoreDomain) return;
    await runBatches({
      storeDomain: selectedStoreDomain,
      sheetUrl,
      skipExisting,
      replaceLog: true,
      totalHint: inspection.dataRowCount,
    });
  }

  async function handleRetryFailed() {
    if (!selectedStoreDomain) return;
    const failedRows = Array.from(
      new Set(
        log.filter((row) => row.status === "failed").map((row) => row.sheetRow)
      )
    );
    if (!failedRows.length) return;
    await runBatches({
      storeDomain: selectedStoreDomain,
      sheetUrl,
      skipExisting: false,
      onlySheetRows: failedRows,
      replaceLog: false,
      totalHint: failedRows.length,
    });
  }

  const created = log.filter((row) => row.status === "created").length;
  const skipped = log.filter((row) => row.status === "skipped").length;
  const failed = log.filter((row) => row.status === "failed").length;
  const written = log.filter((row) => row.wroteToSheet).length;
  const showRunPanel = isGenerating || log.length > 0 || Boolean(runError);

  if (!selectedStoreDomain) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a store first. Drafts are created on that store.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-xl border border-border bg-card p-5">
        <div className="space-y-2">
          <Label htmlFor="draft-sheet-url">Google Sheet URL</Label>
          <Input
            id="draft-sheet-url"
            type="url"
            value={sheetUrl}
            onChange={(event) => {
              setSheetUrl(event.target.value);
              setInspection(null);
              setVerifyResult(null);
            }}
            placeholder="https://docs.google.com/spreadsheets/d/…/edit"
            disabled={isInspecting || isVerifying || isGenerating}
          />
          <p className="text-xs text-muted-foreground">
            This module only creates draft orders and writes{" "}
            <code>draft_order_id</code>, <code>draft_order_context</code>, and{" "}
            <code>Repeat Customer</code> (TRUE/FALSE) back. It does not call
            anyone.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleInspect}
            disabled={!sheetUrl.trim() || isInspecting || isVerifying || isGenerating}
          >
            {isInspecting ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="mr-1 h-4 w-4" />
            )}
            Read columns
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleVerifyWrite}
            disabled={!sheetUrl.trim() || isInspecting || isVerifying || isGenerating}
          >
            {isVerifying ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="mr-1 h-4 w-4" />
            )}
            Verify write
          </Button>
        </div>
        {inspectError ? (
          <p className="text-sm text-destructive">{inspectError}</p>
        ) : null}
        {verifyResult ? (
          <p
            className={
              verifyResult.ok
                ? "text-sm text-emerald-400"
                : "text-sm text-destructive"
            }
          >
            {verifyResult.ok ? "Write verified. " : `Write failed (${verifyResult.step}). `}
            {verifyResult.message}
          </p>
        ) : null}
      </div>

      {inspection ? (
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={inspection.canGenerate ? "success" : "destructive"}>
              {inspection.canGenerate
                ? "Ready to generate drafts"
                : "Missing required columns"}
            </Badge>
            <Badge variant="outline">{inspection.dataRowCount} data rows</Badge>
            <Badge variant={inspection.writeConfigured ? "info" : "warning"}>
              {inspection.writeConfigured
                ? "Sheet write enabled"
                : "Sheet write not configured"}
            </Badge>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Columns found</p>
            <div className="flex flex-wrap gap-1.5">
              {inspection.headers.map((header) => (
                <Badge key={header} variant="muted">
                  {header}
                </Badge>
              ))}
            </div>
          </div>

          {!inspection.canGenerate ? (
            <div className="space-y-1 text-sm text-destructive">
              {inspection.missingRequired.map((column) => (
                <p key={column}>Missing required column: {column}</p>
              ))}
              {!inspection.hasVariantColumn ? (
                <p>
                  Missing a variant column: add <code>items_full_json</code> or{" "}
                  <code>variant_ids</code>
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={skipExisting}
                  onCheckedChange={(checked) =>
                    setSkipExisting(checked === true)
                  }
                  disabled={isGenerating}
                />
                Skip rows that already have a draft_order_id
              </label>
              <Button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-1 h-4 w-4" />
                )}
                Generate drafts
              </Button>
              {failed > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleRetryFailed()}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="mr-1 h-4 w-4" />
                  )}
                  Retry failed only
                </Button>
              ) : null}
            </div>
          )}

          {!inspection.writeConfigured ? (
            <p className="text-xs text-muted-foreground">
              Drafts will still be created in Shopify. To write them back into
              the sheet, add a Google service account and share this sheet with
              it as Editor.
            </p>
          ) : null}
        </div>
      ) : null}

      {showRunPanel ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {isGenerating
                ? "Generating drafts…"
                : runError
                  ? "Run stopped"
                  : "Run complete"}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {failed > 0 && !isGenerating ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleRetryFailed()}
                >
                  <RotateCcw className="mr-1 h-4 w-4" />
                  Retry failed only
                </Button>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {progress.done} / {progress.total} rows
              </p>
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{
                width:
                  progress.total > 0
                    ? `${Math.min(100, (progress.done / progress.total) * 100)}%`
                    : "0%",
              }}
            />
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="success">{created} created</Badge>
            <Badge variant="secondary">{skipped} skipped</Badge>
            <Badge variant="destructive">{failed} failed</Badge>
            <Badge variant="outline">{written} written to sheet</Badge>
          </div>
          {runError ? (
            <p className="text-sm text-destructive">{runError}</p>
          ) : null}
          <ul className="max-h-80 space-y-1 overflow-auto text-sm">
            {log.map((row) => (
              <li
                key={`${row.sheetRow}-${row.requestId}`}
                className="flex flex-wrap gap-x-2 border-b border-border/50 py-1.5 last:border-0"
              >
                <span className="text-muted-foreground">Row {row.sheetRow}</span>
                <span className="font-mono text-xs">
                  {row.requestId || "—"}
                </span>
                <span
                  className={
                    row.status === "created"
                      ? "text-emerald-400"
                      : row.status === "failed"
                        ? "text-destructive"
                        : "text-muted-foreground"
                  }
                >
                  {row.status}: {row.message}
                  {row.isRepeatCustomer != null
                    ? ` · Repeat Customer ${
                        row.isRepeatCustomer ? "TRUE" : "FALSE"
                      }`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
