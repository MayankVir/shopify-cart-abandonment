"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Mail, Trash2, UserMinus, UserPlus, Users } from "lucide-react";
import {
  acceptStoreInvite,
  createStoreInvite,
  declineStoreInvite,
  getStoreTeam,
  listPendingInvitesForMe,
  removeStoreMember,
  revokeStoreInvite,
  type PendingInviteForMeRow,
  type StoreTeamView,
} from "@/app/actions/store-team";
import { useAnalyticsStore } from "@/store/use-analytics-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

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
  onDone: () => void;
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
      onDone();
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

function PendingInvitesForMe() {
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

  if (isLoading) {
    return <Skeleton className="h-16 w-full rounded-lg" />;
  }

  if (invites.length === 0) return null;

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
          Someone invited you to help manage their store.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {invites.map((invite) => (
          <PendingInviteRow key={invite.id} invite={invite} onDone={load} />
        ))}
      </CardContent>
    </Card>
  );
}

function InviteForm({
  storeDomain,
  onInvited,
}: {
  storeDomain: string;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    startTransition(async () => {
      const result = await createStoreInvite(storeDomain, email.trim());
      if (!result.success) {
        toast.error(result.error ?? "Failed to send invite");
        return;
      }
      toast.success(`Invited ${email.trim()}`);
      setEmail("");
      onInvited();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <div className="min-w-[14rem] flex-1 space-y-1.5">
        <Label htmlFor="invite-email" className="text-xs">
          Invite by email
        </Label>
        <Input
          id="invite-email"
          type="email"
          placeholder="teammate@gmail.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isPending}
          required
        />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <UserPlus className="h-4 w-4" />
        )}
        Invite
      </Button>
    </form>
  );
}

function StoreTeamCard({ storeDomain }: { storeDomain: string }) {
  const [team, setTeam] = useState<StoreTeamView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, startTransition] = useTransition();

  const load = useCallback(() => {
    setIsLoading(true);
    getStoreTeam(storeDomain).then((result) => {
      setTeam(result);
      setIsLoading(false);
    });
  }, [storeDomain]);

  useEffect(() => {
    load();
  }, [load]);

  function handleRevoke(inviteId: string) {
    startTransition(async () => {
      const result = await revokeStoreInvite(inviteId);
      if (!result.success) {
        toast.error(result.error ?? "Failed to revoke invite");
        return;
      }
      toast.success("Invite revoked");
      load();
    });
  }

  function handleRemove(memberId: string) {
    startTransition(async () => {
      const result = await removeStoreMember(memberId);
      if (!result.success) {
        toast.error(result.error ?? "Failed to remove member");
        return;
      }
      toast.success("Member removed");
      load();
    });
  }

  if (isLoading) {
    return (
      <Card className="border-border/60">
        <CardContent className="space-y-3 p-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!team) {
    return (
      <Card className="border-border/60">
        <CardContent className="p-6 text-sm text-muted-foreground">
          You do not have access to manage this store&apos;s team.
        </CardContent>
      </Card>
    );
  }

  const isOwner = team.role === "owner" || team.role === "admin";

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base font-semibold">
            {team.storeName || storeDisplayName(team.storeDomain)}
          </CardTitle>
          <Badge variant={isOwner ? "default" : "muted"} className="capitalize">
            {team.role}
          </Badge>
        </div>
        <CardDescription className="text-xs">
          {isOwner
            ? "Invite teammates to help run recovery, NDRC, and analytics for this store."
            : `Owned by ${team.ownerEmail ?? "another account"}. You can use this store but cannot manage its team.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isOwner ? <InviteForm storeDomain={storeDomain} onInvited={load} /> : null}

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Members ({team.members.length + 1})
          </p>
          <div className="rounded-lg border border-border/70">
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="truncate font-medium">
                {team.ownerEmail ?? "Owner"}
              </span>
              <Badge variant="secondary">Owner</Badge>
            </div>
            {team.members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between gap-3 border-t border-border/70 px-4 py-2.5 text-sm"
              >
                <span className="truncate">{member.email}</span>
                {isOwner ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemove(member.id)}
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                    Remove
                  </Button>
                ) : (
                  <Badge variant="muted">Member</Badge>
                )}
              </div>
            ))}
          </div>
        </div>

        {isOwner && team.pendingInvites.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Sent invites ({team.pendingInvites.length})
            </p>
            <div className="rounded-lg border border-border/70">
              {team.pendingInvites.map((invite, index) => (
                <div
                  key={invite.id}
                  className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm ${
                    index > 0 ? "border-t border-border/70" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate">{invite.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {invite.isExpired
                        ? "Expired"
                        : formatRelativeExpiry(invite.expiresAt)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => handleRevoke(invite.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {invite.isExpired ? "Remove" : "Revoke"}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function TeamPanel() {
  const selectedStoreDomain = useAnalyticsStore((s) => s.selectedStoreDomain);

  return (
    <div className="space-y-6">
      <PendingInvitesForMe />

      {selectedStoreDomain ? (
        <StoreTeamCard storeDomain={selectedStoreDomain} />
      ) : (
        <Card className="border-border/60">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Connect or select a store to manage its team.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
