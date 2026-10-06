"use client";

import { createContext, useContext } from "react";
import { useAnalyticsStore } from "@/store/use-analytics-store";

const FirstStoreContext = createContext<string | null>(null);

/**
 * Seeds the active store from the server so pages never render a
 * "Select a store" state while the client store is still empty.
 */
export function StoresProvider({
  firstStoreDomain,
  children,
}: {
  firstStoreDomain: string | null;
  children: React.ReactNode;
}) {
  return (
    <FirstStoreContext.Provider value={firstStoreDomain}>
      {children}
    </FirstStoreContext.Provider>
  );
}

/** The chosen store, or the account's first store until a choice is made. */
export function useSelectedStoreDomain(): string | null {
  const selected = useAnalyticsStore((s) => s.selectedStoreDomain);
  const first = useContext(FirstStoreContext);
  return selected ?? first;
}
