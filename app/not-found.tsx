import { ErrorFallback } from "@/components/error/error-fallback";

export default function NotFound() {
  return (
    <ErrorFallback
      title="This page is not here"
      description="The link may be old. Go home to open the dashboard."
      showRefresh={false}
    />
  );
}
