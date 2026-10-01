"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { navCtaClass } from "@/components/landing/styles";

const DASHBOARD_HOME = "/dashboard/recovery";

export function DashboardEntryButton() {
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      onClick={() => {
        setPending(true);
        window.location.assign(DASHBOARD_HOME);
      }}
      className={navCtaClass}
    >
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      Go to Dashboard
    </button>
  );
}
