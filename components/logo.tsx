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
          "inline-flex items-end font-black leading-none tracking-tight text-foreground",
          compact ? "text-2xl" : "text-4xl"
        )}
      >
        custello
        <span className="mb-[0.14em] ml-[0.06em] size-[0.2em] shrink-0 rounded-full bg-primary" />
      </span>
    </div>
  );
}
