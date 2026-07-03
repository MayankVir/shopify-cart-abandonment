import { Skeleton } from "@/components/ui/skeleton";

export function PageHeaderSkeleton({
  titleClassName = "h-9 w-40",
  descriptionClassName = "mt-2 h-4 w-72",
}: {
  titleClassName?: string;
  descriptionClassName?: string;
}) {
  return (
    <div>
      <Skeleton className={titleClassName} />
      <Skeleton className={descriptionClassName} />
    </div>
  );
}

export function MetricsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm"
        >
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-36" />
        </div>
      ))}
    </div>
  );
}

export function ChartCardSkeleton() {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="h-[280px] w-full rounded-lg" />
    </div>
  );
}

export function TableCardSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="space-y-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-10 w-full rounded-md" />
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}

export function RecoveryTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <Skeleton className="h-4 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <div className="space-y-0 border-b border-border px-4 py-3">
        <Skeleton className="h-10 w-full" />
      </div>
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="border-b border-border px-4 py-4 last:border-0">
          <Skeleton className="h-5 w-full" />
        </div>
      ))}
      <div className="border-t border-border px-4 py-3">
        <Skeleton className="h-4 w-36" />
      </div>
    </div>
  );
}

export function OnboardingFormSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-full rounded-md" />
      <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-full max-w-md" />
        <div className="space-y-3 pt-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
    </div>
  );
}
