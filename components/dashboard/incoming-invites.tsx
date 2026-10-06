"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import {
  acceptStoreInvite,
  declineStoreInvite,
  listPendingInvitesForMe,
  type PendingInviteForMeRow,
} from "@/app/actions/store-team";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InlineSpinner } from "@/components/dashboard/page-spinner";

function storeDisplayName(domain: string): string {
  return domain.replace(/\.myshopify\.com$/i, "") || domain;
}

function formatRelativeExpiry(expiresAtIso: string): string {
  const diffMs = new Date(expiresAtIso).getTime() - Date.now();
  if (diffMs <= 0) return "Expired";
  const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  if (days <= 1) return "Expires today";
  return `Expires in ${days} days`;
}

function PendingInviteRow({
  invite,
  onDone,
}: {
  invite: PendingInviteForMeRow;
  onDone: (accepted: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();

  function respond(action: "accept" | "decline") {
    startTransition(async () => {
      const result =
        action === "accept"
          ? await acceptStoreInvite(invite.id)
          : await declineStoreInvite(invite.id);

      if (!result.success) {
        toast.error(result.error ?? "Something went wrong");
        return;
      }

      toast.success(
        action === "accept"
          ? `You now have access to ${storeDisplayName(invite.storeDomain)}`
          : "Invite declined"
      );
      onDone(action === "accept");
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {invite.storeName || storeDisplayName(invite.storeDomain)}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {invite.invitedByEmail
            ? `Invited by ${invite.invitedByEmail}`
            : "Invited to collaborate"}{" "}
          · {formatRelativeExpiry(invite.expiresAt)}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => respond("decline")}
        >
          Decline
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={isPending}
          onClick={() => respond("accept")}
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Accept
        </Button>
      </div>
    </div>
  );
}

export function IncomingInvites({
  showEmpty = false,
  continueHref = "/dashboard/recovery",
}: {
  showEmpty?: boolean;
  continueHref?: string;
}) {
  const router = useRouter();
  const [invites, setInvites] = useState<PendingInviteForMeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(() => {
    listPendingInvitesForMe().then((rows) => {
      setInvites(rows);
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleDone(accepted: boolean) {
    if (accepted) {
      router.refresh();
      router.push(continueHref);
      return;
    }
    load();
    router.refresh();
  }

  if (isLoading) {
    return <InlineSpinner />;
  }

  if (invites.length === 0) {
    if (!showEmpty) return null;
    return (
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">Team invites</CardTitle>
          </div>
          <CardDescription className="text-xs">
            When a store owner invites this email, the invite shows up here.
            Accepting it opens the rest of the workspace.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base font-semibold">
            Pending invites for you
          </CardTitle>
          <Badge variant="info">{invites.length}</Badge>
        </div>
        <CardDescription className="text-xs">
          Accept an invite to open analytics, recovery, logs, and billing for that store.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {invites.map((invite) => (
          <PendingInviteRow key={invite.id} invite={invite} onDone={handleDone} />
        ))}
      </CardContent>
    </Card>
  );
}
