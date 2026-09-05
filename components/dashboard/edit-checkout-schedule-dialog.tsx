"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  updateCheckoutScheduleAction,
  type AbandonedCheckoutRow,
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
import { formatPhoneNumber } from "@/lib/utils";

function toDatetimeLocalValue(iso: string | null): string {
  const source = iso ? new Date(iso) : new Date(Date.now() + 15 * 60 * 1000);
  if (Number.isNaN(source.getTime())) return "";

  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    source.getFullYear(),
    pad(source.getMonth() + 1),
    pad(source.getDate()),
  ].join("-") + `T${pad(source.getHours())}:${pad(source.getMinutes())}`;
}

export function EditCheckoutScheduleDialog({
  checkout,
  open,
  onOpenChange,
  onSaved,
}: {
  checkout: AbandonedCheckoutRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startSave] = useTransition();

  useEffect(() => {
    if (!open || !checkout) return;
    setValue(toDatetimeLocalValue(checkout.scheduledCallAt));
    setError(null);
  }, [open, checkout]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!checkout) return;

    if (!value) {
      setError("Choose a date and time");
      return;
    }

    const next = new Date(value);
    if (Number.isNaN(next.getTime())) {
      setError("Enter a valid date and time");
      return;
    }

    startSave(async () => {
      const result = await updateCheckoutScheduleAction(
        checkout.id,
        next.toISOString(),
      );
      if (!result.success) {
        setError(result.error ?? "Failed to update schedule");
        toast.error(result.error ?? "Failed to update schedule");
        return;
      }

      toast.success("Schedule updated");
      onOpenChange(false);
      onSaved();
    });
  }

  const customerLabel = checkout
    ? checkout.customerPhone
      ? formatPhoneNumber(checkout.customerPhone)
      : checkout.customerEmail
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {checkout?.callScheduled ? "Edit schedule" : "Set schedule"}
          </DialogTitle>
          <DialogDescription>
            {customerLabel
              ? `Choose when to call ${customerLabel}. Times in the past become due immediately if auto-call is on.`
              : "Choose when this recovery call should run."}
          </DialogDescription>
        </DialogHeader>
        <form id="edit-checkout-schedule-form" onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="checkout-scheduled-at">Call time</Label>
            <Input
              id="checkout-scheduled-at"
              type="datetime-local"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setError(null);
              }}
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "checkout-scheduled-at-error" : "checkout-scheduled-at-hint"}
            />
            {error ? (
              <p id="checkout-scheduled-at-error" className="text-xs text-destructive">
                {error}
              </p>
            ) : (
              <p id="checkout-scheduled-at-hint" className="text-xs text-muted-foreground">
                Uses your local timezone. Maximum 30 days from now.
              </p>
            )}
          </div>
        </form>
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
            form="edit-checkout-schedule-form"
            disabled={isPending || !checkout}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                Saving
              </>
            ) : (
              "Save schedule"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
