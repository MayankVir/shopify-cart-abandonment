import {
  PageHeaderSkeleton,
  TableCardSkeleton,
} from "@/components/dashboard/dashboard-page-skeleton";

export default function AdminLoading() {
  return (
    <div className="space-y-8">
      <PageHeaderSkeleton
        titleClassName="h-9 w-56"
        descriptionClassName="mt-2 h-4 w-[26rem]"
      />
      <TableCardSkeleton rows={5} />
    </div>
  );
}
