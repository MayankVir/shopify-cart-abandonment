"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";
import {
  saveManualStoreConfig,
  getStoreDomainsForManualSetup,
  getManualStoreConfig,
} from "@/app/actions/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ManualSetupFormProps {
  initialStoreDomain?: string;
}

const EMPTY_FORM = {
  storeDomain: "",
  apiKey: "",
  apiSecret: "",
  storefrontToken: "",
};

export function ManualSetupForm({ initialStoreDomain }: ManualSetupFormProps) {
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(true);
  const [storeDomains, setStoreDomains] = useState<string[]>([]);
  const [selectedDomain, setSelectedDomain] = useState(initialStoreDomain ?? "");
  const [form, setForm] = useState(EMPTY_FORM);
  const [isEditing, setIsEditing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let active = true;

    async function load() {
      setIsLoading(true);
      const domains = await getStoreDomainsForManualSetup();
      if (!active) return;

      setStoreDomains(domains);
      const domainToLoad =
        initialStoreDomain ??
        selectedDomain ??
        domains[0] ??
        "";

      if (domainToLoad) {
        setSelectedDomain(domainToLoad);
        const config = await getManualStoreConfig(domainToLoad);
        if (!active) return;

        if (config) {
          setForm(config);
          setIsEditing(true);
        }
      }

      setIsLoading(false);
    }

    load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount / initial domain
  }, [initialStoreDomain]);

  async function loadStoreConfig(domain: string) {
    setIsLoading(true);
    setSelectedDomain(domain);

    if (!domain) {
      setForm(EMPTY_FORM);
      setIsEditing(false);
      setIsLoading(false);
      return;
    }

    const config = await getManualStoreConfig(domain);
    if (config) {
      setForm(config);
      setIsEditing(true);
    } else {
      setForm({ ...EMPTY_FORM, storeDomain: domain });
      setIsEditing(false);
    }
    setIsLoading(false);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData();
    formData.set("storeDomain", form.storeDomain);
    formData.set("apiKey", form.apiKey);
    formData.set("apiSecret", form.apiSecret);
    formData.set("storefrontToken", form.storefrontToken);

    startTransition(async () => {
      const result = await saveManualStoreConfig(formData);

      if (!result.success) {
        toast.error(result.error ?? "Failed to save configuration");
        return;
      }

      if (result.linkedAlternateDomains?.length) {
        toast.success(
          `Store connected. Auto-linked webhook domain${result.linkedAlternateDomains.length > 1 ? "s" : ""}: ${result.linkedAlternateDomains.join(", ")}`
        );
      } else {
        toast.success(
          isEditing
            ? `Store ${result.storeDomain} updated`
            : `Store ${result.storeDomain} connected successfully`
        );
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  function updateField(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          Secure Manual Setup
        </CardTitle>
        <CardDescription>
          {isEditing
            ? "Update saved credentials or switch stores below. Use the eye icon to reveal values."
            : "Create a Custom App in Shopify Admin → Settings → Apps → Develop apps. Copy credentials below."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {storeDomains.length > 0 && (
          <div className="mb-4 space-y-2">
            <Label>Saved store</Label>
            <Select
              value={selectedDomain || undefined}
              onValueChange={(value) => loadStoreConfig(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a connected store" />
              </SelectTrigger>
              <SelectContent>
                {storeDomains.map((domain) => (
                  <SelectItem key={domain} value={domain}>
                    {domain}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading saved credentials…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="manual-domain">Store Domain</Label>
              <Input
                id="manual-domain"
                name="storeDomain"
                value={form.storeDomain}
                onChange={(e) => updateField("storeDomain", e.target.value)}
                placeholder="your-store.myshopify.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-key">Client ID (Dev Dashboard)</Label>
              <PasswordInput
                id="api-key"
                name="apiKey"
                value={form.apiKey}
                onChange={(e) => updateField("apiKey", e.target.value)}
                placeholder="901f92c6..."
                required
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-secret">Client Secret (shpss_)</Label>
              <PasswordInput
                id="api-secret"
                name="apiSecret"
                value={form.apiSecret}
                onChange={(e) => updateField("apiSecret", e.target.value)}
                placeholder="shpss_..."
                required
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Used for client-credentials token exchange — Admin API access is obtained
                automatically (short-lived, cached on the server). For{" "}
                <strong>Settings → Notifications</strong> webhooks, webhook HMAC may use a
                different signing key at the bottom of that page.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="storefront-token">
                Storefront Public API Token (optional)
              </Label>
              <PasswordInput
                id="storefront-token"
                name="storefrontToken"
                value={form.storefrontToken}
                onChange={(e) => updateField("storefrontToken", e.target.value)}
                placeholder="Only needed for poll/webhook cart rebuild"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Not required for Google Sheet + draft order recovery. Leave empty if you only
                sync from a sheet and create draft orders on call.
              </p>
            </div>
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : isEditing ? (
                "Update & Connect"
              ) : (
                "Save & Connect"
              )}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
