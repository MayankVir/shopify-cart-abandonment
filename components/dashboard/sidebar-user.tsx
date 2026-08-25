"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserButton, useUser } from "@clerk/nextjs";
import { refreshMerchantCreditBalance } from "@/app/actions/billing";
import {
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

export interface SidebarAccountSummary {
  creditBalanceMinutes: number;
  ratePerMinuteUsd: number;
  currency: string;
  storeCount: number;
  freeMinutesGranted: boolean;
  isAdmin: boolean;
}

interface SidebarUserProps {
  account: SidebarAccountSummary | null;
}

function formatMinutes(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

export function SidebarUser({ account }: SidebarUserProps) {
  const { user, isLoaded } = useUser();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const [minutes, setMinutes] = useState<number>(
    account?.creditBalanceMinutes ?? 0
  );

  useEffect(() => {
    setMinutes(account?.creditBalanceMinutes ?? 0);
  }, [account?.creditBalanceMinutes]);

  useEffect(() => {
    if (!isLoaded) return;

    const refresh = () => {
      refreshMerchantCreditBalance()
        .then((balance) => {
          if (typeof balance === "number" && Number.isFinite(balance)) {
            setMinutes(balance);
          }
        })
        .catch((error) => {
          console.error("Failed to refresh merchant credit balance:", error);
        });
    };

    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [isLoaded]);

  if (!isLoaded) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex flex-col gap-2 px-2 py-1.5">
            <Skeleton className="h-9 w-full rounded-md" />
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    "";
  const name =
    user?.fullName?.trim() ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    email.split("@")[0] ||
    "Account";
  const username = user?.username ? `@${user.username}` : null;

  return (
    <SidebarMenu>
      {!collapsed && account ? (
        <SidebarMenuItem>
          <Link
            href="/dashboard/billing"
            className="mb-2 flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent"
          >
            <span className="text-sidebar-foreground/70">Minutes left</span>
            <span className="font-semibold tabular-nums text-sidebar-foreground">
              {formatMinutes(minutes)}
            </span>
          </Link>
        </SidebarMenuItem>
      ) : null}

      <SidebarMenuItem>
        <div
          className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <UserButton
            afterSignOutUrl="/sign-in"
            appearance={{
              elements: {
                avatarBox: "h-9 w-9",
              },
            }}
          />
          {!collapsed ? (
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold text-sidebar-foreground">
                {name}
              </p>
              {email ? (
                <p className="truncate text-xs text-sidebar-foreground/60">
                  {email}
                </p>
              ) : null}
              {username ? (
                <p className="truncate text-[11px] text-sidebar-foreground/45">
                  {username}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
