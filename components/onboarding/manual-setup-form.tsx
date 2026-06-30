"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";
import {
  saveManualStoreConfig,
  lookupShopAlternateDomains,
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
  alternateShopDomains: "",
  apiKey: "",
  apiSecret: "",
  adminAccessToken: "",
  storefrontToken: "",
};

export function ManualSetupForm({ initialStoreDomain }: ManualSetupFormProps) {
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(true);
  const [storeDomains, setStoreDomains] = useState<string[]>([]);
  const [selectedDomain, setSelectedDomain] = useState(initialStoreDomain ?? "");
  const [form, setForm] = useState(EMPTY_FORM);
  const [isEditing, setIsEditing] = useState(false);
  const [isLookingUpDomains, setIsLookingUpDomains] = useState(false);
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

  function updateField(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleStoreDomainBlur() {
    const hasClientCreds = Boolean(form.apiKey.trim() && form.apiSecret.trim());
    const hasShpat = form.adminAccessToken.startsWith("shpat_");
    if (!form.storeDomain.trim() || (!hasClientCreds && !hasShpat)) {
      return;
    }

    setIsLookingUpDomains(true);
    try {
      const result = await lookupShopAlternateDomains(form.storeDomain, {
        apiKey: form.apiKey,
        apiSecret: form.apiSecret,
        adminAccessToken: form.adminAccessToken,
      });
      if (result.error) return;
      if (result.domains.length === 0) return;

      updateField("alternateShopDomains", result.domains.join(", "));
      toast.info(
        `Found webhook domain${result.domains.length > 1 ? "s" : ""}: ${result.domains.join(", ")}`
      );
    } finally {
      setIsLookingUpDomains(false);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData();
    formData.set("storeDomain", form.storeDomain);
    formData.set("alternateShopDomains", form.alternateShopDomains);
    formData.set("apiKey", form.apiKey);
    formData.set("apiSecret", form.apiSecret);
    formData.set("adminAccessToken", form.adminAccessToken);
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
                onBlur={() => void handleStoreDomainBlur()}
                placeholder="your-store.myshopify.com"
                required
              />
              {isLookingUpDomains && (
                <p className="text-xs text-muted-foreground">Looking up Shopify domains…</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="alternate-domains">Alternate shop domains (optional)</Label>
              <Input
                id="alternate-domains"
                name="alternateShopDomains"
                value={form.alternateShopDomains}
                onChange={(e) => updateField("alternateShopDomains", e.target.value)}
                placeholder="Auto-filled from Shopify when you save"
              />
              <p className="text-xs text-muted-foreground">
                Filled automatically from Shopify when you save (or tab out of Store Domain if{" "}
                <code>shpat_</code> is set). Shopify may webhook as{" "}
                <code>ya0v1y-eg.myshopify.com</code> even when your primary is{" "}
                <code>mayankvirmanitest.myshopify.com</code>.
              </p>
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
                Used for <strong>polling</strong> (client-credentials token exchange). For{" "}
                <strong>Settings → Notifications</strong> webhooks, webhook HMAC may use a
                different signing key at the bottom of that page.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-token">Admin Access Token (shpat_, optional)</Label>
              <PasswordInput
                id="admin-token"
                name="adminAccessToken"
                value={form.adminAccessToken}
                onChange={(e) => updateField("adminAccessToken", e.target.value)}
                placeholder="Leave empty — polling uses Client ID + shpss_"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Optional. If empty, polling exchanges Client ID + <code>shpss_</code> for a
                short-lived Admin token (~24h, cached in memory on the server).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="storefront-token">Storefront Public API Token</Label>
              <PasswordInput
                id="storefront-token"
                name="storefrontToken"
                value={form.storefrontToken}
                onChange={(e) => updateField("storefrontToken", e.target.value)}
                placeholder="Public storefront access token"
                required
                autoComplete="off"
              />
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
