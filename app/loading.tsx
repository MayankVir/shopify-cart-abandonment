import { Loader2 } from "lucide-react";

/**
 * Root-level Suspense fallback. Covers async work in nested layouts
 * (e.g. app/dashboard/layout.tsx fetching the current user + store list)
 * that would otherwise render nothing until it resolves.
 */
export default function RootLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Loading…</p>
      </div>
    </div>
  );
}
