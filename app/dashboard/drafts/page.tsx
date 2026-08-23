import { requireAdmin } from "@/lib/admin-gate";
import { DraftSheetPanel } from "@/components/dashboard/draft-sheet-panel";

export default async function DraftsPage() {
  await requireAdmin();
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
