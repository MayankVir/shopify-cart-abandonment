import { cn } from "@/lib/utils";

export function Logo({
  className,
  compact = false,
  mark = false,
}: {
  className?: string;
  compact?: boolean;
  /** Collapsed rail: the same “c” and dot, at the same size and baseline as the wordmark. */
  mark?: boolean;
}) {
  return (
    <div className={cn("flex flex-col justify-center leading-none", className)}>
      <span
        className={cn(
          "inline-flex items-baseline font-black leading-none tracking-tight text-foreground",
          mark || !compact ? "text-4xl" : "text-2xl"
        )}
      >
        {mark ? "c" : "custello"}
        <span aria-hidden className="logo-dot ml-[0.07em] size-[0.2em]" />
      </span>
    </div>
  );
}
