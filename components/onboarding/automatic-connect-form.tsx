"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Loader2 } from "lucide-react";
import { initiateOAuthConnect } from "@/app/actions/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AutomaticConnectForm() {
  const [storeDomain, setStoreDomain] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    startTransition(async () => {
      const result = await initiateOAuthConnect(storeDomain);

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      router.push(result.redirectUrl);
    });
  }

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Automatic Connect
        </CardTitle>
        <CardDescription>
          Connect your Shopify store via OAuth. You will be redirected to Shopify to authorize access.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="oauth-domain">Shopify Store Domain</Label>
            <Input
              id="oauth-domain"
              placeholder="your-store.myshopify.com"
              value={storeDomain}
              onChange={(e) => setStoreDomain(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Redirecting…
              </>
            ) : (
              "Connect via OAuth"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
