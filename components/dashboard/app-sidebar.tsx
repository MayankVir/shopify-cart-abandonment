"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CreditCard,
  Phone,
  Settings,
  Shield,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  showAdminLink?: boolean;
}

const NAV_ITEMS = [
  {
    href: "/dashboard/analytics",
    label: "Analytics",
    icon: BarChart3,
    description: "Calls & usage",
  },
  {
    href: "/dashboard/recovery",
    label: "Recovery",
    icon: ShoppingCart,
    description: "Abandoned carts",
  },
  {
    href: "/dashboard/billing",
    label: "Billing",
    icon: CreditCard,
    description: "Minutes consumed",
  },
  {
    href: "/dashboard/onboarding",
    label: "Connect Store",
    icon: Settings,
    description: "Shopify setup",
  },
] as const;

export function AppSidebar({ showAdminLink = false }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card/40">
      <div className="flex h-16 items-center gap-3 border-b border-border px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
          <Phone className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <Link
            href="/dashboard/analytics"
            className="block truncate text-sm font-semibold tracking-tight"
          >
            Cart Recovery IVR
          </Link>
          <p className="truncate text-xs text-muted-foreground">Voice platform</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon, description }) => {
          const active =
            pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{label}</p>
                <p className="truncate text-xs opacity-80">{description}</p>
              </div>
            </Link>
          );
        })}

        {showAdminLink && (
          <Link
            href="/dashboard/admin"
            className={cn(
              "flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors",
              pathname.startsWith("/dashboard/admin")
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <Shield className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium">Admin</p>
              <p className="truncate text-xs opacity-80">Platform settings</p>
            </div>
          </Link>
        )}
      </nav>
    </aside>
  );
}
