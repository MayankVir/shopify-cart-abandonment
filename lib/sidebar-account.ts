import type { SidebarAccountSummary } from "@/components/dashboard/sidebar-user";

export function buildSidebarAccountSummary(input: {
  creditBalanceMinutes: number;
  ratePerMinuteUsd: number;
  currency: string;
  storeCount: number;
  freeMinutesGranted: boolean;
  isAdmin: boolean;
}): SidebarAccountSummary {
  return input;
}
