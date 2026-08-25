import { PageHeaderSkeleton } from "@/components/dashboard/dashboard-page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function TeamLoading() {
  return (
    <div className="space-y-8">
      <PageHeaderSkeleton
        titleClassName="h-9 w-24"
        descriptionClassName="mt-2 h-4 w-[26rem]"
      />
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}
