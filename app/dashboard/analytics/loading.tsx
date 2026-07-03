import {
  ChartCardSkeleton,
  MetricsGridSkeleton,
  PageHeaderSkeleton,
  TableCardSkeleton,
} from "@/components/dashboard/dashboard-page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function AnalyticsLoading() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <PageHeaderSkeleton
          titleClassName="h-9 w-36"
          descriptionClassName="mt-2 h-4 w-80"
        />
        <Skeleton className="h-10 w-[140px] rounded-md" />
      </div>
      <MetricsGridSkeleton />
      <ChartCardSkeleton />
      <TableCardSkeleton rows={5} />
      <TableCardSkeleton rows={4} />
    </div>
  );
}
