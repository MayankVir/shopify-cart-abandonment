"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  adminGetBillingConfig,
  adminGrantExtraMinutes,
  adminListCreditGrants,
  adminSearchMerchants,
  adminUpdateBillingConfig,
} from "@/app/actions/admin-billing";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function AdminBillingSettings() {
  const [rate, setRate] = useState("0.08");
  const [freeMinutes, setFreeMinutes] = useState("25");
  const [maxGrant, setMaxGrant] = useState("500");
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    adminGetBillingConfig().then((config) => {
      setRate(String(config.ratePerMinuteUsd));
      setFreeMinutes(String(config.freeMinutesOnSignup));
      setMaxGrant(String(config.maxGrantPerAction));
      setIsLoading(false);
    });
  }, []);

  function handleSave() {
    startTransition(async () => {
      const result = await adminUpdateBillingConfig({
        ratePerMinuteUsd: Number(rate),
        freeMinutesOnSignup: Number(freeMinutes),
        maxGrantPerAction: Number(maxGrant),
      });
      if (!result.success) {
        toast.error(result.error ?? "Failed to save billing settings");
        return;
      }
      toast.success("Billing settings updated");
    });
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing Settings</CardTitle>
        <CardDescription>
          Platform-wide rate and signup grant configuration
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="rate">Rate per minute (USD)</Label>
          <Input
            id="rate"
            type="number"
            step="0.01"
            min="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="freeMinutes">Free minutes on signup</Label>
          <Input
            id="freeMinutes"
            type="number"
            min="0"
            value={freeMinutes}
            onChange={(e) => setFreeMinutes(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maxGrant">Max grant per admin action</Label>
          <Input
            id="maxGrant"
            type="number"
            min="1"
            value={maxGrant}
            onChange={(e) => setMaxGrant(e.target.value)}
          />
        </div>
        <div className="sm:col-span-3">
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminGrantMinutes() {
  const [query, setQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedEmail, setSelectedEmail] = useState("");
  const [minutes, setMinutes] = useState("10");
  const [reason, setReason] = useState("");
  const [results, setResults] = useState<
    Awaited<ReturnType<typeof adminSearchMerchants>>
  >([]);
  const [isPending, startTransition] = useTransition();

  function handleSearch() {
    startTransition(async () => {
      const merchants = await adminSearchMerchants(query);
      setResults(merchants);
    });
  }

  function handleGrant() {
    if (!selectedUserId) {
      toast.error("Select a merchant first");
      return;
    }
    startTransition(async () => {
      const result = await adminGrantExtraMinutes({
        clerkUserId: selectedUserId,
        minutes: Number(minutes),
        reason,
      });
      if (!result.success) {
        toast.error(result.error ?? "Grant failed");
        return;
      }
      toast.success(`Granted ${minutes} minutes to ${selectedEmail || selectedUserId}`);
      setReason("");
      handleSearch();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Grant Extra Minutes</CardTitle>
        <CardDescription>
          Add IVR minutes to any merchant account (shared across all their stores)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Search by email or user ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-sm"
          />
          <Button variant="secondary" onClick={handleSearch} disabled={isPending}>
            Search
          </Button>
        </div>

        {results.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Stores</TableHead>
                  <TableHead>Balance (min)</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((merchant) => (
                  <TableRow key={merchant.clerkUserId}>
                    <TableCell>{merchant.email ?? merchant.clerkUserId}</TableCell>
                    <TableCell>{merchant.storeCount}</TableCell>
                    <TableCell>
                      {merchant.creditBalanceMinutes ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant={
                          selectedUserId === merchant.clerkUserId
                            ? "default"
                            : "outline"
                        }
                        onClick={() => {
                          setSelectedUserId(merchant.clerkUserId);
                          setSelectedEmail(merchant.email ?? "");
                        }}
                      >
                        Select
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="grantMinutes">Minutes to grant</Label>
            <Input
              id="grantMinutes"
              type="number"
              min="1"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="grantReason">Reason (required)</Label>
            <Input
              id="grantReason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Support gesture, promo campaign"
            />
          </div>
        </div>
        <Button onClick={handleGrant} disabled={isPending || !selectedUserId}>
          Grant minutes
        </Button>
      </CardContent>
    </Card>
  );
}

export function AdminGrantHistory() {
  const [grants, setGrants] = useState<
    Awaited<ReturnType<typeof adminListCreditGrants>>["grants"]
  >([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    adminListCreditGrants().then((data) => {
      setGrants(data.grants);
      setIsLoading(false);
    });
  }, []);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Grant History</CardTitle>
        <CardDescription>Audit log of signup and admin minute grants</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Merchant</TableHead>
              <TableHead>Minutes</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grants.map((grant) => (
              <TableRow key={grant.id}>
                <TableCell>
                  {new Date(grant.createdAt).toLocaleString()}
                </TableCell>
                <TableCell>{grant.email ?? grant.clerkUserId}</TableCell>
                <TableCell>{grant.minutesGranted}</TableCell>
                <TableCell className="max-w-xs truncate">{grant.reason}</TableCell>
                <TableCell>{grant.grantedByEmail}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
