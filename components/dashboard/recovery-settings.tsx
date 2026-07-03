"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  CHECKOUT_SYNC_MODES,
  type CheckoutSyncModeValue,
} from "@/lib/checkout-sync-mode";
import {
  getStoreRecoverySettings,
  updateStoreRecoverySettings,
  updateStoreSheetSettings,
} from "@/app/actions/abandoned-checkouts";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface RecoverySettingsProps {
  storeDomain: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RecoverySettings({
  storeDomain,
  open,
  onOpenChange,
}: RecoverySettingsProps) {
  const [callDelayMinutes, setCallDelayMinutes] = useState(30);
  const [sipConcurrency, setSipConcurrency] = useState(1);
  const [checkoutSyncMode, setCheckoutSyncMode] =
    useState<CheckoutSyncModeValue>(CHECKOUT_SYNC_MODES.POLLING);
  const [sheetUrl, setSheetUrl] = useState("");
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

    getStoreRecoverySettings(storeDomain).then((settings) => {
      if (!active) return;
      if (!settings) {
        setIsLoading(false);
        return;
      }

      setCallDelayMinutes(settings.callDelayMinutes);
      setSipConcurrency(settings.sipConcurrency);
      setSheetUrl(settings.sheetUrl ?? "");
      const mode = settings.checkoutSyncMode;
      if (
        mode === CHECKOUT_SYNC_MODES.WEBHOOK ||
        mode === CHECKOUT_SYNC_MODES.POLLING ||
        mode === CHECKOUT_SYNC_MODES.SHEET
      ) {
        setCheckoutSyncMode(mode);
      }
      setTtaiConfigured(
        Boolean(settings.ttaiScenarioId && settings.ttaiTrunkId)
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
      const recovery = await updateStoreRecoverySettings(
        storeDomain,
        callDelayMinutes,
        sipConcurrency
      );
      if (!recovery.success) {
        toast.error(recovery.error ?? "Failed to save recovery settings");
        return;
      }

      const sheet = await updateStoreSheetSettings(storeDomain, {
        sheetUrl,
        checkoutSyncMode,
      });
      if (!sheet.success) {
        toast.error(sheet.error ?? "Failed to save sheet settings");
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
          <DialogTitle>Checkout recovery settings</DialogTitle>
          <DialogDescription>
            Configure how abandoned checkouts are synced and when calls are
            dispatched.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading settings…
          </div>
        ) : (
          <form id="recovery-settings-form" onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="checkout-sync-mode">Checkout data source</Label>
              <Select
                value={checkoutSyncMode}
                onValueChange={(value) =>
                  setCheckoutSyncMode(value as CheckoutSyncModeValue)
                }
              >
                <SelectTrigger id="checkout-sync-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CHECKOUT_SYNC_MODES.SHEET}>
                    Google Sheet (plugin)
                  </SelectItem>
                  <SelectItem value={CHECKOUT_SYNC_MODES.POLLING}>
                    Shopify Admin API poll
                  </SelectItem>
                  <SelectItem value={CHECKOUT_SYNC_MODES.WEBHOOK}>
                    Shopify webhook
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {checkoutSyncMode === CHECKOUT_SYNC_MODES.SHEET && (
              <div className="space-y-2">
                <Label htmlFor="sheet-url">Abandoned checkout sheet URL</Label>
                <Input
                  id="sheet-url"
                  type="url"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=0"
                />
                <p className="text-xs text-muted-foreground">
                  Public Google Sheet — shared as &quot;Anyone with the link&quot;
                  or published to web as CSV.
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="call-delay">Auto-call delay (minutes)</Label>
                <Input
                  id="call-delay"
                  type="number"
                  min={1}
                  max={1440}
                  value={callDelayMinutes}
                  onChange={(e) => setCallDelayMinutes(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sip-concurrency">SIP concurrency</Label>
                <Input
                  id="sip-concurrency"
                  type="number"
                  min={1}
                  max={10}
                  value={sipConcurrency}
                  onChange={(e) => setSipConcurrency(Number(e.target.value))}
                />
              </div>
            </div>

            {!ttaiConfigured && (
              <p className="text-xs text-amber-400">
                TTAI scenario/trunk not set for this store — configure in Admin
                panel.
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
            form="recovery-settings-form"
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
