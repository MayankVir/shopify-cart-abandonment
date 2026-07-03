"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TtaiAnalyticsTimeSeriesPoint } from "@/lib/ttai";

interface TtaiTimeSeriesPanelProps {
  points: TtaiAnalyticsTimeSeriesPoint[];
  scenarioName?: string;
}

export function TtaiTimeSeriesPanel({
  points,
  scenarioName,
}: TtaiTimeSeriesPanelProps) {
  if (points.length === 0) return null;

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle>Usage over time</CardTitle>
        <CardDescription>
          TTAI org time series
          {scenarioName ? ` · ${scenarioName}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Sessions</TableHead>
                <TableHead>Minutes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {points.map((point) => (
                <TableRow key={point.date}>
                  <TableCell className="text-sm">{point.date}</TableCell>
                  <TableCell className="text-sm">{point.sessions}</TableCell>
                  <TableCell className="text-sm">
                    {point.minutes.toFixed(1)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
