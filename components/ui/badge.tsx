import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-rose-100 text-rose-800 hover:bg-rose-100 dark:bg-rose-500/20 dark:text-rose-100",
        outline: "text-foreground",
        success:
          "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200",
        warning:
          "border-transparent bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-100",
        info: "border-transparent bg-sky-100 text-sky-900 dark:bg-sky-400/15 dark:text-sky-100",
        muted:
          "border-transparent bg-muted text-muted-foreground",
        soft: "border-transparent bg-zinc-100 text-zinc-700 dark:bg-zinc-400/15 dark:text-zinc-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
