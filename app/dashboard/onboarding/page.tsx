import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { AutomaticConnectForm } from "@/components/onboarding/automatic-connect-form";
import { ManualSetupForm } from "@/components/onboarding/manual-setup-form";

export default function OnboardingPage({
  searchParams,
}: {
  searchParams?: { store?: string; tab?: string };
}) {
  const defaultTab =
    searchParams?.tab === "automatic"
      ? "automatic"
      : searchParams?.tab === "manual" || searchParams?.store
        ? "manual"
        : "automatic";

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Connect Your Store</h1>
        <p className="mt-1 text-muted-foreground">
          Choose automatic OAuth or manual token setup to begin recovering abandoned carts
        </p>
      </div>

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
    </div>
  );
}
