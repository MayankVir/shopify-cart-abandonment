"use client";

import { type AnalyticsDateRange } from "@/lib/analytics";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface AnalyticsDateRangeSelectProps {
  value: AnalyticsDateRange;
  onChange: (value: AnalyticsDateRange) => void;
}

const OPTIONS: { value: AnalyticsDateRange; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

export function AnalyticsDateRangeSelect({
  value,
  onChange,
}: AnalyticsDateRangeSelectProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="analytics-date-range" className="text-xs text-muted-foreground">
        Date range
      </Label>
      <Select value={value} onValueChange={(v) => onChange(v as AnalyticsDateRange)}>
        <SelectTrigger id="analytics-date-range" className="w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
