"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { skipOnboarding } from "@/app/actions/onboarding";
import { Button } from "@/components/ui/button";

function SkipSubmit() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="ghost" disabled={pending}>
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      Skip for now
    </Button>
  );
}

export function SkipOnboardingButton() {
  return (
    <form action={skipOnboarding}>
      <SkipSubmit />
    </form>
  );
}
