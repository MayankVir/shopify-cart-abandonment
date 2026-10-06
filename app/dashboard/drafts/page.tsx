import { DraftSheetPanel } from "@/components/dashboard/draft-sheet-panel";
import { requireTeamAndDrafts } from "@/lib/dashboard-access";

export default async function DraftsPage() {
  await requireTeamAndDrafts();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Drafts</h1>
        <p className="mt-1 text-muted-foreground">
          Read a sheet, create Shopify draft orders, and write IDs plus context
          back. No calls are placed.
        </p>
      </div>
      <DraftSheetPanel />
    </div>
  );
}
