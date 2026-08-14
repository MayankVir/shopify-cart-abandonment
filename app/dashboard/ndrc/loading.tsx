import {
  PageHeaderSkeleton,
  RecoveryTableSkeleton,
} from "@/components/dashboard/dashboard-page-skeleton";

export default function NdrcLoading() {
  return (
    <div className="space-y-8">
      <PageHeaderSkeleton
        titleClassName="h-9 w-28"
        descriptionClassName="mt-2 h-4 w-[26rem]"
      />
      <RecoveryTableSkeleton />
    </div>
  );
}
