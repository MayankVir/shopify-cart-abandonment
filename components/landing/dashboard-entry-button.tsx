"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

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
      className="inline-flex h-9 items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow transition-colors hover:bg-indigo-700 disabled:pointer-events-none disabled:opacity-70"
    >
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      Go to Dashboard
    </button>
  );
}
