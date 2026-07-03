"use client";

import Link from "next/link";
import { Store } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAnalyticsStore } from "@/store/use-analytics-store";
import { cn } from "@/lib/utils";

interface StoreSelectorProps {
  stores: Array<{ storeDomain: string }>;
  className?: string;
}

function storeDisplayName(domain: string): string {
  return domain.replace(/\.myshopify\.com$/i, "") || domain;
}

const shell =
  "h-9 w-auto max-w-[min(100vw-8rem,18rem)] gap-2 rounded-md border-border/70 bg-muted/30 px-2.5 text-sm shadow-none hover:bg-muted/45 focus:ring-1 focus:ring-ring";

export function StoreSelector({ stores, className }: StoreSelectorProps) {
  const selectedStoreDomain = useAnalyticsStore((s) => s.selectedStoreDomain);
  const setSelectedStoreDomain = useAnalyticsStore(
    (s) => s.setSelectedStoreDomain,
  );

  const activeDomain = selectedStoreDomain ?? stores[0]?.storeDomain ?? "";

  if (stores.length === 0) {
    return (
      <Link
        href="/dashboard/onboarding?tab=manual"
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-muted/50 hover:text-foreground",
          className,
        )}
      >
        <Store className="h-3.5 w-3.5 shrink-0" />
        Connect store
      </Link>
    );
  }

  const prefix = (
    <>
      <Store className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-xs text-muted-foreground">Store</span>
      <span className="h-3.5 w-px shrink-0 bg-border" />
    </>
  );

  if (stores.length === 1) {
    return (
      <div
        className={cn(
          "inline-flex h-9 max-w-[min(100vw-8rem,18rem)] items-center gap-2 rounded-md border border-border/70 bg-muted/30 px-2.5 text-sm",
          className,
        )}
        title={activeDomain}
      >
        {prefix}
        <span className="truncate font-medium">
          {storeDisplayName(activeDomain)}
        </span>
      </div>
    );
  }

  return (
    <Select value={activeDomain} onValueChange={setSelectedStoreDomain}>
      <SelectTrigger
        className={cn(
          shell,
          className,
          "[&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:opacity-50",
        )}
        aria-label="Switch store"
      >
        {prefix}
        <SelectValue placeholder="Select store" />
      </SelectTrigger>
      <SelectContent align="start">
        {stores.map((store) => (
          <SelectItem key={store.storeDomain} value={store.storeDomain}>
            {storeDisplayName(store.storeDomain)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
