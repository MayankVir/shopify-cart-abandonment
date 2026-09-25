"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AUTO_CALL_ENROLLMENT_OPTIONS,
  DEFAULT_AUTO_CALL_ENROLLMENT,
  type AutoCallEnrollmentSelection,
} from "@/lib/call-status";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function AutoCallEnrollmentDialog({
  open,
  pending = false,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (selection: AutoCallEnrollmentSelection) => void;
}) {
  const [selection, setSelection] = useState(DEFAULT_AUTO_CALL_ENROLLMENT);

  useEffect(() => {
    if (!open) return;
    setSelection(DEFAULT_AUTO_CALL_ENROLLMENT);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Queue existing checkouts</DialogTitle>
          <DialogDescription>
            Auto-call is turning on. Choose which existing checkouts to
            schedule. New ones are still queued as they arrive. Pending is on
            by default.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {AUTO_CALL_ENROLLMENT_OPTIONS.map((option) => (
            <div
              key={option.id}
              className="flex items-start justify-between gap-3 rounded-md bg-muted/40 px-3 py-2.5"
            >
              <div className="space-y-0.5">
                <Label htmlFor={`enroll-${option.id}`} className="text-sm font-medium">
                  {option.label}
                </Label>
                <p className="text-xs text-muted-foreground">{option.description}</p>
              </div>
              <Switch
                id={`enroll-${option.id}`}
                checked={selection[option.id]}
                disabled={pending}
                onCheckedChange={(checked) =>
                  setSelection((current) => ({ ...current, [option.id]: checked }))
                }
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(selection)}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Turn on auto-call
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
