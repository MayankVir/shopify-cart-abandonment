"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  CHECKOUT_SYNC_MODES,
  type CheckoutSyncModeValue,
} from "@/lib/checkout-sync-mode";
import {
  SHEET_SYNC_DIRECTIONS,
  type SheetSyncDirectionValue,
} from "@/lib/sheet-sync-direction";
import {
  getStoreRecoverySettings,
  updateStoreCallFeedbackSettings,
  updateStoreRecoverySettings,
  updateStoreRepeatCustomerSettings,
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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  COMMON_IANA_TIMEZONES,
  DEFAULT_CALL_WINDOW_END_MINUTE,
  DEFAULT_CALL_WINDOW_START_MINUTE,
  minutesToTimeInput,
  timeInputToMinutes,
} from "@/lib/call-window";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type StoreRecoverySettings = NonNullable<
  Awaited<ReturnType<typeof getStoreRecoverySettings>>
>;

export type RecoverySettingsPatch = Pick<
  StoreRecoverySettings,
  | "callDelayMinutes"
  | "sipConcurrency"
  | "autoCallsEnabled"
  | "checkoutSyncMode"
  | "sheetUrl"
  | "sheetSyncDirection"
  | "callFeedbackSheetEnabled"
  | "callFeedbackSheetUrl"
  | "callFeedbackKeyColumn"
  | "repeatCustomerCheckEnabled"
  | "repeatCustomerWindowDays"
  | "callWindowEnabled"
  | "callWindowStartMinute"
  | "callWindowEndMinute"
  | "ianaTimezoneOverride"
>;

interface RecoverySettingsProps {
  storeDomain: string;
  settings: StoreRecoverySettings | null;
  settingsReady: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettingsChange?: (patch: RecoverySettingsPatch) => void;
}

function syncModeFromSettings(
  mode: StoreRecoverySettings["checkoutSyncMode"]
): CheckoutSyncModeValue {
  if (
    mode === CHECKOUT_SYNC_MODES.WEBHOOK ||
    mode === CHECKOUT_SYNC_MODES.POLLING ||
    mode === CHECKOUT_SYNC_MODES.SHEET
  ) {
    return mode;
  }
  return CHECKOUT_SYNC_MODES.POLLING;
}

