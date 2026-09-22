"use client";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { BadgeVariant } from "@/lib/call-status";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  label: string;
  variant: BadgeVariant;
  /** Failure reason shown on hover/focus; no tooltip is rendered without it. */
  detail?: string;
  className?: string;
}

export function StatusBadge({
  label,
  variant,
  detail,
  className,
}: StatusBadgeProps) {
  if (!detail) {
    return (
      <Badge variant={variant} className={className}>
        {label}
      </Badge>
    );
  }

  return (
    <Tooltip>
      {/* Badge renders a plain div, so the span carries the trigger ref and focus. */}
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex cursor-help rounded-full">
          <Badge variant={variant} className={cn("cursor-help", className)}>
            {label}
          </Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs whitespace-normal break-words">
        {detail}
      </TooltipContent>
    </Tooltip>
  );
}
