import {
  OnboardingFormSkeleton,
  PageHeaderSkeleton,
} from "@/components/dashboard/dashboard-page-skeleton";

export default function OnboardingLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeaderSkeleton
        titleClassName="h-9 w-56"
        descriptionClassName="mt-2 h-4 w-full max-w-lg"
      />
      <OnboardingFormSkeleton />
    </div>
  );
}
