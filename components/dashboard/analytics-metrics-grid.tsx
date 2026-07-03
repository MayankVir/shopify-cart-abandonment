"use client";

import {
  BarChart3,
  CheckCircle2,
  Clock,
  PhoneCall,
  PhoneOff,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CallAnalyticsSummary } from "@/app/actions/analytics";
import { formatMinutes } from "@/lib/analytics";

interface AnalyticsMetricsGridProps {
  summary: CallAnalyticsSummary;
}

const METRIC_CONFIG = [
  {
    key: "totalCalls" as const,
    label: "Total Calls",
    icon: PhoneCall,
    description: "All dial attempts",
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: "totalMinutes" as const,
    label: "Minutes Consumed",
    icon: Clock,
    description: "From TTAI session duration",
    format: (v: number) => formatMinutes(v * 60),
  },
  {
    key: "completedCalls" as const,
    label: "Completed",
    icon: CheckCircle2,
    description: "Successful conversations",
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: "failedCalls" as const,
    label: "Failed / No Answer",
    icon: PhoneOff,
    description: "Unreachable or declined",
    format: (v: number) => v.toLocaleString(),
  },
];

export function AnalyticsMetricsGrid({ summary }: AnalyticsMetricsGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {METRIC_CONFIG.map(({ key, label, icon: Icon, description, format }) => (
        <Card key={key}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {label}
            </CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">
              {format(summary[key])}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function AnalyticsEmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <BarChart3 className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Select a store to view call analytics
        </p>
      </CardContent>
    </Card>
  );
}
