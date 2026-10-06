import Link from "next/link";
import { IncomingInvites } from "@/components/dashboard/incoming-invites";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function WelcomePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">You&apos;re in</h1>
        <p className="mt-1 text-muted-foreground">
          Analytics, recovery, logs, and billing stay hidden until you connect
          a store or accept a team invite.
        </p>
      </div>

      <IncomingInvites showEmpty />

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Connect your own store</CardTitle>
          <CardDescription>
            You can come back to this whenever you have Shopify access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/dashboard/onboarding">Connect store</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
