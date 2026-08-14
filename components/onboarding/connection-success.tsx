"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface ConnectionSuccessProps {
  shopDomain: string;
}

const SUCCESS_DELAY_MS = 700;
const REDIRECT_DELAY_MS = 1200;

function storeDisplayName(domain: string): string {
  return domain.replace(/\.myshopify\.com$/i, "") || domain;
}

export function ConnectionSuccess({ shopDomain }: ConnectionSuccessProps) {
  const router = useRouter();
  const [isFetching, setIsFetching] = useState(true);
  const displayName = storeDisplayName(shopDomain);

  // Purely a short perceived-processing beat before showing success — no data
  // fetch needed, the domain is already known from the OAuth redirect itself.
  useEffect(() => {
    const timer = setTimeout(() => setIsFetching(false), SUCCESS_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isFetching) return;

    const redirect = setTimeout(() => {
      router.push("/dashboard/analytics");
    }, REDIRECT_DELAY_MS);

    return () => clearTimeout(redirect);
  }, [isFetching, router]);

  return (
    <Card className="border-border/60">
      <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
        {isFetching ? (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            <div>
              <p className="text-lg font-semibold">Finishing connection…</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Setting up {displayName}
              </p>
            </div>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <div>
              <p className="text-lg font-semibold">
                Connected to {displayName}!
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Redirecting you to analytics…
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
