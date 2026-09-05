"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  getStoreNdrcSettings,
  updateStoreNdrcSettings,
} from "@/app/actions/ndrc-orders";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type StoreNdrcSettings = NonNullable<
  Awaited<ReturnType<typeof getStoreNdrcSettings>>
>;

export type NdrcSettingsPatch = Pick<
  StoreNdrcSettings,
  "ndrcSheetUrl" | "ndrcMinAttempts"
>;

interface NdrcSettingsProps {
  storeDomain: string;
  settings: StoreNdrcSettings | null;
  settingsReady: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettingsChange?: (patch: NdrcSettingsPatch) => void;
}

export function NdrcSettings({
  storeDomain,
  settings,
  settingsReady,
  open,
  onOpenChange,
  onSettingsChange,
}: NdrcSettingsProps) {
  const [sheetUrl, setSheetUrl] = useState("");
  const [minAttempts, setMinAttempts] = useState(1);
  const [isPending, startSave] = useTransition();
  const ttaiConfigured = Boolean(
    (settings?.ndrcTtaiScenarioId || settings?.ttaiScenarioId) &&
      (settings?.ndrcTtaiTrunkId || settings?.ttaiTrunkId)
  );

  useEffect(() => {
    if (!open || !settings) return;

    setSheetUrl(settings.ndrcSheetUrl ?? "");
    setMinAttempts(settings.ndrcMinAttempts ?? 1);
  }, [open, settings]);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    startSave(async () => {
      const result = await updateStoreNdrcSettings(storeDomain, {
        ndrcSheetUrl: sheetUrl,
        ndrcMinAttempts: minAttempts,
      });
      if (!result.success) {
        toast.error(result.error ?? "Failed to save NDRC settings");
        return;
      }

      onSettingsChange?.({
        ndrcSheetUrl: sheetUrl,
        ndrcMinAttempts: minAttempts,
      });
      toast.success("Settings saved");
      onOpenChange(false);
    });
  }

  const showLoading = open && !settingsReady;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-visible p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border px-5 py-3 pr-12">
          <DialogTitle>NDRC settings</DialogTitle>
          <DialogDescription className="sr-only">
            Which sheet to sync, and how many failed deliveries qualify an order.
          </DialogDescription>
        </DialogHeader>

        {showLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading settings…
          </div>
        ) : (
          <form
            id="ndrc-settings-form"
            onSubmit={handleSave}
            className="space-y-3 px-5 py-4"
          >
            <section className="overflow-hidden rounded-lg border border-border">
              <h3 className="border-b border-border bg-muted/50 px-3 py-2 text-sm font-semibold">
                Orders
              </h3>
              <div className="grid grid-cols-[1fr_7.5rem] gap-3 p-3">
                <div className="space-y-1">
                  <Label
                    htmlFor="ndrc-sheet-url"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Sheet URL
                  </Label>
                  <Input
                    id="ndrc-sheet-url"
                    className="h-8"
                    type="url"
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/…"
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor="ndrc-min-attempts"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Min attempts
                  </Label>
                  <Input
                    id="ndrc-min-attempts"
                    className="h-8"
                    type="number"
                    min={1}
                    max={20}
                    value={minAttempts}
                    onChange={(e) => setMinAttempts(Number(e.target.value))}
                  />
                </div>
              </div>
            </section>

            {!ttaiConfigured && (
              <p className="text-xs text-amber-800 dark:text-amber-200">
                TTAI scenario and trunk are not set. Configure them in Admin
                before dispatching calls.
              </p>
            )}
          </form>
        )}

        <DialogFooter className="border-t border-border px-5 py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            form="ndrc-settings-form"
            disabled={isPending || showLoading}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                Saving…
              </>
            ) : (
              "Save settings"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
