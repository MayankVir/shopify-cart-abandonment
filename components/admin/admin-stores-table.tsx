"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { updateStoreTtaiBindings } from "@/app/actions/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AdminStoreRow {
  id: string;
  storeDomain: string;
  ttaiScenarioId: string | null;
  ttaiTrunkId: string | null;
  createdAt: Date;
  _count: { checkouts: number };
}

interface AdminStoresTableProps {
  stores: AdminStoreRow[];
}

export function AdminStoresTable({ stores }: AdminStoresTableProps) {
  const [isPending, startTransition] = useTransition();

  function handleUpdate(storeDomain: string, form: HTMLFormElement) {
    const formData = new FormData(form);
    const ttaiScenarioId = String(formData.get("ttaiScenarioId") ?? "");
    const ttaiTrunkId = String(formData.get("ttaiTrunkId") ?? "");

    startTransition(async () => {
      const result = await updateStoreTtaiBindings(
        storeDomain,
        ttaiScenarioId,
        ttaiTrunkId,
      );

      if (!result.success) {
        toast.error(result.error ?? "Update failed");
        return;
      }

      toast.success(`Updated TTAI bindings for ${storeDomain}`);
    });
  }

  if (stores.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-16 text-center text-muted-foreground">
        No registered stores yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Store Domain</TableHead>
            <TableHead>Checkouts</TableHead>
            <TableHead>TTAI Scenario ID</TableHead>
            <TableHead>TTAI Trunk ID</TableHead>
            <TableHead className="w-[120px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stores.map((store) => (
            <TableRow key={store.id}>
              <TableCell className="font-medium">{store.storeDomain}</TableCell>
              <TableCell>{store._count.checkouts}</TableCell>
              <TableCell colSpan={2}>
                <form
                  id={`form-${store.id}`}
                  className="grid gap-2 sm:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleUpdate(store.storeDomain, e.currentTarget);
                  }}
                >
                  <Input
                    name="ttaiScenarioId"
                    defaultValue={store.ttaiScenarioId ?? ""}
                    placeholder="Scenario ID"
                  />
                  <Input
                    name="ttaiTrunkId"
                    defaultValue={store.ttaiTrunkId ?? ""}
                    placeholder="Trunk ID"
                  />
                </form>
              </TableCell>
              <TableCell>
                <Button
                  type="submit"
                  form={`form-${store.id}`}
                  size="sm"
                  disabled={isPending}
                >
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Save"
                  )}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
