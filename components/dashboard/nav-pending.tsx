"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AdminPageSkeleton,
  ChartCardSkeleton,
  DraftsPageSkeleton,
  MetricsGridSkeleton,
  OnboardingFormSkeleton,
  PageHeaderSkeleton,
  RecoveryTableSkeleton,
  TableCardSkeleton,
} from "@/components/dashboard/dashboard-page-skeleton";

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

export function DashboardRouteSkeleton({ href }: { href: string }) {
  if (href.startsWith("/dashboard/drafts")) return <DraftsPageSkeleton />;
  if (href.startsWith("/dashboard/admin")) return <AdminPageSkeleton />;
  if (href.startsWith("/dashboard/recovery")) {
    return (
      <div className="space-y-8">
        <PageHeaderSkeleton
          titleClassName="h-9 w-32"
          descriptionClassName="mt-2 h-4 w-[22rem]"
        />
        <RecoveryTableSkeleton />
      </div>
    );
  }
  if (href.startsWith("/dashboard/analytics")) {
    return (
      <div className="space-y-8">
        <PageHeaderSkeleton />
        <MetricsGridSkeleton />
        <ChartCardSkeleton />
      </div>
    );
  }
  if (href.startsWith("/dashboard/billing")) {
    return (
      <div className="space-y-8">
        <PageHeaderSkeleton
          titleClassName="h-9 w-24"
          descriptionClassName="mt-2 h-4 w-64"
        />
        <MetricsGridSkeleton count={2} />
        <TableCardSkeleton rows={4} />
      </div>
    );
  }
  if (href.startsWith("/dashboard/ndrc")) {
    return (
      <div className="space-y-8">
        <PageHeaderSkeleton
          titleClassName="h-9 w-20"
          descriptionClassName="mt-2 h-4 w-72"
        />
        <TableCardSkeleton rows={5} />
      </div>
    );
  }
  if (href.startsWith("/dashboard/onboarding")) {
    return (
      <div className="space-y-8">
        <PageHeaderSkeleton
          titleClassName="h-9 w-40"
          descriptionClassName="mt-2 h-4 w-80"
        />
        <OnboardingFormSkeleton />
      </div>
    );
  }
  return (
    <div className="space-y-8">
      <PageHeaderSkeleton />
      <TableCardSkeleton />
    </div>
  );
}

export function PendingPageSlot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { pendingHref } = useNavPending();
  const showPending = Boolean(pendingHref && pendingHref !== pathname);

  if (showPending && pendingHref) {
    return <DashboardRouteSkeleton href={pendingHref} />;
  }

  return <>{children}</>;
}
