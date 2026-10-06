"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useClerk, useUser } from "@clerk/nextjs";
import { LogOut, Settings, Loader2, UserRound } from "lucide-react";
import { refreshMerchantCreditBalance } from "@/app/actions/billing";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

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
  const { openUserProfile, signOut } = useClerk();
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
          <div className="flex items-center justify-center px-2 py-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
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

  return (
    <SidebarMenu>
      {!collapsed && account ? (
        <SidebarMenuItem>
          <Link
            href="/dashboard/billing"
            className="mb-2 flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent"
          >
            <span className="text-muted-foreground">Minutes left</span>
            <span className="font-semibold tabular-nums text-sidebar-foreground">
              {formatMinutes(minutes)}
            </span>
          </Link>
        </SidebarMenuItem>
      ) : null}

      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={`flex w-full items-center rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                collapsed ? "justify-center" : ""
              }`}
            >
              {collapsed ? (
                <UserRound className="h-4 w-4 text-sidebar-foreground" />
              ) : (
                <span className="min-w-0 leading-tight">
                  <span className="block break-words text-sm font-semibold text-sidebar-foreground">
                    {name}
                  </span>
                  {email ? (
                    <span className="mt-0.5 block break-all text-xs text-muted-foreground">
                      {email}
                    </span>
                  ) : null}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            sideOffset={8}
            className="w-64 p-1.5"
          >
            <div className="px-2.5 py-2">
              <p className="text-sm font-semibold leading-tight">{name}</p>
              {email ? (
                <p className="mt-1 break-all text-xs leading-snug text-muted-foreground">
                  {email}
                </p>
              ) : null}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={() => openUserProfile()}
            >
              <Settings />
              Manage account
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={() => signOut({ redirectUrl: "/sign-in" })}
            >
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
