import { TeamPanel } from "@/components/dashboard/team-panel";

export default function TeamPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Team</h1>
        <p className="mt-1 text-muted-foreground">
          Invite teammates to a store, or accept invites sent to you
        </p>
      </div>

      <TeamPanel />
    </div>
  );
}
