"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { Phone, LayoutDashboard, Settings, Shield } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface AppHeaderProps {
  showAdminLink?: boolean;
}

export function AppHeader({ showAdminLink = false }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-page items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
            <Phone className="h-4 w-4 text-primary" />
          </div>
          <div>
            <Link href="/dashboard" className="text-sm font-semibold tracking-tight">
              Cart Recovery IVR
            </Link>
            <p className="text-xs text-muted-foreground">Live Analytics Platform</p>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Dashboard
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/onboarding?tab=manual">
              <Settings className="mr-2 h-4 w-4" />
              Connect Store
            </Link>
          </Button>
          {showAdminLink && (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin">
                <Shield className="mr-2 h-4 w-4" />
                Admin
              </Link>
            </Button>
          )}
          <Separator orientation="vertical" className="mx-2 h-6" />
          <ThemeToggle />
          <UserButton afterSignOutUrl="/sign-in" />
        </nav>
      </div>
    </header>
  );
}
