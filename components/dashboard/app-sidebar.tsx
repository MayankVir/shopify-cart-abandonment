"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CreditCard,
  FileSpreadsheet,
  Phone,
  Settings,
  Shield,
  ShoppingCart,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { isNavItemActive, useNavPending } from "@/components/dashboard/nav-pending";
import { SidebarUser, type SidebarAccountSummary } from "@/components/dashboard/sidebar-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";

interface AppSidebarProps {
  showAdminLink?: boolean;
  account: SidebarAccountSummary | null;
}

const MAIN_NAV = [
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/recovery", label: "Recovery", icon: ShoppingCart },
  { href: "/dashboard/ndrc", label: "NDRC", icon: Truck },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
] as const;

const SETUP_NAV = [
  { href: "/dashboard/onboarding", label: "Connect Store", icon: Settings },
] as const;

function usePendingNavClick(href: string) {
  const pathname = usePathname();
  const { pendingHref, setPendingHref } = useNavPending();

  return {
    isActive: isNavItemActive(pathname, pendingHref, href),
    onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      ) {
        return;
      }
      if (pathname !== href) setPendingHref(href);
    },
  };
}

function SidebarBrandLink() {
  const { onClick } = usePendingNavClick("/dashboard/recovery");

  return (
    <SidebarMenuButton size="lg" asChild tooltip="Recovery">
      <Link href="/dashboard/recovery" prefetch onClick={onClick}>
        <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <Phone className="size-4" />
        </div>
        <div className="grid flex-1 text-left text-sm leading-tight">
          <span className="truncate font-semibold">Cart Recovery IVR</span>
          <span className="truncate text-xs text-sidebar-foreground/60">
            Voice platform
          </span>
        </div>
      </Link>
    </SidebarMenuButton>
  );
}

function SidebarNavLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
}) {
  const { isActive, onClick } = usePendingNavClick(href);

  return (
    <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
      <Link href={href} prefetch onClick={onClick}>
        <Icon />
        <span>{label}</span>
      </Link>
    </SidebarMenuButton>
  );
}

function NavItems({
  items,
}: {
  items: ReadonlyArray<{
    href: string;
    label: string;
    icon: LucideIcon;
  }>;
}) {
  return (
    <SidebarMenu>
      {items.map(({ href, label, icon }) => (
        <SidebarMenuItem key={href}>
          <SidebarNavLink href={href} label={label} icon={icon} />
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

export function AppSidebar({ showAdminLink = false, account }: AppSidebarProps) {
  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarBrandLink />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <NavItems items={MAIN_NAV} />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Setup</SidebarGroupLabel>
          <SidebarGroupContent>
            <NavItems items={SETUP_NAV} />
          </SidebarGroupContent>
        </SidebarGroup>

        {showAdminLink ? (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarNavLink
                    href="/dashboard/admin"
                    label="Admin"
                    icon={Shield}
                  />
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarNavLink
                    href="/dashboard/drafts"
                    label="Drafts"
                    icon={FileSpreadsheet}
                  />
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter>
        <SidebarSeparator />
        <SidebarUser account={account} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
