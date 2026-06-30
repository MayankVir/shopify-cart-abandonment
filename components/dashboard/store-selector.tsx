"use client";

import { Store } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAnalyticsStore } from "@/store/use-analytics-store";

interface StoreSelectorProps {
  stores: Array<{ storeDomain: string }>;
}

export function StoreSelector({ stores }: StoreSelectorProps) {
  const selectedStoreDomain = useAnalyticsStore((s) => s.selectedStoreDomain);
  const setSelectedStoreDomain = useAnalyticsStore(
    (s) => s.setSelectedStoreDomain
  );

  if (stores.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
        <Store className="h-4 w-4" />
        No stores connected.{" "}
        <a
          href="/dashboard/onboarding?tab=manual"
          className="text-primary underline-offset-4 hover:underline"
        >
          Connect a store
        </a>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Store className="h-4 w-4 text-muted-foreground" />
      <Select
        value={selectedStoreDomain ?? stores[0]?.storeDomain ?? ""}
        onValueChange={(value) => setSelectedStoreDomain(value)}
      >
        <SelectTrigger className="w-[280px]">
          <SelectValue placeholder="Select store" />
        </SelectTrigger>
        <SelectContent>
          {stores.map((store) => (
            <SelectItem key={store.storeDomain} value={store.storeDomain}>
              {store.storeDomain}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
