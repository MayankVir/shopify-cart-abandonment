import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function TopLoaderLine() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[80] h-0.5 overflow-hidden bg-primary/15"
    >
      <div className="custello-load-line h-full w-1/3 bg-primary" />
    </div>
  );
}

export function PageSpinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex min-h-[min(60vh,32rem)] items-center justify-center",
        className
      )}
    >
      <TopLoaderLine />
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export function InlineSpinner({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center py-10", className)}>
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
