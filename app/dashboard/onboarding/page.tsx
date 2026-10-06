import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { IncomingInvites } from "@/components/dashboard/incoming-invites";
import { AutomaticConnectForm } from "@/components/onboarding/automatic-connect-form";
import { ManualSetupForm } from "@/components/onboarding/manual-setup-form";
import { ConnectionSuccess } from "@/components/onboarding/connection-success";
import { SkipOnboardingButton } from "@/components/onboarding/skip-onboarding-button";
import { getDashboardAccess } from "@/lib/dashboard-access";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: { store?: string; tab?: string; connected?: string; shop?: string };
}) {
  const defaultTab =
    searchParams?.tab === "automatic"
      ? "automatic"
      : searchParams?.tab === "manual" || searchParams?.store
        ? "manual"
        : "automatic";

  const justConnectedShop =
    searchParams?.connected === "1" ? searchParams?.shop : undefined;
  const access = await getDashboardAccess();
  const showSkip = Boolean(
    access && !access.hasWorkspace && !access.onboardingSkipped && !access.isPlatformAdmin
  );

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Connect Your Store</h1>
        <p className="mt-1 text-muted-foreground">
          Choose automatic OAuth or manual token setup to begin recovering abandoned carts
        </p>
      </div>

      {justConnectedShop ? (
        <ConnectionSuccess shopDomain={justConnectedShop} />
      ) : (
        <>
          <IncomingInvites />
          <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="automatic">Automatic Connect</TabsTrigger>
              <TabsTrigger value="manual">Secure Manual Setup</TabsTrigger>
            </TabsList>
            <TabsContent value="automatic" className="mt-6">
              <AutomaticConnectForm />
            </TabsContent>
            <TabsContent value="manual" className="mt-6">
              <ManualSetupForm initialStoreDomain={searchParams?.store} />
            </TabsContent>
          </Tabs>
          {showSkip ? (
            <div className="flex flex-col items-center gap-2 border-t border-border/60 pt-6 text-center">
              <p className="max-w-md text-sm text-muted-foreground">
                Joining a team instead? Skip this and accept the invite when it
                arrives. The rest of the sidebar stays hidden until then.
              </p>
              <SkipOnboardingButton />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
