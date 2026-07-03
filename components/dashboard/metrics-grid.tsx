"use client";

import {
  CheckCircle2,
  PhoneCall,
  PhoneOff,
  TrendingUp,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAnalyticsStore } from "@/store/use-analytics-store";

const METRIC_CONFIG = [
  {
    key: "totalDispatched" as const,
    label: "Dispatched Calls",
    icon: PhoneCall,
    description: "Total IVR calls queued",
  },
  {
    key: "connectedCalls" as const,
    label: "Connected",
    icon: TrendingUp,
    description: "Successful live connections",
  },
  {
    key: "failedCalls" as const,
    label: "Failed / No Answer",
    icon: PhoneOff,
    description: "Unreachable or declined",
  },
  {
    key: "completedCalls" as const,
    label: "Complete Calls",
    icon: CheckCircle2,
    description: "Calls finished successfully",
  },
];

export function MetricsGrid() {
  const metrics = useAnalyticsStore((s) => s.metrics);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {METRIC_CONFIG.map(({ key, label, icon: Icon, description }) => (
        <Card key={key}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {label}
            </CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">
              {metrics[key].toLocaleString()}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
