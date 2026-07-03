import {
  ChartCardSkeleton,
  MetricsGridSkeleton,
  PageHeaderSkeleton,
} from "@/components/dashboard/dashboard-page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function BillingLoading() {
  return (
    <div className="space-y-8">
      <PageHeaderSkeleton
        titleClassName="h-9 w-28"
        descriptionClassName="mt-2 h-4 w-96"
      />
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Skeleton className="h-6 w-44 rounded-full" />
          <Skeleton className="h-10 w-[140px] rounded-md" />
        </div>
        <MetricsGridSkeleton count={3} />
        <ChartCardSkeleton />
      </div>
    </div>
  );
}
