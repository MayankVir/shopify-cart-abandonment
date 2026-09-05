"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertCircle, Loader2, Pencil, Phone, PhoneOff } from "lucide-react";
import {
  getCallAttemptsForCheckout,
  updateCheckoutCustomerNameAction,
  type AbandonedCheckoutRow,
  type CallAttemptRow,
} from "@/app/actions/abandoned-checkouts";
import {
  displayCheckoutStatus,
  formatCallStatus,
  isActiveCall,
} from "@/lib/call-status";
import { formatCurrency, formatPhoneNumber } from "@/lib/utils";
import { sanitizeRecoveryError } from "@/lib/recovery-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TtaiCallDetails } from "@/components/dashboard/ttai-call-details";

function DetailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="text-sm leading-relaxed text-foreground">{children}</div>
    </div>
  );
}

export function CheckoutDetailDrawer({
  checkout,
  open,
  onOpenChange,
  onSaved,
  onEditSchedule,
  onRemoveSchedule,
  onCallNow,
  canEditScheduleTime,
  canRemoveSchedule,
  canCallNow,
  isCalling,
  isStopping,
}: {
  checkout: AbandonedCheckoutRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  onEditSchedule: () => void;
  onRemoveSchedule: () => void;
  onCallNow: () => void;
  canEditScheduleTime: boolean;
  canRemoveSchedule: boolean;
  canCallNow: boolean;
  isCalling: boolean;
  isStopping: boolean;
}) {
  const [attempts, setAttempts] = useState<CallAttemptRow[]>([]);
  const [isLoadingAttempts, setIsLoadingAttempts] = useState(false);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSavingName, startSaveName] = useTransition();

  useEffect(() => {
    if (!open || !checkout) return;
    setName(checkout.customerName);
    setNameError(null);
  }, [open, checkout]);

  useEffect(() => {
    if (!open || !checkout) return;

    let active = true;
    setIsLoadingAttempts(true);
    getCallAttemptsForCheckout(checkout.id)
      .then((rows) => {
        if (active) setAttempts(rows);
      })
      .finally(() => {
        if (active) setIsLoadingAttempts(false);
      });

    return () => {
      active = false;
    };
  }, [open, checkout?.id, checkout?.callStatus]);

  function handleSaveName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!checkout) return;

    const nextName = name.trim();
    if (nextName.length > 80) {
      setNameError("Name must be 80 characters or fewer");
      return;
    }

    startSaveName(async () => {
      const result = await updateCheckoutCustomerNameAction(
        checkout.id,
        nextName,
      );
      if (!result.success) {
        setNameError(result.error ?? "Failed to save name");
        toast.error(result.error ?? "Failed to save name");
        return;
      }
      toast.success(nextName ? "Name saved" : "Name cleared");
      onSaved();
    });
  }

  const status = checkout
    ? displayCheckoutStatus(checkout.callStatus, checkout.callScheduled)
    : null;
  const lastFailure = sanitizeRecoveryError(
    checkout?.lastError || checkout?.latestAttempt?.failureReason,
  );
  const title =
    checkout?.customerName ||
    (checkout?.customerPhone
      ? formatPhoneNumber(checkout.customerPhone)
      : "Checkout details");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <SheetHeader className="border-b border-border px-6 py-5 pr-12 text-left">
          <SheetTitle className="truncate">{title}</SheetTitle>
          <SheetDescription>
            {checkout
              ? `${formatCurrency(checkout.cartValue)} cart`
              : "Checkout details"}
          </SheetDescription>
        </SheetHeader>

        {checkout && status ? (
          <div className="space-y-8 px-6 py-5">
            {lastFailure ? (
              <section className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-3">
                <p className="flex items-start gap-2 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <span className="font-medium">Last failure. </span>
                    {lastFailure}
                  </span>
                </p>
              </section>
            ) : null}
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Customer</h3>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>

              <form onSubmit={handleSaveName} className="space-y-2">
                <Label htmlFor="checkout-customer-name">Name</Label>
                <div className="flex gap-2">
                  <Input
                    id="checkout-customer-name"
                    autoFocus={false}
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      setNameError(null);
                    }}
                    placeholder="Add customer name"
                    maxLength={80}
                    aria-invalid={nameError ? true : undefined}
                    aria-describedby={
                      nameError ? "checkout-customer-name-error" : undefined
                    }
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={isSavingName || name.trim() === checkout.customerName}
                  >
                    {isSavingName ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
                {nameError ? (
                  <p id="checkout-customer-name-error" className="text-xs text-destructive">
                    {nameError}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Used on the recovery call when the sheet or Shopify name is missing.
                  </p>
                )}
              </form>

              <div className="grid gap-4 sm:grid-cols-2">
                <DetailField label="Phone">
                  {checkout.customerPhone
                    ? formatPhoneNumber(checkout.customerPhone)
                    : "—"}
                </DetailField>
                <DetailField label="Email">
                  {checkout.customerEmail || "—"}
                </DetailField>
              </div>

              <DetailField label="Address">
                {checkout.address || "No address on this checkout"}
              </DetailField>
            </section>

            <section className="space-y-3 border-t border-border pt-6">
              <h3 className="text-sm font-semibold">Checkout</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailField label="Value">
                  {formatCurrency(checkout.cartValue)}
                </DetailField>
                <DetailField label="Draft order">
                  {checkout.draftOrderId || "—"}
                </DetailField>
              </div>
              {checkout.checkoutUrl ? (
                <a
                  href={checkout.checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  Open live cart checkout
                </a>
              ) : null}
            </section>

            <section className="space-y-3 border-t border-border pt-6">
              <h3 className="text-sm font-semibold">Schedule</h3>
              <DetailField label="Call time">
                {checkout.scheduledCallAt
                  ? new Date(checkout.scheduledCallAt).toLocaleString([], {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "Not set"}
              </DetailField>
              <div className="flex flex-wrap gap-2">
                {canEditScheduleTime ? (
                  <Button size="sm" variant="outline" onClick={onEditSchedule}>
                    <Pencil className="h-3.5 w-3.5" />
                    {checkout.callScheduled ? "Edit time" : "Set time"}
                  </Button>
                ) : null}
                {canRemoveSchedule ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={onRemoveSchedule}
                    disabled={isStopping}
                  >
                    {isStopping ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <PhoneOff className="h-3.5 w-3.5" />
                    )}
                    {isActiveCall(checkout.callStatus)
                      ? "Stop call"
                      : "Remove schedule"}
                  </Button>
                ) : null}
                {canCallNow ? (
                  <Button size="sm" onClick={onCallNow} disabled={isCalling}>
                    {isCalling ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Phone className="h-3.5 w-3.5" />
                    )}
                    Call now
                  </Button>
                ) : null}
              </div>
            </section>

            <section className="space-y-3 border-t border-border pt-6">
              <h3 className="text-sm font-semibold">Call history</h3>
              {isLoadingAttempts ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading attempts…
                </p>
              ) : attempts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No call attempts yet.
                </p>
              ) : (
                attempts.map((attempt) => (
                  <div
                    key={attempt.id}
                    className="space-y-2 rounded-md border border-border/70 p-3"
                  >
                    <p className="text-xs text-muted-foreground">
                      {attempt.trigger} · {formatCallStatus(attempt.status)} ·{" "}
                      {new Date(attempt.startedAt).toLocaleString()}
                    </p>
                    {sanitizeRecoveryError(attempt.failureReason) ? (
                      <p className="text-xs text-destructive">
                        {sanitizeRecoveryError(attempt.failureReason)}
                      </p>
                    ) : null}
                    <TtaiCallDetails
                      transcript={attempt.transcript}
                      aiSummary={undefined}
                      toolCallsJson={attempt.toolCallsJson}
                    />
                  </div>
                ))
              )}
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
