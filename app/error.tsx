"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/error/error-fallback";

export default function RootError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root error boundary", error);
  }, [error]);

  return <ErrorFallback error={error} />;
}
