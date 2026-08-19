import {
  PageHeaderSkeleton,
  RecoveryTableSkeleton,
} from "@/components/dashboard/dashboard-page-skeleton";

export default function DashboardLoading() {
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