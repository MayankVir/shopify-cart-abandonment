"use client";

import Link from "next/link";
import { Home, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorFallbackProps {
  error?: Error & { digest?: string };
  title?: string;
  description?: string;
  showRefresh?: boolean;
}

export function ErrorFallback({
  error,
  title = "This page hit a snag",
  description = "Refresh to load a clean session, or go back to the dashboard.",
  showRefresh = true,
}: ErrorFallbackProps) {
  function refresh() {
    window.location.reload();
  }

  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-card-foreground shadow-sm">
        <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-primary">
          <RefreshCw className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          {showRefresh ? (
            <Button type="button" onClick={refresh} className="sm:flex-1">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </Button>
          ) : null}
          <Button
            asChild
            variant={showRefresh ? "outline" : "default"}
            className="sm:flex-1"
          >
            <Link href="/dashboard/recovery">
              <Home className="h-4 w-4" aria-hidden="true" />
              Go home
            </Link>
          </Button>
        </div>

        {error?.digest ? (
          <p className="mt-5 font-mono text-xs text-muted-foreground">
            Reference {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  );
}