export function RecoverySettings({
  storeDomain,
  settings,
  settingsReady,
  open,
  onOpenChange,
  onSettingsChange,
}: RecoverySettingsProps) {
  const [callDelayMinutes, setCallDelayMinutes] = useState(30);
  const [sipConcurrency, setSipConcurrency] = useState(1);
  const [autoCallsEnabled, setAutoCallsEnabled] = useState(false);
  const [checkoutSyncMode, setCheckoutSyncMode] =
    useState<CheckoutSyncModeValue>(CHECKOUT_SYNC_MODES.POLLING);
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetSyncDirection, setSheetSyncDirection] =
    useState<SheetSyncDirectionValue>(SHEET_SYNC_DIRECTIONS.BOTTOM);
  const [callFeedbackSheetEnabled, setCallFeedbackSheetEnabled] =
    useState(false);
  const [callFeedbackSheetUrl, setCallFeedbackSheetUrl] = useState("");
  const [callFeedbackKeyColumn, setCallFeedbackKeyColumn] =
    useState("request_id");
  const [repeatCustomerCheckEnabled, setRepeatCustomerCheckEnabled] =
    useState(false);
  const [repeatCustomerWindowDays, setRepeatCustomerWindowDays] =
    useState(180);
  const [callWindowEnabled, setCallWindowEnabled] = useState(true);
  const [windowStart, setWindowStart] = useState(
    minutesToTimeInput(DEFAULT_CALL_WINDOW_START_MINUTE)
  );
  const [windowEnd, setWindowEnd] = useState(
    minutesToTimeInput(DEFAULT_CALL_WINDOW_END_MINUTE)
  );
  const [timezoneOverride, setTimezoneOverride] = useState("shopify");
  const [isPending, startSave] = useTransition();
  const ttaiConfigured = Boolean(
    settings?.ttaiScenarioId && settings?.ttaiTrunkId
  );

  useEffect(() => {
    if (!open || !settings) return;

    setCallDelayMinutes(settings.callDelayMinutes);
    setSipConcurrency(settings.sipConcurrency);
    setAutoCallsEnabled(settings.autoCallsEnabled);
    setSheetUrl(settings.sheetUrl ?? "");
    setSheetSyncDirection(
      settings.sheetSyncDirection === "TOP"
        ? SHEET_SYNC_DIRECTIONS.TOP
        : SHEET_SYNC_DIRECTIONS.BOTTOM
    );
    setCallFeedbackSheetEnabled(settings.callFeedbackSheetEnabled ?? false);
    setCallFeedbackSheetUrl(settings.callFeedbackSheetUrl ?? "");
    setCallFeedbackKeyColumn(settings.callFeedbackKeyColumn || "request_id");
    setRepeatCustomerCheckEnabled(settings.repeatCustomerCheckEnabled ?? false);
    setRepeatCustomerWindowDays(settings.repeatCustomerWindowDays || 180);
    setCheckoutSyncMode(syncModeFromSettings(settings.checkoutSyncMode));
    setCallWindowEnabled(settings.callWindowEnabled ?? true);
    setWindowStart(
      minutesToTimeInput(
        settings.callWindowStartMinute ?? DEFAULT_CALL_WINDOW_START_MINUTE
      )
    );
    setWindowEnd(
      minutesToTimeInput(
        settings.callWindowEndMinute ?? DEFAULT_CALL_WINDOW_END_MINUTE
      )
    );
    setTimezoneOverride(settings.ianaTimezoneOverride?.trim() || "shopify");
  }, [open, settings]);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    startSave(async () => {
      const recovery = await updateStoreRecoverySettings(
        storeDomain,
        callDelayMinutes,
        sipConcurrency,
        autoCallsEnabled,
        {
          callWindowEnabled,
          callWindowStartMinute: timeInputToMinutes(
            windowStart,
            DEFAULT_CALL_WINDOW_START_MINUTE
          ),
          callWindowEndMinute: timeInputToMinutes(
            windowEnd,
            DEFAULT_CALL_WINDOW_END_MINUTE
          ),
          ianaTimezoneOverride:
            timezoneOverride === "shopify" ? "" : timezoneOverride,
        }
      );
      if (!recovery.success) {
        toast.error(recovery.error ?? "Failed to save recovery settings");
        return;
      }

      const sheet = await updateStoreSheetSettings(storeDomain, {
        sheetUrl,
        checkoutSyncMode,
        sheetSyncDirection,
      });
      if (!sheet.success) {
        toast.error(sheet.error ?? "Failed to save sheet settings");
        return;
      }

      const feedback = await updateStoreCallFeedbackSettings(storeDomain, {
        callFeedbackSheetEnabled,
        callFeedbackSheetUrl,
        callFeedbackKeyColumn,
      });
      if (!feedback.success) {
        toast.error(feedback.error ?? "Failed to save call feedback settings");
        return;
      }

      const repeat = await updateStoreRepeatCustomerSettings(storeDomain, {
        repeatCustomerCheckEnabled,
        repeatCustomerWindowDays,
      });
      if (!repeat.success) {
        toast.error(repeat.error ?? "Failed to save repeat-customer settings");
        return;
      }

      onSettingsChange?.({
        callDelayMinutes,
        sipConcurrency,
        autoCallsEnabled,
        checkoutSyncMode,
        sheetUrl,
        sheetSyncDirection,
        callFeedbackSheetEnabled,
        callFeedbackSheetUrl,
        callFeedbackKeyColumn,
        repeatCustomerCheckEnabled,
        repeatCustomerWindowDays,
        callWindowEnabled,
        callWindowStartMinute: timeInputToMinutes(
          windowStart,
          DEFAULT_CALL_WINDOW_START_MINUTE
        ),
        callWindowEndMinute: timeInputToMinutes(
          windowEnd,
          DEFAULT_CALL_WINDOW_END_MINUTE
        ),
        ianaTimezoneOverride:
          timezoneOverride === "shopify" ? "" : timezoneOverride,
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
          <DialogTitle>Checkout recovery</DialogTitle>
          <DialogDescription className="sr-only">
            Source, calling, and optional follow-up for this store.
          </DialogDescription>
        </DialogHeader>

        {showLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading settings…
          </div>
        ) : (
          <form
            id="recovery-settings-form"
            onSubmit={handleSave}
            className="space-y-3 px-5 py-4"
          >
            <SettingsPanel title="Source">
              <Field
                className="col-span-2"
                label="Checkout source"
                htmlFor="checkout-sync-mode"
              >
                <Select
                  value={checkoutSyncMode}
                  onValueChange={(value) =>
                    setCheckoutSyncMode(value as CheckoutSyncModeValue)
                  }
                >
                  <SelectTrigger id="checkout-sync-mode" className="h-8">
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
              </Field>

              {checkoutSyncMode === CHECKOUT_SYNC_MODES.SHEET && (
                <>
                  <Field label="Sheet URL" htmlFor="sheet-url">
                    <Input
                      id="sheet-url"
                      className="h-8"
                      type="url"
                      value={sheetUrl}
                      onChange={(e) => setSheetUrl(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/…"
                    />
                  </Field>
                  <Field label="Read order" htmlFor="sheet-sync-direction">
                    <Select
                      value={sheetSyncDirection}
                      onValueChange={(value) =>
                        setSheetSyncDirection(value as SheetSyncDirectionValue)
                      }
                    >
                      <SelectTrigger id="sheet-sync-direction" className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SHEET_SYNC_DIRECTIONS.BOTTOM}>
                          Newest first
                        </SelectItem>
                        <SelectItem value={SHEET_SYNC_DIRECTIONS.TOP}>
                          Oldest first
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </>
              )}
            </SettingsPanel>

            <SettingsPanel title="Calling">
              <ToggleRow
                id="auto-calls"
                label="Automated calling"
                checked={autoCallsEnabled}
                onCheckedChange={setAutoCallsEnabled}
              />
              <Field label="Delay (min)" htmlFor="call-delay">
                <Input
                  id="call-delay"
                  className="h-8"
                  type="number"
                  min={1}
                  max={1440}
                  value={callDelayMinutes}
                  onChange={(e) => setCallDelayMinutes(Number(e.target.value))}
                />
              </Field>
              <Field label="Live calls" htmlFor="sip-concurrency">
                <Input
                  id="sip-concurrency"
                  className="h-8"
                  type="number"
                  min={1}
                  max={10}
                  value={sipConcurrency}
                  onChange={(e) => setSipConcurrency(Number(e.target.value))}
                />
              </Field>
              <ToggleRow
                id="call-window"
                label="9am–9pm window"
                checked={callWindowEnabled}
                onCheckedChange={setCallWindowEnabled}
              />
              {callWindowEnabled ? (
                <>
                  <Field label="Window start" htmlFor="call-window-start">
                    <Input
                      id="call-window-start"
                      className="h-8"
                      type="time"
                      value={windowStart}
                      onChange={(e) => setWindowStart(e.target.value)}
                    />
                  </Field>
                  <Field label="Window end" htmlFor="call-window-end">
                    <Input
                      id="call-window-end"
                      className="h-8"
                      type="time"
                      value={windowEnd}
                      onChange={(e) => setWindowEnd(e.target.value)}
                    />
                  </Field>
                  <Field
                    className="col-span-2"
                    label="Timezone"
                    htmlFor="call-timezone"
                  >
                    <Select
                      value={timezoneOverride}
                      onValueChange={setTimezoneOverride}
                    >
                      <SelectTrigger id="call-timezone" className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="shopify">
                          Shopify ({settings?.ianaTimezone || "Asia/Kolkata"})
                        </SelectItem>
                        {timezoneOverride !== "shopify" &&
                        !(COMMON_IANA_TIMEZONES as readonly string[]).includes(
                          timezoneOverride
                        ) ? (
                          <SelectItem value={timezoneOverride}>
                            {timezoneOverride}
                          </SelectItem>
                        ) : null}
                        {COMMON_IANA_TIMEZONES.map((zone) => (
                          <SelectItem key={zone} value={zone}>
                            {zone}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </>
              ) : null}
            </SettingsPanel>

            <SettingsPanel title="Optional">
              <ToggleRow
                id="call-feedback-sheet"
                label="Write feedback to sheet"
                checked={callFeedbackSheetEnabled}
                onCheckedChange={setCallFeedbackSheetEnabled}
              />
              {callFeedbackSheetEnabled && (
                <>
                  <Field
                    label="Feedback sheet"
                    htmlFor="call-feedback-sheet-url"
                  >
                    <Input
                      id="call-feedback-sheet-url"
                      className="h-8"
                      type="url"
                      value={callFeedbackSheetUrl}
                      onChange={(e) =>
                        setCallFeedbackSheetUrl(e.target.value)
                      }
                      placeholder="Reuse checkout sheet if blank"
                    />
                  </Field>
                  <Field
                    label="Key column"
                    htmlFor="call-feedback-key-column"
                  >
                    <Input
                      id="call-feedback-key-column"
                      className="h-8"
                      value={callFeedbackKeyColumn}
                      onChange={(e) =>
                        setCallFeedbackKeyColumn(e.target.value)
                      }
                      placeholder="request_id"
                    />
                  </Field>
                </>
              )}
              <ToggleRow
                id="repeat-customer-check"
                label="Flag repeat customers"
                checked={repeatCustomerCheckEnabled}
                onCheckedChange={setRepeatCustomerCheckEnabled}
              >
                {repeatCustomerCheckEnabled ? (
                  <Input
                    id="repeat-customer-window"
                    className="h-8 w-20"
                    type="number"
                    min={1}
                    max={3650}
                    value={repeatCustomerWindowDays}
                    onChange={(e) =>
                      setRepeatCustomerWindowDays(Number(e.target.value))
                    }
                    aria-label="Lookback days"
                  />
                ) : null}
              </ToggleRow>
            </SettingsPanel>

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
            form="recovery-settings-form"
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

function SettingsPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <h3 className="border-b border-border bg-muted/50 px-3 py-2 text-sm font-semibold">
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 p-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ToggleRow({
  id,
  label,
  checked,
  onCheckedChange,
  children,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="col-span-2 flex h-9 items-center justify-between gap-3 rounded-md bg-muted/40 px-2.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        {children}
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      </div>
    </div>
  );
}
