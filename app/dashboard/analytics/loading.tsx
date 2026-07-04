import { Loader2 } from "lucide-react";

export default function AnalyticsLoading() {
  return (
    <div className="flex min-h-[min(60vh,32rem)] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
