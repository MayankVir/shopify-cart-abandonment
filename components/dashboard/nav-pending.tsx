"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PageSpinner } from "@/components/dashboard/page-spinner";

interface NavPendingContextValue {
  pendingHref: string | null;
  setPendingHref: (href: string | null) => void;
}

const NavPendingContext = createContext<NavPendingContextValue>({
  pendingHref: null,
  setPendingHref: () => {},
});

export function useNavPending() {
  return useContext(NavPendingContext);
}

export function isNavItemActive(
  pathname: string,
  pendingHref: string | null,
  href: string
) {
  const current = pendingHref ?? pathname;
  return current === href || current.startsWith(`${href}/`);
}

export function NavPendingProvider({
  children,
  prefetchHrefs = [],
}: {
  children: React.ReactNode;
  prefetchHrefs?: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    for (const href of prefetchHrefs) {
      router.prefetch(href);
    }
  }, [pathname, prefetchHrefs, router]);

  return (
    <NavPendingContext.Provider value={{ pendingHref, setPendingHref }}>
      {children}
    </NavPendingContext.Provider>
  );
}

export function PendingPageSlot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { pendingHref } = useNavPending();
  const showPending = Boolean(pendingHref && pendingHref !== pathname);

  if (showPending && pendingHref) {
    return <PageSpinner />;
  }

  return <>{children}</>;
}
