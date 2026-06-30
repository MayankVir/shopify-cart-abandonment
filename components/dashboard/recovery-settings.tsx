"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  getStoreRecoverySettings,
  updateStoreRecoverySettings,
} from "@/app/actions/abandoned-checkouts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RecoverySettingsProps {
  storeDomain: string;
}

export function RecoverySettings({ storeDomain }: RecoverySettingsProps) {
  const [callDelayMinutes, setCallDelayMinutes] = useState(30);
  const [sipConcurrency, setSipConcurrency] = useState(1);
  const [ttaiConfigured, setTtaiConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startSave] = useTransition();

  useEffect(() => {
    let active = true;
    getStoreRecoverySettings(storeDomain).then((settings) => {
      if (!active || !settings) return;
      setCallDelayMinutes(settings.callDelayMinutes);
      setSipConcurrency(settings.sipConcurrency);
      setTtaiConfigured(Boolean(settings.ttaiScenarioId && settings.ttaiTrunkId));
      setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [storeDomain]);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    startSave(async () => {
      const result = await updateStoreRecoverySettings(
        storeDomain,
        callDelayMinutes,
        sipConcurrency
      );
      if (!result.success) {
        toast.error(result.error ?? "Failed to save settings");
        return;
      }
      toast.success("Recovery settings saved");
    });
  }

  if (isLoading) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading settings…
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSave}
      className="mt-4 space-y-4 rounded-lg border border-border bg-muted/20 p-4"
    >
      <div className="grid gap-4 sm:grid-cols-3">
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
        <div className="space-y-2">
          <Label>Shopify poll interval</Label>
          <Input value="5 minutes" disabled />
        </div>
      </div>
      {!ttaiConfigured && (
        <p className="text-xs text-amber-400">
          TTAI scenario/trunk not set for this store — configure in Admin panel.
        </p>
      )}
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Saving…
          </>
        ) : (
          "Save settings"
        )}
      </Button>
    </form>
  );
}
