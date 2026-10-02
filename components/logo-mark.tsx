import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-8 text-foreground", className)}
    >
      <path
        d="M23.4 9.1a9.4 9.4 0 1 0 .15 13.9"
        stroke="currentColor"
        strokeWidth="4.2"
        strokeLinecap="round"
      />
      <circle cx="25.4" cy="7.15" r="2.15" className="fill-primary" />
    </svg>
  );
}
