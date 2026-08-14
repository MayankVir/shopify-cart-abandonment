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

interface NdrcSettingsProps {
  storeDomain: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NdrcSettings({ storeDomain, open, onOpenChange }: NdrcSettingsProps) {
  const [sheetUrl, setSheetUrl] = useState("");
  const [minAttempts, setMinAttempts] = useState(1);
  const [ttaiConfigured, setTtaiConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadedForDomain, setLoadedForDomain] = useState<string | null>(null);
  const [isPending, startSave] = useTransition();

  useEffect(() => {
    if (!open) return;

    if (loadedForDomain === storeDomain) {
      setIsLoading(false);
      return;
    }

    let active = true;
    setIsLoading(true);

    getStoreNdrcSettings(storeDomain).then((settings) => {
      if (!active) return;
      if (!settings) {
        setIsLoading(false);
        return;
      }

      setSheetUrl(settings.ndrcSheetUrl ?? "");
      setMinAttempts(settings.ndrcMinAttempts ?? 1);
      setTtaiConfigured(
        Boolean(
          (settings.ndrcTtaiScenarioId || settings.ttaiScenarioId) &&
            (settings.ndrcTtaiTrunkId || settings.ttaiTrunkId)
        )
      );
      setLoadedForDomain(storeDomain);
      setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [open, storeDomain, loadedForDomain]);

  useEffect(() => {
    if (loadedForDomain && loadedForDomain !== storeDomain) {
      setLoadedForDomain(null);
    }
  }, [storeDomain, loadedForDomain]);

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

      toast.success("Settings saved");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>NDRC settings</DialogTitle>
          <DialogDescription>
            Configure the sheet of non-delivered orders to sync, and the
            minimum number of failed delivery attempts before an order shows
            up here.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading settings…
          </div>
        ) : (
          <form id="ndrc-settings-form" onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ndrc-sheet-url">NDRC orders sheet URL</Label>
              <Input
                id="ndrc-sheet-url"
                type="url"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=0"
              />
              <p className="text-xs text-muted-foreground">
                Public Google Sheet — shared as &quot;Anyone with the
                link&quot; or published to web as CSV. Expected columns
                include order id, phone, attempts, and address / pincode /
                state / country.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ndrc-min-attempts">Minimum delivery attempts</Label>
              <Input
                id="ndrc-min-attempts"
                type="number"
                min={1}
                max={20}
                value={minAttempts}
                onChange={(e) => setMinAttempts(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Only rows where the delivery has been attempted at least this
                many times are synced. Defaults to 1.
              </p>
            </div>

            {!ttaiConfigured && (
              <p className="text-xs text-amber-400">
                TTAI scenario/trunk not set for NDRC — configure it in the
                Admin panel before dispatching calls.
              </p>
            )}
          </form>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="ndrc-settings-form"
            disabled={isPending || isLoading}
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
