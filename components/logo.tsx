import { cn } from "@/lib/utils";

export function Logo({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col justify-center leading-none", className)}>
      <span
        className={cn(
          "inline-flex items-baseline font-black leading-none tracking-tight text-foreground",
          compact ? "text-2xl" : "text-4xl"
        )}
      >
        custello
        <span aria-hidden className="logo-dot ml-[0.07em] size-[0.2em]" />
      </span>
    </div>
  );
}
