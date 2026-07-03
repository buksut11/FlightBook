import { requireAdmin } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import type { Aircraft } from "@/lib/types/database";
import { AircraftDialog } from "./aircraft-dialog";
import { deleteAircraft } from "./actions";
import { ConfirmButton } from "@/components/confirm-button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default async function AircraftPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: fleet } = await supabase.from("aircraft").select("*").order("model");

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Aircraft</h1>
        <AircraftDialog />
      </div>
      <Table className="mt-4">
        <TableHeader>
          <TableRow>
            <TableHead>Model</TableHead>
            <TableHead>Registration</TableHead>
            <TableHead>Economy</TableHead>
            <TableHead>Business</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(fleet as Aircraft[] | null)?.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-medium">{a.model}</TableCell>
              <TableCell>{a.registration ?? "—"}</TableCell>
              <TableCell>{a.seats_economy_default}</TableCell>
              <TableCell>{a.seats_business_default}</TableCell>
              <TableCell className="space-x-2 text-right">
                <AircraftDialog aircraft={a} />
                <ConfirmButton
                  action={deleteAircraft.bind(null, a.id)}
                  label="Delete"
                  confirmTitle={`Delete ${a.model}?`}
                  confirmText="Aircraft used by existing flights cannot be deleted."
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
