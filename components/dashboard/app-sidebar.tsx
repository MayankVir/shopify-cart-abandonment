"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CreditCard,
  FileSpreadsheet,
  Home,
  ScrollText,
  Settings,
  Shield,
  ShoppingCart,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { isNavItemActive, useNavPending } from "@/components/dashboard/nav-pending";
import { Logo } from "@/components/logo";
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
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";

interface AppSidebarProps {
  showAdminLink?: boolean;
  hasWorkspace?: boolean;
  canSeeTeamAndDrafts?: boolean;
  onboardingSkipped?: boolean;
  account: SidebarAccountSummary | null;
  pendingInviteCount?: number;
}

const MAIN_NAV = [
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/recovery", label: "Recovery", icon: ShoppingCart },
  { href: "/dashboard/ndrc", label: "NDRC", icon: Truck },
  { href: "/dashboard/logs", label: "Logs", icon: ScrollText },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
] as const;

const SETUP_NAV = [
  { href: "/dashboard/onboarding", label: "Connect Store", icon: Settings },
] as const;

const LIMITED_NAV = [
  { href: "/dashboard/welcome", label: "Home", icon: Home },
  { href: "/dashboard/onboarding", label: "Connect Store", icon: Settings },
] as const;

const TEAM_NAV = [
  { href: "/dashboard/team", label: "Team", icon: Users },
  { href: "/dashboard/drafts", label: "Drafts", icon: FileSpreadsheet },
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

function SidebarBrandLink({ href }: { href: string }) {
  const { onClick } = usePendingNavClick(href);
  const { state } = useSidebar();

  return (
    <SidebarMenuButton
      size="lg"
      asChild
      tooltip="Custello"
      className="sidebar-brand h-auto overflow-visible py-2"
    >
      <Link href={href} prefetch onClick={onClick}>
        <Logo mark={state === "collapsed"} />
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
  badges,
}: {
  items: ReadonlyArray<{
    href: string;
    label: string;
    icon: LucideIcon;
  }>;
  badges?: Record<string, number>;
}) {
  return (
    <SidebarMenu>
      {items.map(({ href, label, icon }) => {
        const badge = badges?.[href];
        return (
          <SidebarMenuItem key={href}>
            <SidebarNavLink href={href} label={label} icon={icon} />
            {badge ? <SidebarMenuBadge>{badge}</SidebarMenuBadge> : null}
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

export function AppSidebar({
  showAdminLink = false,
  hasWorkspace = false,
  canSeeTeamAndDrafts = false,
  onboardingSkipped = false,
  account,
  pendingInviteCount = 0,
}: AppSidebarProps) {
  const locked = !hasWorkspace && !showAdminLink;
  const homeHref = locked
    ? onboardingSkipped
      ? "/dashboard/welcome"
      : "/dashboard/onboarding"
    : "/dashboard/recovery";
  const inviteBadges =
    pendingInviteCount > 0
      ? {
          "/dashboard/welcome": pendingInviteCount,
          "/dashboard/team": pendingInviteCount,
        }
      : undefined;

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarBrandLink href={homeHref} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {locked ? (
          <SidebarGroup>
            <SidebarGroupLabel>Get started</SidebarGroupLabel>
            <SidebarGroupContent>
              <NavItems
                items={
                  onboardingSkipped
                    ? LIMITED_NAV
                    : LIMITED_NAV.filter((item) => item.href !== "/dashboard/welcome")
                }
                badges={inviteBadges}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <>
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

            {canSeeTeamAndDrafts ? (
              <SidebarGroup>
                <SidebarGroupLabel>Workspace</SidebarGroupLabel>
                <SidebarGroupContent>
                  <NavItems items={TEAM_NAV} badges={inviteBadges} />
                </SidebarGroupContent>
              </SidebarGroup>
            ) : null}

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
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ) : null}
          </>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarSeparator />
        <SidebarUser account={account} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
