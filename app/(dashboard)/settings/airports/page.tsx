import { requireAdmin } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import type { Airport } from "@/lib/types/database";
import { AirportDialog } from "./airport-dialog";
import { deleteAirport } from "./actions";
import { ConfirmButton } from "@/components/confirm-button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default async function AirportsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: airports } = await supabase
    .from("airports")
    .select("*")
    .order("code");

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Airports</h1>
        <AirportDialog />
      </div>
      <Table className="mt-4">
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>City</TableHead>
            <TableHead>Country</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(airports as Airport[] | null)?.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-medium">{a.code}</TableCell>
              <TableCell>{a.name}</TableCell>
              <TableCell>{a.city}</TableCell>
              <TableCell>{a.country}</TableCell>
              <TableCell className="space-x-2 text-right">
                <AirportDialog airport={a} />
                <ConfirmButton
                  action={deleteAirport.bind(null, a.id)}
                  label="Delete"
                  confirmTitle={`Delete ${a.code}?`}
                  confirmText="Airports used by existing flights cannot be deleted."
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
